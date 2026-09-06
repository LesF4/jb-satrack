#!/usr/bin/env python3
"""Construit l'application Windows JB-SATRACK.

    python packaging/build.py               # icône + exécutable (PyInstaller)
    python packaging/build.py --installer   # + installeur (Inno Setup requis)
    python packaging/build.py --clean       # repart de zéro

Sorties (packaging/dist/) :
    JB-SATRACK/                    dossier applicatif — utilisable tel quel, zippable
    JB-SATRACK-Setup-x.y.z.exe     installeur (avec --installer)

Prérequis : PyInstaller (`pip install pyinstaller`). Inno Setup seulement pour
l'installeur : https://jrsoftware.org/isdl.php
"""
import argparse
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(HERE, "dist")
WORK = os.path.join(HERE, "build")
APPDIR = os.path.join(DIST, "JB-SATRACK")


def run(cmd, **kw):
    print("  $", " ".join(str(c) for c in cmd))
    subprocess.check_call(cmd, **kw)


def find_iscc():
    for c in ("iscc", "ISCC"):
        p = shutil.which(c)
        if p:
            return p
    for p in (r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
              r"C:\Program Files\Inno Setup 6\ISCC.exe"):
        if os.path.exists(p):
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", action="store_true", help="produit aussi dist/JB-SATRACK-portable.zip (à envoyer tel quel)")
    ap.add_argument("--installer", action="store_true", help="construit aussi l'installeur Inno Setup")
    ap.add_argument("--clean", action="store_true", help="supprime dist/ et build/ d'abord")
    args = ap.parse_args()

    if sys.platform != "win32":
        print("! Ce script produit un exécutable Windows ; lance-le sous Windows.\n")

    if args.clean:
        for d in (DIST, WORK):
            shutil.rmtree(d, ignore_errors=True)
        print("nettoyé.")

    print("[1/3] icône")
    run([sys.executable, os.path.join(HERE, "make_icon.py")])

    print("[2/3] exécutable — PyInstaller (onedir)")
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit("PyInstaller absent :  pip install pyinstaller")
    run([sys.executable, "-m", "PyInstaller", "--noconfirm",
         "--distpath", DIST, "--workpath", WORK,
         os.path.join(HERE, "jb-satrack.spec")], cwd=ROOT)
    print("       ->", APPDIR)

    if args.zip:
        zpath = os.path.join(DIST, "JB-SATRACK-portable")
        if os.path.exists(zpath + ".zip"):
            os.remove(zpath + ".zip")
        # base_dir="JB-SATRACK" -> le zip contient un dossier JB-SATRACK/ propre
        # (le copain dézippe et obtient un seul dossier, pas des fichiers en vrac).
        shutil.make_archive(zpath, "zip", root_dir=DIST, base_dir="JB-SATRACK")
        mb = os.path.getsize(zpath + ".zip") / 1e6
        print("[2b] portable -> %s.zip  (%.1f Mo)" % (zpath, mb))

    if args.installer:
        print("[3/3] installeur — Inno Setup")
        iscc = find_iscc()
        if not iscc:
            sys.exit("Inno Setup introuvable. Installe-le (https://jrsoftware.org/isdl.php)\n"
                     "ou relance sans --installer : packaging/dist/JB-SATRACK/ est déjà\n"
                     "utilisable et peut être distribué en .zip.")
        run([iscc, os.path.join(HERE, "installer.iss")], cwd=HERE)
        print("       -> packaging/dist/JB-SATRACK-Setup-*.exe")
    else:
        print("[3/3] installeur : ignoré  (ajoute --installer)")

    print("\nOK.")


if __name__ == "__main__":
    main()
