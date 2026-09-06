# -*- mode: python ; coding: utf-8 -*-
# Build "onedir" de JB-SATRACK pour Windows.
#   python packaging/build.py           (appelle : pyinstaller packaging/jb-satrack.spec)
# Sortie : packaging/dist/JB-SATRACK/  (dossier applicatif, zippable tel quel).
#
# Choix :
#   - onedir (COLLECT) plutôt que onefile : démarrage immédiat, pas d'extraction
#     dans un temp, nettement moins de faux positifs antivirus.
#   - console=True : c'est un serveur ; voir la fenêtre tourner rassure et les
#     erreurs y sont lisibles (l'appli affiche déjà « NE FERME PAS CETTE FENÊTRE »).
#   - upx=False : compresser déclenche des heuristiques antivirus pour un gain
#     de taille marginal.
#   - data/ (catalogue, TLE de secours, cache, libs vendorisées) est embarqué
#     en LECTURE SEULE dans _internal/data/ ; app.py le recopie au 1er lancement
#     vers un emplacement inscriptible (voir seed_bundled_data / la logique ROOT).

import os

ROOT = os.path.abspath(os.path.join(SPECPATH, os.pardir))
ICON = os.path.join(SPECPATH, "icon.ico")

datas = [(os.path.join(ROOT, "web"), "web")]

# data/vendor/ n'est pas versionné (téléchargé au 1er run). S'il est là on
# l'embarque -> 1er lancement possible hors ligne ; sinon l'appli le récupère.
_vendor = os.path.join(ROOT, "data", "vendor")
if os.path.isdir(_vendor) and os.listdir(_vendor):
    datas.append((_vendor, "data/vendor"))
else:
    print("jb-satrack.spec: data/vendor/ absent — lance `python app.py` une fois "
          "pour l'inclure (sinon 1er démarrage = téléchargement des libs).")

for _name in ("satellites.json", "tle_fallback.txt", "tle_cache.json"):
    _p = os.path.join(ROOT, "data", _name)
    if os.path.exists(_p):
        datas.append((_p, "data"))

a = Analysis(
    [os.path.join(ROOT, "app.py")],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],   # http.server tire email/… : ne pas exclure au-delà
    noarchive=False,
    optimize=1,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="JB-SATRACK",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=ICON if os.path.exists(ICON) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="JB-SATRACK",
)
