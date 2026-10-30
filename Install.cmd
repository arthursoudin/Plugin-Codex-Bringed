@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-Tools.ps1" -Component Node
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Leia a mensagem acima e tente novamente.
  pause
)
