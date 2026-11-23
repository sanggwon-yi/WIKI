#!/usr/bin/env python3
"""지도에서 위치를 고르고 버튼 하나로 Pocket City 를 만드는 로컬 도구.

  python3 pocket-city-auto/gui.py            # 브라우저가 자동으로 열린다 (http://127.0.0.1:8765)
  python3 pocket-city-auto/gui.py --port 9000 --no-browser

지도에서 클릭하거나 "41.30293, 69.33947" 같은 좌표를 붙여넣고 [만들기]를 누르면
pocketcity_auto.py 를 실행하고, 끝나면 결과 페이지를 바로 띄운다.
이 컴퓨터(127.0.0.1)에서만 접속된다. 결과는 pocket-city-output/ 에 쌓인다.
"""
import argparse, json, mimetypes, os, re, subprocess, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GUI = os.path.join(HERE, 'gui')
OUTPUT = os.path.join(ROOT, 'pocket-city-output')
AUTO = os.path.join(HERE, 'pocketcity_auto.py')

JOBS = {}                 # id -> dict(status, log, html, dir)
LOCK = threading.Lock()


def slug(lat, lon, size):
    return f'{lat:.5f}_{lon:.5f}_{int(size)}'.replace('-', 'm').replace('.', 'p')


def run_job(job_id, lat, lon, size, name, drive, out_dir):
    job = JOBS[job_id]
    cmd = [sys.executable, AUTO, '--lat', repr(lat), '--lon', repr(lon), '--size', str(size),
           '--drive', drive, '--out', out_dir, '--reuse-osm']
    if name:
        cmd += ['--name', name]
    env = dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8')
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding='utf-8', errors='replace', env=env)
        for line in p.stdout:
            job['log'].append(line.rstrip())
        code = p.wait()
        htmls = sorted((f for f in os.listdir(out_dir) if f.endswith('.html')),
                       key=lambda f: os.path.getmtime(os.path.join(out_dir, f)), reverse=True) if os.path.isdir(out_dir) else []
        if code == 0 and htmls:
            job['html'] = htmls[0]
            job['status'] = 'done'
        else:
            job['status'] = 'error'
            job['log'].append(f'실패했습니다 (종료 코드 {code}). 지도 서버가 바쁘면 잠시 뒤 다시 눌러 보세요.')
    except Exception as e:   # noqa: BLE001
        job['status'] = 'error'
        job['log'].append(f'실행 오류: {e}')


class Handler(BaseHTTPRequestHandler):
    server_version = 'PocketCityGUI'

    def log_message(self, *a):   # 조용히
        pass

    def send(self, code, body, ctype='application/json; charset=utf-8'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, base, rel):
        path = os.path.normpath(os.path.join(base, rel))
        if not (path == base or path.startswith(base + os.sep)) or not os.path.isfile(path):
            return self.send(404, {'error': 'not found'})
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
            ctype += '; charset=utf-8'
        with open(path, 'rb') as f:
            self.send(200, f.read(), ctype)

    def do_GET(self):
        u = urlparse(self.path)
        path = unquote(u.path)
        if path in ('/', '/index.html'):
            return self.send_file(GUI, 'index.html')
        if path.startswith('/static/'):
            return self.send_file(GUI, path[len('/static/'):])
        if path.startswith('/api/job/'):
            job = JOBS.get(path.rsplit('/', 1)[-1])
            if not job:
                return self.send(404, {'error': 'unknown job'})
            since = int(parse_qs(u.query).get('since', ['0'])[0] or 0)
            return self.send(200, {'status': job['status'], 'log': job['log'][since:], 'next': len(job['log']),
                                   'url': f"/result/{job['id']}/{job['html']}" if job.get('html') else None})
        m = re.match(r'^/result/([\w-]+)/(.+)$', path)
        if m and m.group(1) in JOBS:
            return self.send_file(JOBS[m.group(1)]['dir'], m.group(2))
        self.send(404, {'error': 'not found'})

    def do_POST(self):
        if urlparse(self.path).path != '/api/generate':
            return self.send(404, {'error': 'not found'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            d = json.loads(self.rfile.read(n) or b'{}')
            lat, lon, size = float(d['lat']), float(d['lon']), float(d.get('size', 300))
        except (ValueError, KeyError, TypeError):
            return self.send(400, {'error': '좌표가 올바르지 않습니다.'})
        if not (-85 <= lat <= 85 and -180 <= lon <= 180):
            return self.send(400, {'error': '위도는 -85~85, 경도는 -180~180 이어야 합니다.'})
        if not 80 <= size <= 600:
            return self.send(400, {'error': '크기는 80~600 m 이어야 합니다.'})
        drive = 'left' if d.get('drive') == 'left' else 'right'
        name = re.sub(r'[\x00-\x1f]', '', str(d.get('name') or ''))[:40].strip()
        with LOCK:
            if any(j['status'] == 'running' for j in JOBS.values()):
                return self.send(409, {'error': '이미 만드는 중입니다. 끝난 뒤에 다시 눌러 주세요.'})
            job_id = slug(lat, lon, size) + '-' + str(int(time.time()))
            out_dir = os.path.join(OUTPUT, slug(lat, lon, size))
            JOBS[job_id] = {'id': job_id, 'status': 'running', 'log': [], 'html': None, 'dir': out_dir}
        threading.Thread(target=run_job, args=(job_id, lat, lon, size, name, drive, out_dir), daemon=True).start()
        self.send(200, {'id': job_id})


def main():
    ap = argparse.ArgumentParser(description='Pocket City 지도 도구')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--no-browser', action='store_true')
    a = ap.parse_args()
    try:
        import shapely  # noqa: F401
    except ImportError:
        sys.exit('shapely 가 필요합니다: pip install shapely')
    srv = None
    for port in range(a.port, a.port + 20):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    if not srv:
        sys.exit('사용할 수 있는 포트를 찾지 못했습니다. --port 로 다른 번호를 지정하세요.')
    url = f'http://127.0.0.1:{srv.server_address[1]}/'
    print(f'Pocket City 지도 도구: {url}\n(끝내려면 Ctrl+C)')
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n종료합니다.')


if __name__ == '__main__':
    main()
