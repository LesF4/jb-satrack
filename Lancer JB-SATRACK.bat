@echo off
title JB-SATRACK
cd /d "%~dp0"

set "SATRACK_URL=http://localhost:8073"
set "FIREFOX_EXE=C:\Program Files\Mozilla Firefox\firefox.exe"

rem Firefox, dans un nouvel ONGLET de la fenetre deja ouverte (a cote de Py-APRS),
rem a la demande de F4MAJ le 24/09/2026. Navigateur par defaut si Firefox absent.
if not exist "%FIREFOX_EXE%" set "FIREFOX_EXE="

rem Deja lance (double clic) : on rouvre seulement la page.
netstat -ano -p tcp | findstr /R /C:":8073 .*LISTENING" >nul
if not errorlevel 1 (
    echo JB-SATRACK tourne deja : ouverture de la page.
    goto :OPEN
)

echo Demarrage de JB-SATRACK...
start "JB-SATRACK - serveur (ne pas fermer)" /min python app.py

ping -n 4 127.0.0.1 >nul

:OPEN
if defined FIREFOX_EXE (
    start "" "%FIREFOX_EXE%" -new-tab "%SATRACK_URL%"
) else (
    start "" %SATRACK_URL%
)

echo.
echo JB-SATRACK tourne dans la fenetre "JB-SATRACK - serveur".
echo Ferme cette fenetre-la pour arreter le serveur.
echo Tu peux fermer cette fenetre-ci.
pause
