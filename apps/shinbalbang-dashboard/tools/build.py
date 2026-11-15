"""APK 재조립: base APK의 dex·리소스는 그대로, assets 교체, 매니페스트 버전·세로 고정 패치, 정렬, v1+v2 서명."""
import zipfile, struct, sys, os, subprocess, io, tempfile, shutil
sys.path.insert(0, os.path.dirname(__file__))
import axml, axml_edit, apkv2
orig, assets, out, vcode, vname, ks, pwf, keypem, certpem = sys.argv[1:10]
vcode = int(vcode); pw = open(pwf).read().strip()

zin = zipfile.ZipFile(orig)
files = []
for i in zin.infolist():
    if i.filename.startswith('META-INF/'): continue
    data = zin.read(i.filename)
    if i.filename.startswith('assets/'):
        data = open(os.path.join(assets, i.filename[len('assets/'):]), 'rb').read()
    if i.filename == 'AndroidManifest.xml':
        # 버전 갱신 + 세로 고정(screenOrientation=portrait, 기기 회전 센서 무시). 가로는 앱 안 버튼으로 전환
        add = [] if any(n == 'screenOrientation' for _, n, *_ in axml.parse(data)[1]) else [('activity', 'screenOrientation', 0x0101001e, 16, 1)]
        data = axml_edit.edit(data, set_attrs=[('manifest', 'versionCode', 16, vcode), ('manifest', 'versionName', 3, vname)], add_attrs=add)
    files.append((i.filename, data, i.compress_type))
# 원본에 없는 새 asset 파일 추가
have = {f[0] for f in files}
for fn in sorted(os.listdir(assets)):
    if 'assets/' + fn not in have: files.append(('assets/' + fn, open(os.path.join(assets, fn), 'rb').read(), zipfile.ZIP_DEFLATED))

def write_zip(path, entries):
    with open(path, 'wb') as fp, zipfile.ZipFile(fp, 'w') as z:
        for name, data, ct in entries:
            zi = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_STORED if name == 'resources.arsc' else ct
            if zi.compress_type == zipfile.ZIP_STORED:
                hdr = fp.tell() + 30 + len(name.encode())
                align = 4096 if name.endswith('.so') else 4
                pad = (-(hdr + 4)) % align
                zi.extra = struct.pack('<HH', 0xd935, pad) + b'\0' * pad
            z.writestr(zi, data)

tmp = tempfile.mkdtemp()
u = os.path.join(tmp, 'u.apk'); write_zip(u, files)
# v1 (JAR) 서명: jarsigner로 META-INF 생성 후 내용만 가져옴
r = subprocess.run(['jarsigner', '-keystore', ks, '-storepass', pw, '-digestalg', 'SHA-256', '-sigalg', 'SHA256withRSA', '-sigfile', 'GADC', u, 'gadc'], capture_output=True, text=True)
assert r.returncode == 0, r.stdout + r.stderr
meta = [(i.filename, zipfile.ZipFile(u).read(i.filename), zipfile.ZIP_DEFLATED) for i in zipfile.ZipFile(u).infolist() if i.filename.startswith('META-INF/')]
a = os.path.join(tmp, 'a.apk'); write_zip(a, meta + files)
open(out, 'wb').write(apkv2.sign(open(a, 'rb').read(), keypem, certpem))
# 정렬 확인
z = zipfile.ZipFile(out)
for i in z.infolist():
    if i.compress_type == zipfile.ZIP_STORED:
        with open(out, 'rb') as f:
            f.seek(i.header_offset); h = f.read(30); n, e = struct.unpack_from('<HH', h, 26)
            assert (i.header_offset + 30 + n + e) % 4 == 0, i.filename + ' 정렬 실패'
shutil.rmtree(tmp)
print('built', out, os.path.getsize(out), 'bytes')
