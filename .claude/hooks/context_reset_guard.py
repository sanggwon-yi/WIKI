#!/usr/bin/env python3
"""세션 컨텍스트가 임계값(기본 400,000 토큰)에 도달하면 리셋(/clear)을 유도하는 훅.

훅은 /clear를 직접 실행할 수 없으므로 다음 흐름으로 동작한다.
  1) check  (UserPromptSubmit, PostToolUse)
     트랜스크립트의 마지막 메인 assistant 메시지 usage로 현재 컨텍스트 크기를 계산한다.
     임계값 이상이면 Claude에게 인계 노트(.claude/handoff.md) 작성을 지시하고,
     사용자에게 /clear 실행을 안내한다. CONTEXT_RESET_BLOCK=1 이면 새 프롬프트를 차단한다.
  2) restore (SessionStart, matcher "clear")
     /clear 직후 인계 노트를 새 세션 컨텍스트로 주입하고 handoff.used.md로 보관한다.

환경변수:
  CONTEXT_RESET_THRESHOLD  임계 토큰 수 (기본 400000)
  CONTEXT_RESET_BLOCK      1이면 임계 초과 후 사용자 프롬프트 차단 (기본 0)
"""
import json
import os
import sys
import time

THRESHOLD = int(os.environ.get("CONTEXT_RESET_THRESHOLD", "400000"))
BLOCK = os.environ.get("CONTEXT_RESET_BLOCK", "0") == "1"
TAIL_BYTES = 4 * 1024 * 1024


def project_dir(payload):
    return os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()


def context_tokens(transcript_path):
    """마지막 메인 스레드 assistant 메시지의 입력 측 토큰 합계(= 현재 컨텍스트 크기)."""
    if not transcript_path or not os.path.isfile(transcript_path):
        return 0
    with open(transcript_path, "rb") as f:
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(max(0, size - TAIL_BYTES))
        lines = f.read().decode("utf-8", "ignore").splitlines()
    for line in reversed(lines):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") != "assistant" or e.get("isSidechain"):
            continue
        u = (e.get("message") or {}).get("usage") or {}
        total = (u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
                 + u.get("cache_read_input_tokens", 0) + u.get("output_tokens", 0))
        if total:
            return total
    return 0


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.exit(0)


def handoff_instruction(tokens, handoff):
    return (
        f"[context-reset-guard] 현재 세션 컨텍스트가 약 {tokens:,} 토큰으로 "
        f"임계값 {THRESHOLD:,} 토큰을 넘었다. 새 작업을 시작하지 말고: "
        f"(1) 진행 중인 단계를 안전한 지점에서 마무리하고, "
        f"(2) {handoff} 파일에 인계 노트(목표, 완료한 일, 남은 일, 핵심 파일 경로, 결정 사항, 주의점)를 작성한 뒤, "
        f"(3) 사용자에게 /clear 를 실행해 세션을 리셋하라고 안내하라. "
        f"/clear 후 인계 노트는 자동으로 새 세션에 주입된다."
    )


def check(payload):
    event = payload.get("hook_event_name", "")
    tokens = context_tokens(payload.get("transcript_path"))
    if tokens < THRESHOLD:
        sys.exit(0)

    pdir = project_dir(payload)
    handoff = os.path.join(pdir, ".claude", "handoff.md")
    state_dir = os.path.join(pdir, ".claude", ".context-guard")
    os.makedirs(state_dir, exist_ok=True)
    marker = os.path.join(state_dir, f"{payload.get('session_id', 'unknown')}.notified")

    if event == "PostToolUse":
        # 도구 호출마다 반복 주입하지 않도록 세션당 1회만 알린다.
        if os.path.exists(marker):
            sys.exit(0)
        open(marker, "w").close()
        emit({
            "systemMessage": f"⚠️ 컨텍스트 {tokens:,} 토큰 ≥ {THRESHOLD:,}: 인계 노트 작성 후 /clear 권장",
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": handoff_instruction(tokens, handoff),
            },
        })

    if event == "UserPromptSubmit":
        msg = f"⚠️ 세션 컨텍스트 {tokens:,} 토큰 ≥ {THRESHOLD:,}. /clear 로 리셋하세요 (인계 노트는 자동 로드)."
        if BLOCK and os.path.exists(handoff):
            emit({"decision": "block", "reason": msg})
        open(marker, "w").close()
        emit({
            "systemMessage": msg,
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": handoff_instruction(tokens, handoff),
            },
        })
    sys.exit(0)


def restore(payload):
    pdir = project_dir(payload)
    handoff = os.path.join(pdir, ".claude", "handoff.md")
    if not os.path.isfile(handoff):
        sys.exit(0)
    with open(handoff, encoding="utf-8") as f:
        note = f.read().strip()
    archived = os.path.join(pdir, ".claude", f"handoff.used-{time.strftime('%Y%m%d-%H%M%S')}.md")
    os.replace(handoff, archived)
    if not note:
        sys.exit(0)
    emit({
        "systemMessage": f"이전 세션 인계 노트를 불러왔습니다 ({os.path.basename(archived)})",
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": "[context-reset-guard] 이전 세션(컨텍스트 리셋 전)의 인계 노트:\n\n" + note,
        },
    })


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        payload = {}
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "restore":
        restore(payload)
    else:
        check(payload)


if __name__ == "__main__":
    main()
