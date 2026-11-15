# 신발방 대시보드 (e-ink WebView APK)

작업지시: Notion「📟 신발방 대시보드 · 작업지시」

## 구성
- `assets/` — 화면(HTML/CSS/JS, ES5만 사용). 실제 수정은 여기서 함
- `base/` — 직전 APK. `classes.dex`(자바 브리지 `AndroidNet.fetch`, WebView)와 리소스는 이 파일에서 그대로 가져옴
  - v1.8 원본 자바 소스는 남아 있지 않음. dex를 바꿔야 하는 작업이면 역컴파일 또는 재작성 필요
- `tools/` — 빌드·서명(`build.py`, `apkv2.py`, `axml.py`), 브라우저 모의 테스트(`mock.js`, `shoot.js`)

## 빌드
```
./build.sh 10 1.9 <keystore> <password-file>
```
- 서명 키는 저장소에 넣지 않음. 업데이트 설치는 같은 키로 서명해야 가능
- v1.8까지: `gadc.keystore` (원본 보관 위치 미확인)
- v1.9부터: `gadc2.keystore` (사용자에게 별도 전달)

## 모의 테스트
```
cd tools && node shoot.js "$(pwd)/../assets" <스크린샷 폴더>
```
`mock.js`가 가짜 네이티브 브리지로 날씨·뉴스·일정 테스트 데이터를 넣음 (실제 값 아님).

## 버전
- v1.9 (versionCode 10) — 가로 화면 레이아웃: 좌측 날씨, 우측 일정·뉴스·속담/준비물. 회전 시 시간별 그래프 다시 그림
