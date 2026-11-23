#!/usr/bin/env python3
"""위도·경도만으로 Pocket City 페이지를 자동 생성한다.

  python3 pocket-city-auto/pocketcity_auto.py --lat 37.5619 --lon 126.7578
  python3 pocket-city-auto/pocketcity_auto.py --lat 37.5619 --lon 126.7578 --size 400 --name 동양동 --render

하는 일 (.claude/skills/pocket-city 의 스크립트를 순서대로 실행):
  1. fetch_osm.py   OpenStreetMap 데이터 받기 (Overpass)
  2. plot.py        정사각형 부지 배치 (유명 건물이 잘리지 않게)
  3. prep.py        장면 만들기 (--bank-trees 로 수로·하천변 나무)
  4. street_trees   도로변 가로수 추가 (예시)
  5. city.json      템플릿에서 생성 (이름, 좌표, 카메라, 범례를 자동으로 채움)
  6. build.py       단일 HTML 페이지 빌드
  7. render.mjs     (--render 일 때) 확인용 PNG

결과: <out>/pocket-city-<slug>.html, 작업 파일은 <out>/work/.

주의: 스킬의 원래 절차(현장 사진·도면 조사, 랜드마크 손 모델링, 출처 있는 계절 설명)는 자동화할 수 없다.
모든 건물은 창문·지붕·간판 없는 단순 박스(평지붕)로 그린다(facade "box").
기본 템플릿은 계절·밤 장면 문구를 "예시"로 표시한다. 출처가 있는 city.json 이 있으면 --template 으로 넘긴다.
"""
import argparse, json, os, re, shutil, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SKILL = os.path.join(REPO, '.claude', 'skills', 'pocket-city', 'scripts')
UA = 'pocket-city-auto/1.0 (OpenStreetMap fetch script)'


def run(cmd, what):
    """명령을 실행하며 출력을 실시간으로 보여준다. 마지막 줄들을 돌려준다."""
    print(f'\n== {what}\n   ' + ' '.join(cmd), flush=True)
    p = subprocess.Popen(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    lines = []
    for line in p.stdout:
        line = line.rstrip()
        lines.append(line)
        print('   ' + line, flush=True)
    if p.wait():
        sys.exit(f'실패: {what} (exit {p.returncode})')
    return '\n'.join(lines)


def reverse_geocode(lat, lon):
    """Nominatim 역지오코딩: (동 이름, 구/시, 전체 주소). 실패하면 빈 값."""
    q = urllib.parse.urlencode({'lat': lat, 'lon': lon, 'format': 'json', 'zoom': 16, 'accept-language': 'ko'})
    d = None
    for attempt in range(2):   # Nominatim 은 가끔 거절한다: 한 번 더
        try:
            req = urllib.request.Request('https://nominatim.openstreetmap.org/reverse?' + q, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            break
        except Exception as e:
            print(f'   (역지오코딩 실패: {e})')
            time.sleep(3)
    if d is None:
        return '', '', ''
    a = d.get('address', {})
    dong = a.get('quarter') or a.get('suburb') or a.get('neighbourhood') or a.get('village') or a.get('town') or ''
    region = ' '.join(x for x in (a.get('city') or a.get('province') or a.get('state'), a.get('borough') or a.get('city_district') or a.get('county')) if x)
    return dong, region, d.get('display_name', '')


def slugify(s, lat, lon):
    s = re.sub(r'[^\w가-힣-]+', '-', s).strip('-').lower()
    return s or f'{lat:.4f}_{lon:.4f}'.replace('.', 'p')


def make_city(template, scene, name, region, lat, lon, size, trees_added):
    c = json.load(open(template, encoding='utf-8'))
    osm = f'https://www.openstreetmap.org/#map=17/{lat:.5f}/{lon:.5f}'
    c['name'] = name
    c['title'] = f'{name}, {region}'.strip(', ')
    c['region'] = region
    c['place'] = f'{lat:.5f}, {lon:.5f} 주변 {int(size)}m'
    # 템플릿의 링크 자리표시자를 이 장소의 OSM 링크로
    txt = json.dumps(c, ensure_ascii=False).replace('{OSM_URL}', osm)
    c = json.loads(txt)

    bs = scene['buildings']
    apts = [b for b in bs if b.get('type') == 'apartments']
    famous = [b for b in bs if b.get('famous') and b.get('n')]
    z = 186.0 / size            # zoom 1 ≈ 186 m 가 화면을 채움
    views, legend = [], []
    for b in famous[:2]:        # 이름 있는 주요 건물을 시점과 범례에 (모양은 박스)
        cx, cy = b['obb']['c']
        cam = {'yaw': -30, 'pitch': 32, 'zoom': round(max(z * 3, 1.2), 2), 'x': cx, 'y': cy, 'z': 4}
        views.append({'id': f'f{len(views)}', 'label': b['n'][:12], 'camera': cam})
        legend.append({'name': b['n'], 'source': 'OpenStreetMap', 'count': '', 'icon': 'landmark', 'camera': cam})
    if apts:
        ax = sum(b['obb']['c'][0] for b in apts) / len(apts)
        ay = sum(b['obb']['c'][1] for b in apts) / len(apts)
        cam = {'yaw': -30, 'pitch': 30, 'zoom': round(max(z * 2, 1.0), 2), 'x': round(ax, 1), 'y': round(ay, 1), 'z': 10}
        views.append({'id': 'apts', 'label': '아파트', 'camera': cam})
        legend.append({'name': '아파트 동', 'source': 'OpenStreetMap', 'count': str(len(apts)), 'icon': 'buildings', 'camera': cam})
    else:
        cam = {'yaw': -30, 'pitch': 30, 'zoom': round(max(z * 2, 1.0), 2), 'x': 0, 'y': 0, 'z': 4}
        legend.append({'name': '건물', 'source': 'OpenStreetMap', 'count': str(len(bs)), 'icon': 'buildings', 'camera': cam})
    if scene.get('water'):
        legend.append({'name': '물길', 'source': 'OpenStreetMap', 'count': '', 'icon': 'water',
                       'camera': {'yaw': 20, 'pitch': 40, 'zoom': round(max(z * 1.5, 1.0), 2), 'x': 0, 'y': 0, 'z': 2}})
    legend.append({'name': '나무', 'source': '배치는 예시', 'count': str(len(scene['trees'])), 'icon': 'trees',
                   'camera': {'yaw': -30, 'pitch': 34, 'zoom': round(max(z * 2, 1.0), 2), 'x': 0, 'y': 0, 'z': 3}})
    if not c.get('views'):
        c['views'] = views
    c['legend'] = legend[:4]    # 범례 칸은 네 개까지 보인다
    return c


def main():
    ap = argparse.ArgumentParser(description='위도·경도로 Pocket City 페이지 자동 생성')
    ap.add_argument('--lat', type=float, required=True)
    ap.add_argument('--lon', type=float, required=True)
    ap.add_argument('--size', type=float, default=400, help='정사각형 한 변 m (80-600, 기본 400)')
    ap.add_argument('--name', help='페이지 제목 (기본: 역지오코딩한 동 이름)')
    ap.add_argument('--out', help='출력 폴더 (기본: pocket-city-<이름>)')
    ap.add_argument('--drive', choices=['right', 'left'], default='right', help='통행 방향 (한국: right)')
    ap.add_argument('--template', default=os.path.join(HERE, 'city.template.json'), help='city.json 템플릿')
    ap.add_argument('--keep', help='부지 안에 온전히 넣을 건물 이름들 (; 로 구분)')
    ap.add_argument('--bank-trees', type=float, default=7, help='수로·하천변 나무 간격 m (0: 끔)')
    ap.add_argument('--street-trees', type=float, default=14, help='가로수 간격 m (0: 끔)')
    ap.add_argument('--reuse-osm', action='store_true', help='<out>/work/osm.json 이 있으면 다시 받지 않고 재사용')
    ap.add_argument('--render', action='store_true', help='확인용 PNG 렌더 (Chrome 필요)')
    a = ap.parse_args()

    if not 80 <= a.size <= 600:
        sys.exit('--size 는 80~600 m 사이여야 합니다 (스킬 스크립트 제한).')
    if not os.path.isdir(SKILL):
        sys.exit(f'스킬 스크립트를 찾을 수 없습니다: {SKILL}')
    try:
        import shapely  # noqa: F401
    except ImportError:
        sys.exit('shapely 가 필요합니다: pip install shapely')

    dong, region, full = reverse_geocode(a.lat, a.lon)
    name = a.name or dong or f'{a.lat:.4f}, {a.lon:.4f}'
    print(f'장소: {full or "(주소 없음)"}\n이름: {name}')
    out = os.path.abspath(a.out or os.path.join(os.getcwd(), 'pocket-city-' + slugify(name, a.lat, a.lon)))
    work = os.path.join(out, 'work')
    os.makedirs(work, exist_ok=True)
    py = sys.executable
    osm, plot, scene_p, city_p = (os.path.join(work, f) for f in ('osm.json', 'plot.json', 'scene.json', 'city.json'))

    have = 0
    if a.reuse_osm and os.path.exists(osm):
        have = json.load(open(osm, encoding='utf-8')).get('pocket_city', {}).get('size', 0)
    if have >= a.size:
        print(f'\n== 1. 기존 osm.json 재사용 ({have:g} m 범위)')
    else:   # fetch_osm.py 가 Overpass 서버를 돌아가며 재시도한다. 모두 실패하면 잠시 뒤 다시 실행하세요.
        run([py, os.path.join(SKILL, 'fetch_osm.py'), '--lat', str(a.lat), '--lon', str(a.lon),
             '--size', str(a.size), '--out', osm], '1. OpenStreetMap 데이터 받기')
    cmd = [py, os.path.join(SKILL, 'plot.py'), '--osm', osm, '--out', plot,
           '--lat', str(a.lat), '--lon', str(a.lon), '--size', str(a.size)]
    if a.keep:
        cmd += ['--keep', a.keep]
    run(cmd, '2. 부지 배치')
    cmd = [py, os.path.join(SKILL, 'prep.py'), '--osm', osm, '--plot', plot, '--drive', a.drive, '--out', scene_p]
    if a.bank_trees:
        cmd += ['--bank-trees', str(a.bank_trees)]
    run(cmd, '3. 장면 만들기')
    added = 0
    if a.street_trees:
        o = run([py, os.path.join(HERE, 'street_trees.py'), scene_p, str(a.street_trees), '2.2'], '4. 가로수 추가')
        m = re.search(r'added (\d+)', o)
        added = int(m.group(1)) if m else 0

    scene = json.load(open(scene_p, encoding='utf-8'))
    city = make_city(a.template, scene, name, region, a.lat, a.lon, a.size, added)
    json.dump(city, open(city_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n== 5. city.json 생성: {city_p}')

    html = os.path.join(out, f'pocket-city-{slugify(name, a.lat, a.lon)}.html')
    run([py, os.path.join(SKILL, 'build.py'), '--scene', scene_p, '--city', city_p, '--out', html], '6. 페이지 빌드')
    if a.render:
        if not shutil.which('node'):
            print('   node 가 없어 렌더를 건너뜁니다.')
        else:
            run(['node', os.path.join(SKILL, 'render.mjs'), html, '--out', os.path.join(out, 'shots'),
                 '--view', 'iso,bird', '--season', 'summer,winter'], '7. 확인용 렌더')
    famous = [b['n'] for b in scene['buildings'] if b.get('famous') and b.get('n')]
    print(f'\n완료: {html}')
    print(f'건물 {len(scene["buildings"])}개, 나무 {len(scene["trees"])}그루 (가로수 {added})')
    if famous:
        print('주요 건물(지도 기준, 박스로 그림): ' + ', '.join(famous))
    print('건물은 모두 박스로만 그렸습니다. 계절·밤 문구와 나무 배치는 예시입니다. 출처 있는 city.json 은 --template 으로 넘기세요.')


if __name__ == '__main__':
    main()
