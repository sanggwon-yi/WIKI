// MOCK=1 일 때 사용하는 가짜 응답. API 키 없이 UI와 흐름만 확인하기 위한 것이며,
// 내용은 실제 조사 결과가 아님을 본문에 명시한다.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mockCall(agent, { system, messages }) {
  await wait(400 + Math.random() * 600);
  const last = messages[messages.length - 1]?.content || '';
  if (/JSON/.test(system) && /계획/.test(system)) {
    return {
      text: JSON.stringify({
        summary: '(MOCK) 질문을 두 갈래로 나눴습니다.',
        claude_tasks: ['(MOCK) 개념과 배경 정리'],
        gemini_tasks: ['(MOCK) 최신 동향·수치 검색'],
      }),
      sources: [],
    };
  }
  return {
    text: `**[MOCK ${agent}]** 실제 API를 호출하지 않은 테스트 응답입니다.\n\n받은 요청 앞부분:\n\n> ${last.slice(0, 160).replace(/\n/g, ' ')}…`,
    sources: [{ url: 'https://example.com/mock-source', title: `MOCK 출처 (${agent})` }],
  };
}
