@echo off
setlocal EnableExtensions
title PonelePlay LAN Hub Local
cd /d "%~dp0"

netsh advfirewall firewall show rule name="PonelePlay LAN Hub TCP 4321" >nul 2>nul
if errorlevel 1 (
  echo Configurando Firewall de Windows (puerto 4321 y mDNS 5353)...
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -Wait -ArgumentList '/c netsh advfirewall firewall add rule name=\"PonelePlay LAN Hub TCP 4321\" dir=in action=allow protocol=TCP localport=4321 profile=any && netsh advfirewall firewall add rule name=\"PonelePlay mDNS UDP 5353\" dir=in action=allow protocol=UDP localport=5353 profile=any'"
)

echo Iniciando PonelePlay LAN Hub Local en puerto 4321...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4321/health' -TimeoutSec 1; if ($r.service -eq 'poneleplay-lan-hub') { Get-NetTCPConnection -LocalPort 4321 -State Listen -ErrorAction SilentlyContinue | Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -match '^node' } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 600 } } catch {}"

if exist "dist\poneleplay-lan.cjs" (
  node "dist\poneleplay-lan.cjs"
  goto :end
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
)
call npm start

:end
pause
