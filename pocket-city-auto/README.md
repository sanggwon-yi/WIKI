# pocket-city-auto

위도·경도만 넣으면 Pocket City 페이지(단일 HTML)를 만들어 주는 자동화 도구입니다.
`.claude/skills/pocket-city`의 스크립트를 순서대로 실행합니다.

```bash
pip install shapely          # 한 번만
python3 pocket-city-auto/pocketcity_auto.py --lat 37.5619 --lon 126.7578
python3 pocket-city-auto/pocketcity_auto.py --lat 37.5619 --lon 126.7578 --size 400 --name 동양동 --render
```

결과는 `pocket-city-<이름>/pocket-city-<이름>.html`(작업 파일은 `work/`)입니다.
`--render`를 주면 확인용 PNG도 `shots/`에 만듭니다(Chrome 필요).

## 옵션

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--lat`, `--lon` | 필수 | 중심 좌표 |
| `--size` | 400 | 정사각형 한 변(m), 80~600 |
| `--name` | 역지오코딩한 동 이름 | 페이지 제목 |
| `--out` | `pocket-city-<이름>` | 출력 폴더 |
| `--drive` | right | 통행 방향(`left`: 일본·영국 등) |
| `--keep` | - | 부지 안에 온전히 넣을 건물 이름(`;` 구분) |
| `--bank-trees` | 7 | 물길 양쪽 나무 간격(m), 0이면 끔 |
| `--street-trees` | 14 | 가로수 간격(m), 0이면 끔 |
| `--template` | `city.template.json` | 직접 쓴 city.json 템플릿 |

## 그리는 방식

- **건물은 모두 박스입니다.** 창문, 지붕 모양, 발코니, 간판, 옥상 설비를 만들지 않고 지도 윤곽을 세운 평지붕 박스로만 그립니다(`facade: "box"`).
- 높이는 지도에 층수가 있으면 그대로 쓰고, 없으면 3층으로 가정합니다.
- 나무(공원·수로변·가로수), 차량 색, 사람과 차량의 움직임, 계절과 밤 장면은 예시입니다. Field notes에도 그렇게 표시합니다.
- 스킬의 원래 절차(현장 사진·도면 조사, 랜드마크 손 모델링, 출처 있는 계절 설명)는 자동화하지 않습니다. 그런 결과가 필요하면 출처를 단 city.json을 `--template`으로 넘기거나 스킬 절차를 따르세요.

## 필요한 것

- Python 3.9+, `shapely`, Node 18+(`--render`일 때), 인터넷(OpenStreetMap Overpass·Nominatim)
- 스킬 엔진(`.claude/skills/pocket-city/assets/kit/city.js`)에 `facade: "box"` 처리 한 줄이 추가되어 있습니다.
