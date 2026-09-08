"""ประกอบโลโก้สองอันเรียงกันเป็นภาพเดียว ปรับความสูงให้เท่ากันแล้ววางกึ่งกลาง"""
import struct,zlib,os

def read_bmp(p):
    d=open(p,"rb").read()
    off=struct.unpack_from("<I",d,10)[0]
    w,h=struct.unpack_from("<ii",d,18); bpp=struct.unpack_from("<H",d,28)[0]
    H=abs(h); B=bpp//8; row=((w*B+3)//4)*4
    px=[]
    for y in range(H):
        yy=(H-1-y) if h>0 else y; base=off+yy*row
        px.append([(d[base+x*B+2],d[base+x*B+1],d[base+x*B]) for x in range(w)])
    return w,H,px

def write_png(path,rows):
    h=len(rows); w=len(rows[0])
    raw=b"".join(b"\x00"+bytes(v for p in r for v in p) for r in rows)
    def ck(t,dd):
        c=t+dd; return struct.pack(">I",len(dd))+c+struct.pack(">I",zlib.crc32(c)&0xffffffff)
    open(path,"wb").write(b"\x89PNG\r\n\x1a\n"
        +ck(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))
        +ck(b"IDAT",zlib.compress(raw,9))+ck(b"IEND",b""))

def bbox(px,w,h,x0,x1,thr=243):
    lum=lambda p:(p[0]*299+p[1]*587+p[2]*114)//1000
    xs=[x for x in range(x0,x1) if any(lum(px[y][x])<thr for y in range(h))]
    ys=[y for y in range(h) if any(lum(px[y][x])<thr for x in range(x0,x1))]
    return min(xs),min(ys),max(xs)+1,max(ys)+1

def scale_box(px,x0,y0,x1,y1,tw,th):
    """ย่อแบบเฉลี่ยทั้งกล่อง ได้ขอบเนียนกว่าการหยิบพิกเซลเดียว"""
    sw,sh=x1-x0,y1-y0; out=[]
    for r in range(th):
        ya=y0+r*sh//th; yb=max(ya+1,y0+(r+1)*sh//th); line=[]
        for c in range(tw):
            xa=x0+c*sw//tw; xb=max(xa+1,x0+(c+1)*sw//tw)
            n=0; R=G=B=0
            for y in range(ya,yb):
                for x in range(xa,xb):
                    p=px[y][x]; R+=p[0]; G+=p[1]; B+=p[2]; n+=1
            line.append((R//n,G//n,B//n))
        out.append(line)
    return out

def compose(src_bmp,spans,out,H=170,gap=54,pad=16):
    w,h,px=read_bmp(src_bmp)
    parts=[]
    for x0,x1 in spans:
        bx0,by0,bx1,by1=bbox(px,w,h,x0,x1)
        aw=bx1-bx0; ah=by1-by0
        tw=max(1,round(aw*H/ah))
        parts.append(scale_box(px,bx0,by0,bx1,by1,tw,H))
    W=pad*2+sum(len(p[0]) for p in parts)+gap*(len(parts)-1)
    canvas=[[(255,255,255)]*W for _ in range(H+pad*2)]
    x=pad
    for p in parts:
        for r in range(H):
            canvas[pad+r][x:x+len(p[0])]=p[r]
        x+=len(p[0])+gap
    write_png(out,canvas)
    return W,H+pad*2
