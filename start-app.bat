@echo off
rem ============================================================
rem  Chatbox - Production Server Launcher (robust)
rem  Double-click to start. Opens http://localhost:3000
rem  Also starts the PC bridge (localhost:8765).
rem  Safe to re-run: kills stale instances on the same ports first.
rem ============================================================
setlocal
cd /d "%~dp0"

rem -- Lock ALL temp/cache/session data inside this folder (nothing on C:) --
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "TEMP=%ROOT%\.tmp"
set "TMP=%ROOT%\.tmp"
set "HOME=%ROOT%\.home"
set "USERPROFILE=%ROOT%\.home"
set "APPDATA=%ROOT%\.home\AppData\Roaming"
set "LOCALAPPDATA=%ROOT%\.home\AppData\Local"
set "NODE_COMPILE_CACHE=%ROOT%\.tmp\node-compile-cache"
set "npm_config_cache=%ROOT%\.npm\cache"
set "npm_config_prefix=%ROOT%\.npm-global"

rem -- Use the portable Node shipped in tools\nodejs --
set "PATH=%~dp0tools\nodejs;%PATH%"

rem -- Kill anything already listening on our ports (stale instances) --
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r ":3000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r ":8765 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1

rem -- PC bridge: quiet background start, auto-restart if it crashes --
start "Chatbox PC Bridge" /MIN cmd /c ":again & node "%~dp0agent-bridge\server.js" >> "%~dp0agent-bridge\bridge-stdout.log" 2>&1 & timeout /t 2 /nobreak >nul & goto again"

rem -- Web app (foreground). Builds first if needed. --
cd /d "%~dp0app"
if not exist "node_modules\next" (
  echo Installing dependencies ^(first run on a new PC - few minutes^)...
  call node "%~dp0tools\nodejs\node_modules\npm\bin\npm-cli.js" install --no-audit --no-fund
)
if not exist ".next\BUILD_ID" (
  echo Building production bundle ^(first run only^)...
  call node node_modules\next\dist\bin\next build
)
start "" "http://localhost:3000/"
echo Chatbox running on http://localhost:3000  ^(close this window to stop^)
rem -H 127.0.0.1: the server answers ONLY to this PC — invisible to the LAN.
node node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000
endlocal
