#!/usr/bin/env python3
"""Génère packaging/icon.ico — SANS dépendance (stdlib seule), comme le reste du
projet. Une tuile sombre aux coins arrondis, une planète bleutée, une orbite
ambre qui passe DERRIÈRE puis DEVANT elle, et un satellite sur la partie avant.
L'ambre est l'accent de l'interface (« maintenant »), la tuile reprend son fond.
Rendu 4x puis réduit (anticrénelage).

    python packaging/make_icon.py            # écrit icon.ico
    python packaging/make_icon.py --png      # écrit aussi icon-256.png (aperçu)
"""
import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icon.ico")
SIZES = (256, 128, 64, 48, 32, 16)
SS = 4  # suréchantillonnage

TOP     = (44, 48, 60)       # haut de la tuile
BOTTOM  = (9, 10, 14)        # bas de la tuile
AMBER   = (251, 163, 24)     # accent de l'interface
AMBER_L = (255, 214, 120)    # cœur lumineux de l'orbite
PLANET_L = (92, 158, 232)    # côté éclairé
PLANET_D = (12, 22, 46)      # côté nuit
RIM     = (130, 205, 255)    # liseré d'atmosphère
PANEL   = (140, 182, 255)    # panneaux solaires
BODY    = (255, 226, 160)    # corps du satellite


def mix(a, b, t):
    t = 0 if t < 0 else 1 if t > 1 else t
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def blend(buf, w, x, y, rgb, a):
    """Source-over sur un canevas RGB opaque ; a vaut 0..255."""
    if a <= 0 or x < 0 or y < 0 or x >= w or y >= w:
        return
    i = (y * w + x) * 3
    ia = 255 - a
    buf[i]     = int((rgb[0] * a + buf[i]     * ia) / 255)
    buf[i + 1] = int((rgb[1] * a + buf[i + 1] * ia) / 255)
    buf[i + 2] = int((rgb[2] * a + buf[i + 2] * ia) / 255)


def disk(buf, w, cx, cy, r, rgb, a=255):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r:
                blend(buf, w, x, y, rgb, a)


def render(T):
    w = T * SS
    small = T <= 32
    buf = bytearray(w * w * 3)
    rad = w * 0.22

    # tuile : dégradé vertical + lueur en haut à gauche
    for y in range(w):
        row = mix(TOP, BOTTOM, (y / w) ** 0.9)
        for x in range(w):
            g = max(0.0, 1 - math.hypot(x - w * 0.25, y - w * 0.2) / (w * 0.6)) * 0.35
            c = mix(row, (70, 78, 98), g)
            i = (y * w + x) * 3
            buf[i], buf[i + 1], buf[i + 2] = int(c[0]), int(c[1]), int(c[2])

    if not small:                                    # quelques étoiles
        for sx, sy, sr, sa in ((0.18, 0.16, 0.012, 200), (0.80, 0.12, 0.009, 160),
                               (0.90, 0.30, 0.008, 130), (0.10, 0.34, 0.007, 120),
                               (0.62, 0.08, 0.007, 110)):
            disk(buf, w, sx * w, sy * w, sr * w, (255, 255, 255), sa)

    pcx, pcy = w * 0.5, w * 0.56                     # centre planète / orbite
    pr = w * (0.30 if small else 0.27)
    rx, ry = w * 0.44, w * (0.19 if small else 0.165)
    phi = math.radians(-28)
    cph, sph = math.cos(phi), math.sin(phi)
    stroke = max(w * 0.022, 1.8 * SS)      # épaisseur (diamètre) du trait d'orbite

    def on_orbit(t):
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        return pcx + ex * cph - ey * sph, pcy + ex * sph + ey * cph

    def orbit(t0, t1, dim):
        n = max(120, int(w * 0.9))
        for k in range(n + 1):
            t = t0 + (t1 - t0) * k / n
            x, y = on_orbit(t)
            disk(buf, w, x, y, stroke * 1.25, AMBER, int(10 * dim))     # lueur
            disk(buf, w, x, y, stroke * 0.85, AMBER, int(26 * dim))
            disk(buf, w, x, y, stroke / 2, AMBER, int(255 * dim))
            disk(buf, w, x, y, stroke * 0.18, AMBER_L, int(190 * dim))  # cœur

    orbit(math.pi, 2 * math.pi, 0.62)                # moitié arrière, plus sombre

    # planète : dégradé radial éclairé en haut à gauche, liseré d'atmosphère
    lx, ly = pcx - pr * 0.42, pcy - pr * 0.45
    for y in range(int(pcy - pr - 3), int(pcy + pr + 4)):
        for x in range(int(pcx - pr - 3), int(pcx + pr + 4)):
            d = math.hypot(x + .5 - pcx, y + .5 - pcy)
            if d <= pr:
                s = math.hypot(x + .5 - lx, y + .5 - ly) / (pr * 1.55)
                c = mix(PLANET_L, PLANET_D, s ** 1.1)
                e = max(0.0, (d - pr * 0.9) / (pr * 0.1))          # liseré au bord
                c = mix(c, RIM, e * 0.55 * max(0.0, 1 - s))
                i = (y * w + x) * 3
                buf[i], buf[i + 1], buf[i + 2] = int(c[0]), int(c[1]), int(c[2])
    for k in range(int(w * 1.2)):                    # halo d'atmosphère
        a = 2 * math.pi * k / int(w * 1.2)
        disk(buf, w, pcx + (pr + w * .004) * math.cos(a), pcy + (pr + w * .004) * math.sin(a),
             w * 0.006, RIM, 26)

    orbit(0, math.pi, 1.0)                           # moitié avant, devant la planète

    # satellite sur la partie avant, tangent à l'orbite
    t = math.radians(52)
    sx, sy = on_orbit(t)
    dx = -rx * math.sin(t) * cph - ry * math.cos(t) * sph
    dy = -rx * math.sin(t) * sph + ry * math.cos(t) * cph
    ang = math.atan2(dy, dx)
    ca, sa = math.cos(ang), math.sin(ang)
    body = w * (0.085 if small else 0.072)

    def put_rect(ox, oy, hw, hh, rgb):
        for yy in range(int(-hh - 1), int(hh + 2)):
            for xx in range(int(-hw - 1), int(hw + 2)):
                if abs(xx) <= hw and abs(yy) <= hh:
                    px = sx + (ox + xx) * ca - (oy + yy) * sa
                    py = sy + (ox + xx) * sa + (oy + yy) * ca
                    blend(buf, w, int(px), int(py), rgb, 255)

    put_rect(-body * 1.95, 0, body * 1.0, body * 0.62, PANEL)       # panneau gauche
    put_rect(body * 1.95, 0, body * 1.0, body * 0.62, PANEL)        # panneau droit
    put_rect(-body * 1.95, 0, body * 0.08, body * 0.62, PLANET_D)   # nervure
    put_rect(body * 1.95, 0, body * 0.08, body * 0.62, PLANET_D)
    put_rect(0, 0, body * 0.95, body * 0.2, (150, 120, 70))         # bras
    put_rect(0, 0, body * 0.62, body * 0.62, BODY)                  # corps
    put_rect(0, 0, body * 0.30, body * 0.30, AMBER)

    # réduction 4x -> T ; l'alpha vient du masque arrondi, la couleur est pondérée
    out = bytearray(T * T * 4)
    for y in range(T):
        for x in range(T):
            r = g = b = a = 0
            for yy in range(SS):
                for xx in range(SS):
                    px, py = x * SS + xx, y * SS + yy
                    dx = max(rad - px - .5, px + .5 - (w - rad), 0)
                    dy = max(rad - py - .5, py + .5 - (w - rad), 0)
                    if dx * dx + dy * dy <= rad * rad:
                        i = (py * w + px) * 3
                        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += 1
            o = (y * T + x) * 4
            if a:
                out[o], out[o + 1], out[o + 2] = r // a, g // a, b // a
            out[o + 3] = a * 255 // (SS * SS)
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
    if "--png" in sys.argv:
        p = os.path.join(HERE, "icon-256.png")
        with open(p, "wb") as f:
            f.write(imgs[0][1])
        print("aperçu", p)


if __name__ == "__main__":
    main()
