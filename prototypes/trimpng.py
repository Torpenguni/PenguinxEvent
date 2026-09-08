"""ครอบขอบขาวรอบโลโก้ออก เขียน PNG เองด้วย zlib ไม่ต้องพึ่งไลบรารีนอก"""
import subprocess,struct,zlib,os,sys

def read_bmp(path):
    d=open(path,"rb").read()
    off=struct.unpack_from("<I",d,10)[0]
    w,h=struct.unpack_from("<ii",d,18); bpp=struct.unpack_from("<H",d,28)[0]
    H=abs(h); B=bpp//8; row=((w*B+3)//4)*4
    px=[]
    for y in range(H):
        yy=(H-1-y) if h>0 else y
        base=off+yy*row
        px.append([(d[base+x*B+2],d[base+x*B+1],d[base+x*B]) for x in range(w)])
    return w,H,px

def write_png(path,w,h,rows):
    raw=b"".join(b"\x00"+bytes(v for p in r for v in p) for r in rows)
    def ck(tag,data):
        c=tag+data
        return struct.pack(">I",len(data))+c+struct.pack(">I",zlib.crc32(c)&0xffffffff)
    png=(b"\x89PNG\r\n\x1a\n"
         +ck(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))
         +ck(b"IDAT",zlib.compress(raw,9))+ck(b"IEND",b""))
    open(path,"wb").write(png)

def trim(src,out,pad=14,thr=228):
    tmp=os.path.join(os.path.dirname(out) or ".","_t.bmp")
    subprocess.run(["sips","-s","format","bmp",src,"--out",tmp],capture_output=True)
    w,h,px=read_bmp(tmp); os.remove(tmp)
    lum=lambda p:(p[0]*299+p[1]*587+p[2]*114)//1000
    xs=[x for x in range(w) if any(lum(px[y][x])<thr for y in range(h))]
    ys=[y for y in range(h) if any(lum(px[y][x])<thr for x in range(w))]
    if not xs or not ys: return None
    x0=max(0,min(xs)-pad); x1=min(w,max(xs)+pad+1)
    y0=max(0,min(ys)-pad); y1=min(h,max(ys)+pad+1)
    write_png(out,x1-x0,y1-y0,[r[x0:x1] for r in px[y0:y1]])
    return x1-x0,y1-y0

if __name__=="__main__":
    print(trim(sys.argv[1],sys.argv[2]))
