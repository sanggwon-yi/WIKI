import struct,sys
def parse(b):
    # returns strings, list of (elem, attrname, type, data, value_offset)
    assert struct.unpack_from('<HHI',b,0)[0]==3
    off=8; strings=[]; out=[]; utf8=False
    while off<len(b):
        t,hs,sz=struct.unpack_from('<HHI',b,off)
        if t==1:
            sc,stc,fl,so,sso=struct.unpack_from('<IIIII',b,off+8)
            utf8=bool(fl&0x100)
            for i in range(sc):
                p=off+so+struct.unpack_from('<I',b,off+28+4*i)[0]
                if utf8:
                    n=b[p]; p+=1
                    if n&0x80: p+=1
                    n=b[p]; p+=1
                    if n&0x80: n=((n&0x7f)<<8)|b[p]; p+=1
                    strings.append((b[p:p+n].decode(),p,n,'u8'))
                else:
                    n=struct.unpack_from('<H',b,p)[0]; p+=2
                    strings.append((b[p:p+2*n].decode('utf-16le'),p,n,'u16'))
        elif t==0x102:
            name=struct.unpack_from('<I',b,off+20)[0]
            ast,asz,ac=struct.unpack_from('<HHH',b,off+24)
            for i in range(ac):
                a=off+16+ast+i*asz
                ns,nm,raw,vs,_,vt,vd=struct.unpack_from('<IIiHBBI',b,a)
                out.append((strings[name][0],strings[nm][0],vt,vd,raw,a+16))
        off+=sz
    return strings,out
if __name__=='__main__':
    b=open(sys.argv[1],'rb').read(); s,o=parse(b)
    for e in o:
        el,n,vt,vd,raw,_=e
        v=s[raw][0] if raw>=0 and raw!=0xffffffff and raw<len(s) else (s[vd][0] if vt==3 else hex(vd))
        print(el,n,vt,v)
