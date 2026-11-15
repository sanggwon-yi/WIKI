"""APK Signature Scheme v2 서명/검증 (Android 공개 사양 기준 최소 구현)."""
import struct, hashlib, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography import x509

MAGIC = b'APK Sig Block 42'; V2_ID = 0x7109871a; ALG = 0x0103  # RSA PKCS1v1.5 SHA-256

def lp(b): return struct.pack('<I', len(b)) + b
def rd_lp(b, o):
    n = struct.unpack_from('<I', b, o)[0]; return b[o+4:o+4+n], o+4+n
def seq(b):
    out = []; o = 0
    while o < len(b): x, o = rd_lp(b, o); out.append(x)
    return out

def find_eocd(d):
    i = d.rfind(b'PK\x05\x06'); assert i >= 0; return i

def sections(d):
    e = find_eocd(d); cd_off, = struct.unpack_from('<I', d, e+16); cd_size, = struct.unpack_from('<I', d, e+12)
    return e, cd_off, cd_size

def chunk_digest(parts):
    ds = []
    for p in parts:
        for i in range(0, len(p), 1 << 20):
            c = p[i:i+(1 << 20)]
            ds.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(ds)) + b''.join(ds)).digest()

def content_digest(entries, cd, eocd, cd_offset_for_digest):
    eocd = bytearray(eocd); struct.pack_into('<I', eocd, 16, cd_offset_for_digest)
    return chunk_digest([entries, cd, bytes(eocd)])

def sign(unsigned, key_pem, cert_pem):
    key = serialization.load_pem_private_key(open(key_pem, 'rb').read(), None)
    cert = x509.load_pem_x509_certificate(open(cert_pem, 'rb').read())
    e, cd_off, cd_size = sections(unsigned)
    entries, cd, eocd = unsigned[:cd_off], unsigned[cd_off:cd_off+cd_size], unsigned[e:]
    dg = content_digest(entries, cd, eocd, cd_off)
    signed = lp(lp(struct.pack('<I', ALG) + lp(dg))) + lp(lp(cert.public_bytes(serialization.Encoding.DER))) + lp(b'')
    sig = key.sign(signed, padding.PKCS1v15(), hashes.SHA256())
    pub = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signer = lp(signed) + lp(lp(struct.pack('<I', ALG) + lp(sig))) + lp(pub)
    val = lp(lp(signer))
    pair = struct.pack('<Q', 4 + len(val)) + struct.pack('<I', V2_ID) + val
    size = len(pair) + 8 + 16
    block = struct.pack('<Q', size) + pair + struct.pack('<Q', size) + MAGIC
    eocd2 = bytearray(eocd); struct.pack_into('<I', eocd2, 16, cd_off + len(block))
    return entries + block + cd + bytes(eocd2)

def verify(d):
    e, cd_off, cd_size = sections(d)
    assert d[cd_off-16:cd_off] == MAGIC, 'v2 블록 없음'
    size, = struct.unpack_from('<Q', d, cd_off-24); start = cd_off - size - 8
    assert struct.unpack_from('<Q', d, start)[0] == size
    o = start + 8; v2 = None
    while o < cd_off - 24:
        n, = struct.unpack_from('<Q', d, o); i, = struct.unpack_from('<I', d, o+8)
        if i == V2_ID: v2 = d[o+12:o+8+n]
        o += 8 + n
    assert v2 is not None, 'v2 서명 없음'
    certs = []
    for s in seq(rd_lp(v2, 0)[0]):
        signed, o2 = rd_lp(s, 0); sigs, o2 = rd_lp(s, o2); pubder, o2 = rd_lp(s, o2)
        pub = serialization.load_der_public_key(pubder)
        ok = False
        for sg in seq(sigs):
            alg, = struct.unpack_from('<I', sg, 0); sv, _ = rd_lp(sg, 4)
            if alg == ALG:
                pub.verify(sv, signed, padding.PKCS1v15(), hashes.SHA256()); ok = True
        assert ok, '지원 알고리즘(0x0103) 서명 없음'
        dgs, o3 = rd_lp(signed, 0); cs, o3 = rd_lp(signed, o3)
        cert = x509.load_der_x509_certificate(seq(cs)[0])
        assert cert.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo) == pubder, '인증서-공개키 불일치'
        for dd in seq(dgs):
            alg, = struct.unpack_from('<I', dd, 0); dv, _ = rd_lp(dd, 4)
            if alg == ALG:
                calc = content_digest(d[:start], d[cd_off:cd_off+cd_size], d[e:], start)
                assert calc == dv, '내용 다이제스트 불일치'
        certs.append(cert)
    return certs

if __name__ == '__main__':
    if sys.argv[1] == 'verify':
        for c in verify(open(sys.argv[2], 'rb').read()):
            print('v2 OK', c.subject.rfc4514_string(), c.fingerprint(hashes.SHA256()).hex(':').upper())
    else:
        open(sys.argv[3], 'wb').write(sign(open(sys.argv[2], 'rb').read(), sys.argv[4], sys.argv[5]))
