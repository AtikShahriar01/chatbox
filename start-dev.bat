@echo off
rem ============================================================
rem  Chatbox - Dev Server Launcher (hot reload)
rem  Double-click to start. Opens http://localhost:3000
rem ============================================================
setlocal
set "PORT=3000"

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
set "GIT_CONFIG_GLOBAL=%ROOT%\.gitconfig"

rem -- Use the portable Node shipped in tools\nodejs --
set "PATH=%~dp0tools\nodejs;%PATH%"

cd /d "%~dp0app"

echo Starting Chatbox dev server on http://localhost:%PORT% ...
start "Chatbox Dev Server" /MIN cmd /c "node node_modules\next\dist\bin\next dev -H 127.0.0.1 -p %PORT%"
timeout /t 5 /nobreak >nul
start "" "http://localhost:%PORT%/"
endlocal
