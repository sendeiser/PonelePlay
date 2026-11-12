@echo off
title PonelePlay LAN Hub Local
cd /d "%~dp0"
if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
)
echo Iniciando PonelePlay LAN Hub Local en puerto 4321...
call npm start
pause

