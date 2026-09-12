@echo off
rem ===== portable environment — self-locating, drive-এর নাম ছাড়াই =====
rem Run before any work:  call "<folder>\env.bat"
rem NOTE: no setlocal here on purpose - the vars must survive in the calling shell.

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "PATH=%ROOT%\tools\nodejs;%ROOT%\.home\AppData\Local\Python\bin;%ROOT%\.home\AppData\Local\Python\pythoncore-3.14-64;%ROOT%\.npm-global;%PATH%"

set "npm_config_cache=%ROOT%\.npm\cache"
set "npm_config_prefix=%ROOT%\.npm-global"
set "npm_config_userconfig=%ROOT%\.npmrc"
set "npm_config_update_notifier=false"
set "npm_config_fund=false"
set "NODE_REPL_HISTORY=%ROOT%\.tmp\node_repl_history"
set "NODE_COMPILE_CACHE=%ROOT%\.tmp\node-compile-cache"
set "YARN_CACHE_FOLDER=%ROOT%\.cache\yarn"
set "BUN_INSTALL=%ROOT%\.cache\bun"
set "DENO_DIR=%ROOT%\.cache\deno"

set "PIP_CACHE_DIR=%ROOT%\.pip\cache"
set "PIP_CONFIG_FILE=%ROOT%\pip.ini"
set "PYTHONUSERBASE=%ROOT%\.python-user"
set "PYTHONPYCACHEPREFIX=%ROOT%\.tmp\pycache"

rem Keep ALL temp/cache/home/session data off C: drive
set "TEMP=%ROOT%\.tmp"
set "TMP=%ROOT%\.tmp"
set "TMPDIR=%ROOT%\.tmp"
set "HOME=%ROOT%\.home"
set "USERPROFILE=%ROOT%\.home"
set "APPDATA=%ROOT%\.home\AppData\Roaming"
set "LOCALAPPDATA=%ROOT%\.home\AppData\Local"
set "XDG_CACHE_HOME=%ROOT%\.home\.cache"
set "XDG_CONFIG_HOME=%ROOT%\.home\.config"
set "XDG_DATA_HOME=%ROOT%\.home\.local\share"

set "GIT_CONFIG_GLOBAL=%ROOT%\.gitconfig"
set "PLAYWRIGHT_BROWSERS_PATH=%ROOT%\.cache\ms-playwright"
set "CARGO_HOME=%ROOT%\.cache\cargo"
set "RUSTUP_HOME=%ROOT%\.cache\rustup"
set "GOPATH=%ROOT%\.cache\go"
set "GOMODCACHE=%ROOT%\.cache\go\pkg\mod"
set "GOCACHE=%ROOT%\.cache\go-build"

echo [env] Everything locked to %ROOT%
