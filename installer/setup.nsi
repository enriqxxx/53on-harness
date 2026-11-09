; 53on-setup.exe: one signed file per version that carries the app, as Google's
; Antigravity does. No argument installs; /update is run by 53ON, which downloaded it into the home and checked its signed
; row, to put its app in place; /uninstall removes it. The app lives unpacked in <home>\app (it opens at once, nothing goes
; to TEMP), beside data\ and this file. Per user, without admin: an app under Program Files could not update itself.
; scripts/setup.js passes VER (53ON's version), PACK (dist\win-unpacked packed as 7z), RES (the NSIS plugins) and OUT.
Unicode true
ManifestDPIAware true
; a lab moves the shortcuts and the registry key (setup.js: SETUP_DESK, SETUP_MENU, SETUP_KEY)
!ifndef DESK
  !define DESK $DESKTOP
!endif
!ifndef MENU
  !define MENU $SMPROGRAMS
!endif
!ifndef KEY
  !define KEY Software\Microsoft\Windows\CurrentVersion\Uninstall\53on
!endif
!define CAP Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore
!include MUI2.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

Name 53ON
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\53on"
RequestExecutionLevel user
SetCompressor lzma
!addplugindir /x86-unicode "${RES}\plugins\x86-unicode"
BrandingText " "
VIProductVersion ${VER}.0
VIAddVersionKey ProductName 53ON
VIAddVersionKey FileDescription "53ON Setup"
VIAddVersionKey FileVersion ${VER}
VIAddVersionKey ProductVersion ${VER}
VIAddVersionKey CompanyName "VCORPS LLC"
VIAddVersionKey LegalCopyright "© 2026 VCORPS LLC"

Var Mode
Var Wipe
Var Cfa
Var Pid

!define MUI_ICON ..\build\icon.ico
!define MUI_WELCOMEFINISHPAGE_BITMAP side.bmp
!define MUI_ABORTWARNING
!define MUI_PAGE_CUSTOMFUNCTION_PRE OnlyInstall
!insertmacro MUI_PAGE_LICENSE ..\LICENSE
!define MUI_PAGE_CUSTOMFUNCTION_PRE OnlyInstall
!define MUI_PAGE_HEADER_TEXT $(t_priv)
!define MUI_PAGE_HEADER_SUBTEXT $(s_priv)
!define MUI_LICENSEPAGE_TEXT_TOP $(top_priv)
!define MUI_LICENSEPAGE_TEXT_BOTTOM $(bot_priv)
!define MUI_LICENSEPAGE_BUTTON $(^NextBtn)
!insertmacro MUI_PAGE_LICENSE $(privacy)
Page custom Perms
!define MUI_PAGE_CUSTOMFUNCTION_SHOW Header
!insertmacro MUI_PAGE_INSTFILES
!define MUI_PAGE_CUSTOMFUNCTION_PRE OnlyInstall
!define MUI_FINISHPAGE_RUN "$INSTDIR\app\53on.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE English
!insertmacro MUI_LANGUAGE Spanish
LicenseLangString privacy ${LANG_ENGLISH} privacy.en.txt
LicenseLangString privacy ${LANG_SPANISH} privacy.es.txt
LangString t_priv ${LANG_ENGLISH} "Privacy"
LangString t_priv ${LANG_SPANISH} "Privacidad"
LangString s_priv ${LANG_ENGLISH} "What 53ON sends, and where."
LangString s_priv ${LANG_SPANISH} "Qué envía 53ON, y hacia dónde."
LangString top_priv ${LANG_ENGLISH} "Please read this before installing."
LangString top_priv ${LANG_SPANISH} "Léalo antes de instalar."
LangString bot_priv ${LANG_ENGLISH} "Select Next to continue."
LangString bot_priv ${LANG_SPANISH} "Seleccione Siguiente para continuar."

LangString t_perm ${LANG_ENGLISH} "Permissions"
LangString t_perm ${LANG_SPANISH} "Permisos"
LangString s_perm ${LANG_ENGLISH} "Review the permissions 53ON will use."
LangString s_perm ${LANG_SPANISH} "Revise los permisos que utilizará 53ON."
LangString perm ${LANG_ENGLISH} "53ON will be installed for the current user in the following folder:$\r$\n$INSTDIR$\r$\n$\r$\nAdministrator rights are not required."
LangString perm ${LANG_SPANISH} "53ON se instalará para el usuario actual en la siguiente carpeta:$\r$\n$INSTDIR$\r$\n$\r$\nNo se requieren permisos de administrador."
LangString go ${LANG_ENGLISH} "Click Install to continue."
LangString go ${LANG_SPANISH} "Haga clic en Instalar para continuar."
LangString cam ${LANG_ENGLISH} "Camera"
LangString cam ${LANG_SPANISH} "Cámara"
LangString mic ${LANG_ENGLISH} "Microphone"
LangString mic ${LANG_SPANISH} "Micrófono"
LangString on ${LANG_ENGLISH} "Allowed"
LangString on ${LANG_SPANISH} "Permitido"
LangString off ${LANG_ENGLISH} "Turned off for desktop apps"
LangString off ${LANG_SPANISH} "Desactivado para aplicaciones de escritorio"
LangString turn_on ${LANG_ENGLISH} "Open settings"
LangString turn_on ${LANG_SPANISH} "Abrir configuración"
LangString cfa ${LANG_ENGLISH} "Protected folders (Windows Defender)"
LangString cfa ${LANG_SPANISH} "Carpetas protegidas (Windows Defender)"
LangString cfa_on ${LANG_ENGLISH} "On. Windows will ask you to allow 53ON to write in them."
LangString cfa_on ${LANG_SPANISH} "Activadas. Windows le pedirá permiso para que 53ON pueda escribir en ellas."
LangString cfa_off ${LANG_ENGLISH} "Not required"
LangString cfa_off ${LANG_SPANISH} "No es necesario"
LangString cfa_msg ${LANG_ENGLISH} "Windows will now request permissions so that 53ON can write in your protected folders (Documents, Desktop, Pictures).$\r$\n$\r$\nOnly 53ON is added. Windows Defender stays on and nothing else is changed."
LangString cfa_msg ${LANG_SPANISH} "A continuación Windows solicitará permisos para que 53ON pueda escribir en sus carpetas protegidas (Documentos, Escritorio, Imágenes).$\r$\n$\r$\nSolo se agrega 53ON. Windows Defender sigue activo y no se cambia nada más."
LangString cfa_ask ${LANG_ENGLISH} "Asking Windows to allow 53ON in protected folders..."
LangString cfa_ask ${LANG_SPANISH} "Pidiendo a Windows permiso para 53ON en las carpetas protegidas..."
LangString t_un ${LANG_ENGLISH} "Uninstalling"
LangString t_un ${LANG_SPANISH} "Desinstalando"
LangString s_un ${LANG_ENGLISH} "Please wait while 53ON is removed from your computer."
LangString s_un ${LANG_SPANISH} "Espere mientras se desinstala 53ON de su equipo."
LangString broken ${LANG_ENGLISH} "This installer is damaged. Download it again."
LangString broken ${LANG_SPANISH} "Este instalador está dañado. Descárguelo de nuevo."
LangString unpack ${LANG_ENGLISH} "Extracting"
LangString unpack ${LANG_SPANISH} "Extrayendo"
LangString wait ${LANG_ENGLISH} "Waiting for 53ON to close..."
LangString wait ${LANG_SPANISH} "Esperando a que se cierre 53ON..."
LangString busy ${LANG_ENGLISH} "53ON is still running. Close it and try again."
LangString busy ${LANG_SPANISH} "53ON sigue en ejecución. Ciérrelo e inténtelo de nuevo."
LangString un_lnk ${LANG_ENGLISH} "Uninstall 53ON"
LangString un_lnk ${LANG_SPANISH} "Desinstalar 53ON"
LangString ask_un ${LANG_ENGLISH} "Are you sure you want to completely remove 53ON?"
LangString ask_un ${LANG_SPANISH} "¿Está seguro de que desea desinstalar 53ON por completo?"
LangString ask_data ${LANG_ENGLISH} "Do you also want to delete the 53ON user data (session, memory and complements)?"
LangString ask_data ${LANG_SPANISH} "¿Desea eliminar también los datos de usuario de 53ON (sesión, memoria y complementos)?"
LangString no_home ${LANG_ENGLISH} "53ON is not installed."
LangString no_home ${LANG_SPANISH} "53ON no está instalado."

Function .onInit
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 /update $R1
  ${IfNot} ${Errors}
    StrCpy $Mode update
    StrCpy $INSTDIR $EXEDIR
    ${GetOptions} $R0 /pid= $Pid
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 /uninstall $R1
  ${If} ${Errors}
    Return
  ${EndIf}
  StrCpy $Mode uninstall
  ReadRegStr $INSTDIR HKCU "${KEY}" InstallLocation
  ${If} $INSTDIR == ""
    MessageBox MB_ICONINFORMATION $(no_home) /SD IDOK
    Quit
  ${EndIf}
  ; a running exe cannot delete itself: its copy in TEMP does the work
  ${If} $EXEDIR == $INSTDIR
    CopyFiles /SILENT $EXEPATH "$TEMP\53on-uninstall.exe"
    StrCpy $R1 ""
    ${If} ${Silent}
      StrCpy $R1 " /S"
    ${EndIf}
    Exec '"$TEMP\53on-uninstall.exe" /uninstall$R1'
    Quit
  ${EndIf}
  MessageBox MB_OKCANCEL|MB_ICONQUESTION $(ask_un) /SD IDOK IDOK +2
  Quit
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 $(ask_data) /SD IDNO IDNO +2
  StrCpy $Wipe 1
FunctionEnd

; a failed update never leaves the owner without 53ON
Function .onInstFailed
  ${If} $Mode == update
    Exec '"$INSTDIR\app\53on.exe"'
  ${EndIf}
FunctionEnd

Function OnlyInstall
  ${If} $Mode != ""
    Abort
  ${EndIf}
FunctionEnd

!macro Cap cap text y uri
  ReadRegStr $R0 HKCU "${CAP}\${cap}" Value
  ReadRegStr $R1 HKCU "${CAP}\${cap}\NonPackaged" Value
  ReadRegStr $R2 HKLM "${CAP}\${cap}" Value
  ${If} $R0 == Deny
  ${OrIf} $R1 == Deny
  ${OrIf} $R2 == Deny
    ${NSD_CreateLabel} 0 ${y} 62% 12u "${text}: $(off)"
    Pop $0
    ${NSD_CreateButton} 64% ${y} 36% 14u $(turn_on)
    Pop $0
    nsDialogs::SetUserData $0 ${uri}
    ${NSD_OnClick} $0 OpenUri
  ${Else}
    ${NSD_CreateLabel} 0 ${y} 100% 12u "${text}: $(on)"
    Pop $0
  ${EndIf}
!macroend

Function Perms
  Call OnlyInstall
  !insertmacro MUI_HEADER_TEXT $(t_perm) $(s_perm)
  ; Defender's Controlled Folder Access (1 = on): reading it needs no admin
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "(Get-MpPreference).EnableControlledFolderAccess"'
  Pop $0
  Pop $Cfa
  IntOp $Cfa $Cfa + 0
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 44u $(perm)
  Pop $0
  !insertmacro Cap webcam $(cam) 52u ms-settings:privacy-webcam
  !insertmacro Cap microphone $(mic) 68u ms-settings:privacy-microphone
  ${If} $Cfa = 1
    ${NSD_CreateLabel} 0 84u 100% 20u "$(cfa): $(cfa_on)"
  ${Else}
    ${NSD_CreateLabel} 0 84u 100% 12u "$(cfa): $(cfa_off)"
  ${EndIf}
  Pop $0
  ${NSD_CreateLabel} 0 -12u 100% 12u $(go)
  Pop $0
  nsDialogs::Show
FunctionEnd

; an update runs hidden (/S, update.js jump): only the uninstall has a title of its own
Function Header
  ${If} $Mode == uninstall
    !insertmacro MUI_HEADER_TEXT $(t_un) $(s_un)
  ${EndIf}
FunctionEnd

Function OpenUri
  Pop $0
  nsDialogs::GetUserData $0
  Pop $0
  ExecShell open $0
FunctionEnd

; the 53ON that asked for the update (/pid=) ends its complements first and exits; its own children (GPU, renderers) still
; leave after it, and Aside waits for them
Function Wait
  ${If} $Pid != ""
    System::Call 'kernel32::OpenProcess(i 0x00100000, i 0, i $Pid) p .r0'
    ${If} $0 != 0
      DetailPrint $(wait)
      System::Call 'kernel32::WaitForSingleObject(p r0, i 120000)'
      System::Call 'kernel32::CloseHandle(p r0)'
    ${EndIf}
  ${EndIf}
FunctionEnd

; app goes aside as app.old once nothing runs from it: Windows renames a running exe but never its folder (measured 27-oct:
; a 53ON's children left 2.2 s after it, and 2 s of patience lost the race). $R9: how many quarters of a second it waits
Function Aside
  RMDir /r "$INSTDIR\app.old"
  ; an Explorer window inside app holds it like an open file (the 1.0.58 that never landed): it goes one level up, still open
  System::Call 'Kernel32::SetEnvironmentVariable(t "OWN_HOME", t "$INSTDIR")i'
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "$$a = (Join-Path $$env:OWN_HOME 'app').ToLower() + '\'; (New-Object -ComObject Shell.Application).Windows() | ? { try { (([Uri]$$_.LocationURL).LocalPath.ToLower() + '\').StartsWith($$a) } catch { $$false } } | % { $$_.Navigate($$env:OWN_HOME) }"`
  Pop $0
  StrCpy $1 0
  ${DoWhile} ${FileExists} "$INSTDIR\app\*.*"
    ClearErrors
    Rename "$INSTDIR\app" "$INSTDIR\app.old"
    ${IfNot} ${Errors}
      ${Break}
    ${EndIf}
    Sleep 250
    IntOp $1 $1 + 1
    ${If} $1 >= $R9
      Abort $(busy)
    ${EndIf}
  ${Loop}
FunctionEnd

; the app this file carries, unpacked beside the running one while its owner works; once its 53ON has closed it takes the
; old one's place
Function Swap
  RMDir /r "$INSTDIR\app.new"
  InitPluginsDir
  SetCompress off   ; packed by 7-Zip (LZMA2 and its exe filter): 12% smaller than NSIS' own lzma
  File "/oname=$PLUGINSDIR\app.7z" "${PACK}"
  SetCompress auto
  SetOutPath "$INSTDIR\app.new"
  ${If} ${Silent}
    Nsis7z::Extract "$PLUGINSDIR\app.7z"
  ${Else}
    Nsis7z::ExtractWithDetails "$PLUGINSDIR\app.7z" "$(unpack) %s..."
  ${EndIf}
  Delete "$PLUGINSDIR\app.7z"
  SetOutPath $INSTDIR
  ${IfNot} ${FileExists} "$INSTDIR\app.new\53on.exe"
    RMDir /r "$INSTDIR\app.new"
    Abort $(broken)
  ${EndIf}
  ; 53ON, which waited for this, now closes (update.js jump)
  FileOpen $0 "$INSTDIR\app.new.ready" w
  FileClose $0
  Call Wait
  StrCpy $R9 120   ; up to 30 s while the old app's own processes leave
  Call Aside
  ClearErrors
  Rename "$INSTDIR\app.new" "$INSTDIR\app"
  ${If} ${Errors}
    Rename "$INSTDIR\app.old" "$INSTDIR\app"
    Abort $(busy)
  ${EndIf}
  Delete "$INSTDIR\app.new.ready"
  ${GetSize} "$INSTDIR\app" "/S=0K" $1 $2 $3
  WriteRegStr HKCU "${KEY}" DisplayName 53ON
  WriteRegStr HKCU "${KEY}" DisplayVersion ${VER}
  WriteRegStr HKCU "${KEY}" DisplayIcon "$INSTDIR\app\53on.exe"
  WriteRegStr HKCU "${KEY}" Publisher "VCORPS LLC"
  WriteRegStr HKCU "${KEY}" InstallLocation $INSTDIR
  WriteRegStr HKCU "${KEY}" UninstallString '"$INSTDIR\53on-setup.exe" /uninstall'
  WriteRegDWORD HKCU "${KEY}" EstimatedSize $1
  WriteRegDWORD HKCU "${KEY}" NoModify 1
  WriteRegDWORD HKCU "${KEY}" NoRepair 1
FunctionEnd

; a folder an exe runs from never moves: one that will not go means 53ON is open
Function Remove
  StrCpy $R9 8
  Call Aside
  Delete "$INSTDIR\app.old\53on.exe"
  ${If} ${FileExists} "$INSTDIR\app.old\53on.exe"
    Rename "$INSTDIR\app.old" "$INSTDIR\app"
    Abort $(busy)
  ${EndIf}
  RMDir /r "$INSTDIR\app.old"
  RMDir /r "$INSTDIR\app.new"
  Delete "$INSTDIR\53on-setup.exe"
  RMDir /r "${MENU}\53ON"
  Delete "${DESK}\53ON.lnk"
  DeleteRegKey HKCU "${KEY}"
  ${If} $Wipe = 1
    RMDir /r "$INSTDIR\data"
  ${EndIf}
  RMDir $INSTDIR
FunctionEnd

; the 53on-permits complement's own consent, now at install: ONLY this exe goes on Controlled Folder Access' allow-list,
; through the owner's UAC; Defender is never turned off, nothing else is touched. The path is fixed, so an update keeps it.
; It travels in an env var and is quoted by PowerShell itself (apostrophes doubled): no path can break out
Function Allow
  System::Call 'Kernel32::SetEnvironmentVariable(t "OWN_EXE", t "$INSTDIR\app\53on.exe")i'
  MessageBox MB_OK|MB_ICONINFORMATION $(cfa_msg) /SD IDOK
  DetailPrint $(cfa_ask)
  nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -Command "if ((Get-MpPreference).ControlledFolderAccessAllowedApplications -contains $$env:OWN_EXE) { exit 0 }; $$e = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Add-MpPreference -ControlledFolderAccessAllowedApplications ''' + $$env:OWN_EXE.Replace('''', '''''') + ''' -ErrorAction Stop')); try { $$p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $$e) -ErrorAction Stop; exit $$p.ExitCode } catch { exit 2 }"`
  Pop $0
FunctionEnd

Section
  SetAutoClose true
  ${If} $Mode == uninstall
    Call Remove
    Return
  ${EndIf}
  SetOutPath $INSTDIR
  ${If} $Mode != update
    SetAutoClose false
  ${EndIf}
  Call Swap
  ${If} $Mode == update
    Exec '"$INSTDIR\app\53on.exe"'   ; at once; the old folder goes after
    RMDir /r "$INSTDIR\app.old"
    Return
  ${EndIf}
  RMDir /r "$INSTDIR\app.old"
  ${If} $EXEPATH != "$INSTDIR\53on-setup.exe"
    CopyFiles /SILENT $EXEPATH "$INSTDIR\53on-setup.exe"
  ${EndIf}
  ${If} $Cfa = 1
    Call Allow
  ${EndIf}
  CreateDirectory "${MENU}\53ON"
  CreateShortCut "${MENU}\53ON\53ON.lnk" "$INSTDIR\app\53on.exe"
  CreateShortCut "${MENU}\53ON\$(un_lnk).lnk" "$INSTDIR\53on-setup.exe" /uninstall
  CreateShortCut "${DESK}\53ON.lnk" "$INSTDIR\app\53on.exe"
SectionEnd
