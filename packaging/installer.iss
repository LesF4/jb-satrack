; Installeur Windows de JB-SATRACK — Inno Setup 6 (https://jrsoftware.org).
; Construction :  packaging\build.py --installer   (ou : iscc packaging\installer.iss)
; Prérequis : packaging\dist\JB-SATRACK\  (produit par PyInstaller via build.py).

#define AppName      "JB-SATRACK"
#define AppVersion   "2.0.4"          ; la CI la réécrit depuis le tag ; garder synchro avec CHANGELOG.md
#define AppPublisher "F4MAJ"
#define AppURL       "https://github.com/F4MAJ/jb-satrack"
#define AppExe       "JB-SATRACK.exe"

[Setup]
; AppId fige l'identité (mises à jour / désinstallation). NE PAS changer entre versions.
AppId={{A512AEE8-5F27-4037-954B-4425B048F3A1}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppCopyright=© 2026 F4MAJ — Tous droits réservés
VersionInfoCompany={#AppPublisher}
VersionInfoCopyright=© 2026 F4MAJ — Tous droits réservés
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName} {#AppVersion}
OutputDir=dist
OutputBaseFilename=JB-SATRACK-Setup-{#AppVersion}
SetupIconFile=icon.ico
; Affiché et à accepter avant l'installation (logiciel privé, tous droits réservés).
LicenseFile=..\LICENSE
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; installation par utilisateur : pas de pop-up UAC, pas besoin d'être admin.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup";     Description: "Lancer JB-SATRACK à l'ouverture de session"; GroupDescription: "Options :"; Flags: unchecked

[Files]
Source: "dist\JB-SATRACK\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}";                Filename: "{app}\{#AppExe}"
Name: "{group}\Premier démarrage (à lire)"; Filename: "{app}\PREMIER-DEMARRAGE.txt"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}";          Filename: "{app}\{#AppExe}"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}";          Filename: "{app}\{#AppExe}"; Tasks: startup

[Run]
Filename: "{app}\PREMIER-DEMARRAGE.txt"; Description: "Lire le guide de premier démarrage"; Flags: postinstall shellexec skipifsilent nowait unchecked
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; les données utilisateur (station, journal, caches) vivent dans
; %LOCALAPPDATA%\JB-SATRACK — on ne les touche PAS à la désinstallation.
Type: dirifempty; Name: "{app}"
