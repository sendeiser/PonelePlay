@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
title PonelePlay LAN Hub Local
cd /d "%~dp0"

echo.
echo ========================================================
echo   PONELEPLAY LAN HUB - MODO ULTRA RAPIDO (^< 2ms)
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Falta Node.js en esta PC ^(es gratis y liviano, se instala una sola vez^).
  where winget >nul 2>nul
  if not errorlevel 1 (
    echo Intentando instalar Node.js LTS automaticamente con Windows...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"
    where node >nul 2>nul
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Abriendo la pagina oficial de Node.js para que lo instales en 1 click...
  start "" "https://nodejs.org/"
  echo Cuando termine de instalarse Node.js, cerra esta ventana y volve a abrir Iniciar-PonelePlay-LAN.bat
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall show rule name="PonelePlay LAN Hub TCP 4321" >nul 2>nul
if errorlevel 1 (
  echo [1/2] Abriendo puerto 4321 y mDNS 5353 en el Firewall de Windows ^(una sola vez^)...
  echo       Por favor acepta la ventana de permiso de Windows ^(Si^).
  powershell -NoProfile -Command "try { Start-Process cmd -Verb RunAs -Wait -ArgumentList '/c netsh advfirewall firewall add rule name=\"PonelePlay LAN Hub TCP 4321\" dir=in action=allow protocol=TCP localport=4321 profile=any & netsh advfirewall firewall add rule name=\"PonelePlay mDNS UDP 5353\" dir=in action=allow protocol=UDP localport=5353 profile=any' } catch { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo [AVISO] No se pudo configurar el Firewall automaticamente. Si tu TV no conecta, usa red Privada o permite el puerto 4321.
  ) else (
    echo       Firewall listo!
  )
)

powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $lnk=Join-Path $d 'PonelePlay LAN Hub.lnk'; if (-not (Test-Path $lnk)) { $ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut($lnk); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.Description='PonelePlay LAN Hub Local (<2ms)'; $s.Save() }" >nul 2>nul

echo [2/2] Iniciando servidor LAN local + Puente Cloud...
echo.
if exist "%~dp0poneleplay-lan.cjs" (
  node "%~dp0poneleplay-lan.cjs"
) else if exist "%~dp0dist\poneleplay-lan.cjs" (
  node "%~dp0dist\poneleplay-lan.cjs"
) else (
  echo [ERROR] No se encontro poneleplay-lan.cjs en la misma carpeta. Descomprime el ZIP completo.
)

echo.
pause

