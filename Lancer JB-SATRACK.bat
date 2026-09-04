@echo off
title JB-SATRACK
cd /d "%~dp0"

echo Demarrage de JB-SATRACK...
start "JB-SATRACK - serveur (ne pas fermer)" /min python app.py

ping -n 4 127.0.0.1 >nul

start "" http://localhost:8073

echo.
echo JB-SATRACK tourne dans la fenetre "JB-SATRACK - serveur".
echo Ferme cette fenetre-la pour arreter le serveur.
echo Tu peux fermer cette fenetre-ci.
pause
