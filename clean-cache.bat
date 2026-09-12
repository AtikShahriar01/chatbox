@echo off
setlocal EnableDelayedExpansion
title Chatbox Cache Cleaner
cd /d "%~dp0"

echo ============================================================
echo   Chatbox Cache Cleaner  ^(one-click safe cleanup^)
echo ------------------------------------------------------------
echo   Cleans ONLY regenerable junk:
echo     - npm cache (.npm\cache, .npm\tmp)
echo     - Node compile cache + Python pycache (.tmp)
echo     - pip cache (.pip\cache)
echo     - Next.js build cache (app\.next\cache)
echo     - old logs (.tmp\*.log, bridge stdout)
echo   NEVER touches: code, chats, settings, .auth, checkpoints,
echo                  node_modules, tools, .home data, .git
echo ============================================================
echo.
choice /c YN /m "Clean now? (Y = yes, N = no)"
if errorlevel 2 goto :done

rem -- size before --
for /f %%a in ('powershell -NoProfile -Command "[math]::Round((Get-ChildItem -LiteralPath '%~dp0' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1MB)"') do set "BEFORE=%%a"

echo.
echo [1/7] npm cache ...
if exist ".npm\cache" rd /s /q ".npm\cache" >nul 2>&1
if exist ".npm\tmp" rd /s /q ".npm\tmp" >nul 2>&1
echo [2/7] Node compile cache + Python pycache ...
if exist ".tmp\node-compile-cache" rd /s /q ".tmp\node-compile-cache" >nul 2>&1
if exist ".tmp\pycache" rd /s /q ".tmp\pycache" >nul 2>&1
if not exist ".tmp" md ".tmp" >nul 2>&1
echo [3/7] pip cache ...
if exist ".pip\cache" rd /s /q ".pip\cache" >nul 2>&1
echo [4/7] Next.js build cache (the build itself stays) ...
if exist "app\.next\cache" rd /s /q "app\.next\cache" >nul 2>&1
echo [5/7] old logs ...
del /q ".tmp\*.log" >nul 2>&1
del /q "agent-bridge\bridge-stdout.log" >nul 2>&1
if exist ".home\.npm\_logs" rd /s /q ".home\.npm\_logs" >nul 2>&1
echo [6/7] agent test scratch ...
if exist ".selftest\sec-demo" rd /s /q ".selftest\sec-demo" >nul 2>&1
echo [7/7] quarantine folder (_trash) ...
if exist "_trash" (
  choice /c YN /m "      _trash also delete? (quarantined junk - Y if you don't need it)"
  if errorlevel 2 goto :skiptrash
  rd /s /q "_trash" >nul 2>&1
  echo       _trash deleted
)
:skiptrash

rem -- size after --
for /f %%a in ('powershell -NoProfile -Command "[math]::Round((Get-ChildItem -LiteralPath '%~dp0' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1MB)"') do set "AFTER=%%a"
set /a FREED=BEFORE-AFTER

echo.
echo ============================================================
echo   DONE. Freed approx. !FREED! MB   (before !BEFORE! MB, now !AFTER! MB)
echo   Tip: PC bridge / app chalu thakle lock hoya file skip hobe -
echo        abar chalale sheta-o muche jabe.
echo ============================================================
:done
pause
endlocal
