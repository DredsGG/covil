; Instalador do Covil (regra 15): por usuário, sem administrador, em %LOCALAPPDATA%\Programs\Covil,
; menu Iniciar, atalho na área de trabalho opcional (caixinha), desinstalador em "Aplicativos".
; Os dados ficam em %APPDATA%\Covil e não são apagados nem na atualização nem na desinstalação.
!include LogicLib.nsh
!include nsDialogs.nsh

; nunca pergunta "só para mim / para todos": sempre só para este usuário (sem pedir administrador)
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
  Var CovilAtalho
  Var CovilCaixa

  !macro customInit
    StrCpy $CovilAtalho "1"
  !macroend

  ; página com a caixinha do atalho (some na atualização em silêncio). As funções ficam dentro da macro
  ; porque ela entra depois que o electron-builder registra os plugins (${isUpdated} usa um deles).
  !macro customPageAfterChangeDir
    Page custom CovilAtalhoPagina CovilAtalhoSair
  Function CovilAtalhoPagina
    ${if} ${isUpdated}
      Abort
    ${endif}
    StrCpy $1 "Shortcuts"
    StrCpy $2 "Create a desktop shortcut"
    StrCpy $3 "Covil will be added to the Start menu. Your accounts and messages stay in %APPDATA%\Covil."
    ${if} $LANGUAGE == 1046
      StrCpy $1 "Atalhos"
      StrCpy $2 "Criar atalho na área de trabalho"
      StrCpy $3 "O Covil entra no menu Iniciar. Suas contas e mensagens ficam em %APPDATA%\Covil."
    ${elseif} $LANGUAGE == 2070
      StrCpy $1 "Atalhos"
      StrCpy $2 "Criar atalho no ambiente de trabalho"
      StrCpy $3 "O Covil entra no menu Iniciar. As suas contas e mensagens ficam em %APPDATA%\Covil."
    ${elseif} $LANGUAGE == 1034
    ${orif} $LANGUAGE == 3082
      StrCpy $1 "Accesos directos"
      StrCpy $2 "Crear acceso directo en el escritorio"
      StrCpy $3 "Covil se agrega al menú Inicio. Tus cuentas y mensajes quedan en %APPDATA%\Covil."
    ${endif}
    !insertmacro MUI_HEADER_TEXT "$1" ""
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 24u "$3"
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "$2"
    Pop $CovilCaixa
    ${if} $CovilAtalho == "1"
      ${NSD_Check} $CovilCaixa
    ${endif}
    nsDialogs::Show
  FunctionEnd

  Function CovilAtalhoSair
    ${NSD_GetState} $CovilCaixa $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $CovilAtalho "1"
    ${else}
      StrCpy $CovilAtalho "0"
    ${endif}
  FunctionEnd
  !macroend

  !macro customInstall
    ${ifNot} ${isUpdated}
      ${if} $CovilAtalho == "1"
        CreateShortCut "$DESKTOP\Covil.lnk" "$INSTDIR\Covil.exe" "" "$INSTDIR\Covil.exe" 0
      ${endif}
    ${endif}
  !macroend
!endif

!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\Covil.lnk"
  ${endif}
!macroend
