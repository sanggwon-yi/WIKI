"""바이너리 AndroidManifest.xml 편집: 문자열 풀 재작성, 속성 값 변경, 속성 추가.
새 속성 이름 문자열은 풀 끝에 붙이고 리소스 맵을 0으로 채워 그 위치까지 늘림
(맵 밖 문자열의 리소스 ID는 원래도 0이므로 의미가 바뀌지 않음)."""
import struct

ANDROID_NS = 'http://schemas.android.com/apk/res/android'

def _chunks(b):
    off = 8; out = []
    while off < len(b):
        t, hs, sz = struct.unpack_from('<HHI', b, off); out.append([t, hs, b[off:off+sz]]); off += sz
    return out

def _read_pool(c):
    sc, stc, fl, so, sso = struct.unpack_from('<IIIII', c, 8)
    assert stc == 0, '스타일 문자열 미지원'
    utf8 = bool(fl & 0x100); strs = []
    for i in range(sc):
        p = so + struct.unpack_from('<I', c, 28 + 4*i)[0]
        if utf8:
            n = c[p]; p += 1
            if n & 0x80: p += 1
            n = c[p]; p += 1
            if n & 0x80: n = ((n & 0x7f) << 8) | c[p]; p += 1
            strs.append(c[p:p+n].decode())
        else:
            n = struct.unpack_from('<H', c, p)[0]; p += 2
            strs.append(c[p:p+2*n].decode('utf-16le'))
    return strs, fl

def _write_pool(strs, fl):
    utf8 = bool(fl & 0x100); data = b''; offs = []
    for s in strs:
        offs.append(len(data))
        if utf8:
            e = s.encode(); u = len(s); assert u < 0x8000 and len(e) < 0x8000
            data += (bytes([u]) if u < 0x80 else bytes([0x80 | (u >> 8), u & 0xff]))
            data += (bytes([len(e)]) if len(e) < 0x80 else bytes([0x80 | (len(e) >> 8), len(e) & 0xff])) + e + b'\0'
        else:
            e = s.encode('utf-16le'); n = len(e) // 2; assert n < 0x8000
            data += struct.pack('<H', n) + e + b'\0\0'
    data += b'\0' * ((-len(data)) % 4)
    hdr = 28; so = hdr + 4*len(strs)
    body = b''.join(struct.pack('<I', o) for o in offs) + data
    return struct.pack('<HHIIIIII', 1, hdr, hdr + len(body), len(strs), 0, fl, so, 0) + body

def edit(b, set_attrs=(), add_attrs=()):
    """set_attrs: [(element, name, type, data)]  — type 3(문자열)이면 data는 str
       add_attrs: [(element, name, res_id, type, data)] — android 네임스페이스 속성 추가"""
    ch = _chunks(b)
    strs, fl = _read_pool(ch[0][2]); assert ch[0][0] == 1
    rmap = ch[1]; assert rmap[0] == 0x180
    ids = list(struct.unpack_from('<%dI' % ((len(rmap[2]) - 8) // 4), rmap[2], 8))
    def sidx(s):
        if s in strs: return strs.index(s)
        strs.append(s); return len(strs) - 1
    def name_idx(name, rid):
        for i, x in enumerate(ids):
            if x == rid and strs[i] == name: return i
        strs.append(name); i = len(strs) - 1
        while len(ids) < i: ids.append(0)
        ids.append(rid); return i
    ns = sidx(ANDROID_NS)
    for c in ch[2:]:
        if c[0] != 0x102: continue
        cb = bytearray(c[2]); el = strs[struct.unpack_from('<I', cb, 20)[0]]
        ast, asz, ac = struct.unpack_from('<HHH', cb, 24)
        attrs = [bytes(cb[16+ast+i*asz:16+ast+(i+1)*asz]) for i in range(ac)]
        for e, n, t, d in set_attrs:
            if e != el: continue
            for k, a in enumerate(attrs):
                if strs[struct.unpack_from('<I', a, 4)[0]] == n:
                    raw = sidx(d) if t == 3 else 0xffffffff; dv = sidx(d) if t == 3 else d
                    attrs[k] = a[:8] + struct.pack('<IHBBI', raw, 8, 0, t, dv)
        for e, n, rid, t, d in add_attrs:
            if e != el: continue
            assert not any(strs[struct.unpack_from('<I', a, 4)[0]] == n for a in attrs), n + ' 이미 있음'
            ni = name_idx(n, rid)
            attrs.append(struct.pack('<IIIHBBI', ns, ni, sidx(d) if t == 3 else 0xffffffff, 8, 0, t, sidx(d) if t == 3 else d))
        # 리소스 ID 순 정렬 (aapt2와 동일)
        def key(a):
            i = struct.unpack_from('<I', a, 4)[0]; r = ids[i] if i < len(ids) else 0
            return (r == 0, r)
        attrs.sort(key=key)
        idattr, clsattr, styattr = struct.unpack_from('<HHH', cb, 30)
        head = bytearray(cb[:16+ast]); struct.pack_into('<H', head, 28, len(attrs))
        nb = head + b''.join(attrs); struct.pack_into('<I', nb, 4, len(nb))
        c[2] = bytes(nb)
    ch[0][2] = _write_pool(strs, fl)
    rm = struct.pack('<HHI', 0x180, 8, 8 + 4*len(ids)) + struct.pack('<%dI' % len(ids), *ids)
    ch[1][2] = rm
    body = b''.join(c[2] for c in ch)
    return struct.pack('<HHI', 3, 8, 8 + len(body)) + body
