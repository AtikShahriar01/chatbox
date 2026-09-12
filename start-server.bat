@echo off
rem ============================================================
rem  Chatbox — NETWORK (LAN) Server Launcher
rem  Double-click to start. অন্য ডিভাইস থেকেও PC-র IP দিয়ে খোলা যাবে:
rem     http://<এই-PC-র-IP>:3000
rem  নিরাপত্তা: ঢুকতেই PIN লাগবে (লগইন ছাড়া কেউ কিছু করতে পারবে না)।
rem  প্রথমবার Windows Firewall অনুমতি চাইলে "Allow" করুন।
rem ============================================================
setlocal
cd /d "%~dp0"

rem -- LAN mode: middleware/guard private-IP Host/Origin allow করবে --
set "CHATBOX_NETWORK=lan"

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

rem -- Portable Node --
set "PATH=%~dp0tools\nodejs;%PATH%"

rem -- Kill anything already listening on our ports --
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r ":3000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r ":8765 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1

rem -- এই PC-র LAN IP দেখাও (অন্য ডিভাইস থেকে খুলতে এই ঠিকানা ব্যবহার করুন) --
echo.
echo  ============================================================
echo   Chatbox server চালু হচ্ছে (LAN mode - PIN লাগবে)
echo  ------------------------------------------------------------
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  for /f "tokens=*" %%b in ("%%a") do echo   অন্য ডিভাইস থেকে খুলুন:  http://%%b:3000
)
echo   এই PC থেকে খুলুন:         http://localhost:3000
echo  ============================================================
echo.

rem -- PC bridge: quiet background start, auto-restart if it crashes --
start "Chatbox PC Bridge" /MIN cmd /c ":again & node "%~dp0agent-bridge\server.js" >> "%~dp0agent-bridge\bridge-stdout.log" 2>&1 & timeout /t 2 /nobreak >nul & goto again"

rem -- Web app (foreground). Builds first if needed. LAN-এ শোনে (0.0.0.0) --
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
echo Chatbox LAN server চলছে — বন্ধ করতে এই উইন্ডো বন্ধ করুন।
node node_modules\next\dist\bin\next start -H 0.0.0.0 -p 3000
endlocal
