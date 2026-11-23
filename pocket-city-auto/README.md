# pocket-city-auto

## 지도에서 골라 만들기 (GUI)

지도를 보면서 위치를 고르고 버튼 하나로 만드는 로컬 도구입니다.

```bash
pip install shapely          # 한 번만
python pocket-city-auto/gui.py
```

브라우저가 자동으로 열립니다(`http://127.0.0.1:8765`). 안 열리면 그 주소를 직접 여세요.

1. **위도, 경도 붙여넣기** 칸에 구글 지도에서 복사한 좌표(`41.30293726923572, 69.33947542389276`)를 그대로 붙여넣거나, 지도를 클릭하거나, 장소 이름을 검색합니다.
2. 초록 사각형이 대략의 범위입니다. 슬라이더로 한 변 길이(80~600m)를 바꿉니다.
3. **Pocket City 만들기**를 누르면 진행 기록이 보이고, 끝나면 **새 탭에서 열기**나 **여기서 미리보기**로 확인합니다.

- 결과는 `pocket-city-output/<위도>_<경도>_<크기>/`에 저장됩니다. 같은 좌표와 크기로 다시 만들면 받아 둔 지도 데이터를 재사용해서 빠릅니다.
- 이 컴퓨터(127.0.0.1)에서만 접속됩니다. 지도 화면은 `tile.openstreetmap.org`, 장소 검색은 `nominatim.openstreetmap.org`에 접속하므로 인터넷이 필요합니다.
- 한 번에 하나만 만들 수 있습니다. 포트가 사용 중이면 `--port 9000`처럼 바꾸고, 브라우저를 자동으로 열지 않으려면 `--no-browser`를 붙입니다.
- Windows 명령 프롬프트에서는 `python`으로 실행하세요(`python3` 아님).

## 명령줄로 만들기

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
