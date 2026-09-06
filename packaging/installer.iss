; Installeur Windows de JB-SATRACK — Inno Setup 6 (https://jrsoftware.org).
; Construction :  packaging\build.py --installer   (ou : iscc packaging\installer.iss)
; Prérequis : packaging\dist\JB-SATRACK\  (produit par PyInstaller via build.py).

#define AppName      "JB-SATRACK"
#define AppVersion   "1.0.0"          ; garder synchro avec le pied de page de l'appli
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
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName} {#AppVersion}
OutputDir=dist
OutputBaseFilename=JB-SATRACK-Setup-{#AppVersion}
SetupIconFile=icon.ico
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
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}";          Filename: "{app}\{#AppExe}"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}";          Filename: "{app}\{#AppExe}"; Tasks: startup

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; les données utilisateur (station, journal, caches) vivent dans
; %LOCALAPPDATA%\JB-SATRACK — on ne les touche PAS à la désinstallation.
Type: dirifempty; Name: "{app}"
