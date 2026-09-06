#!/usr/bin/env python3
"""Génère packaging/icon.ico — SANS dépendance (stdlib seule), comme le reste du
projet. Un satellite orange sur une orbite turquoise, fond sombre lisible dans
n'importe quelle barre des tâches. Rendu 4x puis réduit (anticrénelage).

    python packaging/make_icon.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
SIZES = (256, 128, 64, 48, 32, 16)
SS = 4  # suréchantillonnage

BG      = (0x0d, 0x11, 0x17)   # fond
ORBIT   = (0x4b, 0xe3, 0xc7)   # turquoise
SATB    = (0xff, 0xb4, 0x54)   # orange signal — corps
PANEL   = (0x8a, 0xb4, 0xff)   # bleu — panneaux
STATION = (0xff, 0xff, 0xff)   # point station


def blend(dst, x, y, w, rgb, a):
    if a <= 0 or x < 0 or y < 0 or x >= w or y >= w:
        return
    i = (y * w + x) * 4
    ia = 255 - a
    dst[i]     = (rgb[0] * a + dst[i]     * ia) // 255
    dst[i + 1] = (rgb[1] * a + dst[i + 1] * ia) // 255
    dst[i + 2] = (rgb[2] * a + dst[i + 2] * ia) // 255
    dst[i + 3] = max(dst[i + 3], a)


def disk(buf, w, cx, cy, r, rgb, a=255):
    x0, x1 = int(cx - r - 1), int(cx + r + 2)
    y0, y1 = int(cy - r - 1), int(cy + r + 2)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r:
                blend(buf, x, y, w, rgb, a)


def rrect(buf, w, x0, y0, x1, y1, rad, rgb, a=255):
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            dx = max(x0 + rad - x, x - (x1 - 1 - rad), 0)
            dy = max(y0 + rad - y, y - (y1 - 1 - rad), 0)
            if dx * dx + dy * dy <= rad * rad:
                blend(buf, x, y, w, rgb, a)


def render(T):
    w = T * SS
    buf = bytearray(w * w * 4)
    for i in range(0, len(buf), 4):        # fond opaque
        buf[i], buf[i + 1], buf[i + 2], buf[i + 3] = (*BG, 255)
    rrect(buf, w, 0, 0, w, w, w * 0.16, BG, 255)   # (le fond déborde, c'est voulu)

    cx = cy = w / 2
    rx, ry = w * 0.40, w * 0.235
    phi = math.radians(-24)
    cph, sph = math.cos(phi), math.sin(phi)
    stroke = max(2, w * 0.028)

    def on_orbit(t):
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        return cx + ex * cph - ey * sph, cy + ex * sph + ey * cph

    n = max(240, int(w * 3))
    for k in range(n):
        x, y = on_orbit(2 * math.pi * k / n)
        disk(buf, w, x, y, stroke / 2, ORBIT, 235)

    disk(buf, w, cx, cy, w * 0.055, STATION, 255)          # la station, au centre

    # satellite en haut à droite de l'orbite
    sx, sy = on_orbit(math.radians(-52))
    body = w * 0.15
    ang = math.radians(18)
    ca, sa = math.cos(ang), math.sin(ang)

    def put_rect(ox, oy, hw, hh, rgb):
        for yy in range(int(-hh - 1), int(hh + 2)):
            for xx in range(int(-hw - 1), int(hw + 2)):
                if abs(xx) <= hw and abs(yy) <= hh:
                    px = sx + (ox + xx) * ca - (oy + yy) * sa
                    py = sy + (ox + xx) * sa + (oy + yy) * ca
                    blend(buf, int(px), int(py), w, rgb, 255)

    put_rect(-body * 1.9, 0, body * 0.9, body * 0.42, PANEL)   # panneau gauche
    put_rect(body * 1.9, 0, body * 0.9, body * 0.42, PANEL)    # panneau droit
    put_rect(0, 0, body * 0.62, body * 0.62, SATB)             # corps

    # réduction 4x -> T (moyenne de blocs)
    out = bytearray(T * T * 4)
    for y in range(T):
        for x in range(T):
            r = g = b = a = 0
            for yy in range(SS):
                for xx in range(SS):
                    i = ((y * SS + yy) * w + (x * SS + xx)) * 4
                    r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3]
            o = (y * T + x) * 4
            out[o], out[o + 1], out[o + 2], out[o + 3] = r // (SS * SS), g // (SS * SS), b // (SS * SS), a // (SS * SS)
    return bytes(out)


def png(rgba, size):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(rgba[y * size * 4:(y + 1) * size * 4])
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def main():
    imgs = [(s, png(render(s), s)) for s in SIZES]
    hdr = struct.pack("<HHH", 0, 1, len(imgs))
    entries, blobs, offset = b"", b"", 6 + 16 * len(imgs)
    for s, data in imgs:
        entries += struct.pack("<BBBBHHII", s & 0xff, s & 0xff, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    with open(OUT, "wb") as f:
        f.write(hdr + entries + blobs)
    print("écrit %s (%d octets, tailles %s)" % (OUT, os.path.getsize(OUT),
                                                ", ".join(map(str, SIZES))))


if __name__ == "__main__":
    main()
