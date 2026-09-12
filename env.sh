# ===== portable environment — সব কিছু এই ফোল্ডারের ভেতরে (drive-এর নাম ছাড়াই) =====
# Self-locating: H:, D:, USB — যেকোনো জায়গায় ফোল্ডার নিলেই নিজে ঠিক path পাবে।
# Source before ANY work:  source "<folder>\env.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"   # MSYS form: /h/chatbot create
WIN="$(cd "$ROOT" && pwd -W)"                               # Windows form: H:/chatbot create
export ROOT WIN

# --- Portable toolchains first on PATH (shadow any system copies) ---
export PATH="$ROOT/tools/nodejs:$ROOT/.npm-global:$ROOT/.home/AppData/Local/Python/bin:$ROOT/.home/AppData/Local/Python/pythoncore-3.14-64:$PATH"

# --- npm / Node: cache, global packages, logs, repl history -> this folder ---
export npm_config_cache="$WIN/.npm/cache"
export npm_config_prefix="$WIN/.npm-global"
export npm_config_userconfig="$WIN/.npmrc"
export npm_config_update_notifier=false
export npm_config_fund=false
export NODE_REPL_HISTORY="$WIN/.tmp/node_repl_history"
export NODE_COMPILE_CACHE="$WIN/.tmp/node-compile-cache"
export YARN_CACHE_FOLDER="$WIN/.cache/yarn"
export BUN_INSTALL="$WIN/.cache/bun"
export DENO_DIR="$WIN/.cache/deno"

# --- Python / pip: cache, user site-packages, bytecode -> this folder ---
export PIP_CACHE_DIR="$WIN/.pip/cache"
export PIP_CONFIG_FILE="$WIN/pip.ini"
export PYTHONUSERBASE="$WIN/.python-user"
export PYTHONPYCACHEPREFIX="$WIN/.tmp/pycache"

# --- Temp (bash + Windows natives) -> this folder ---
export TMPDIR="$ROOT/.tmp"
export TEMP="$ROOT/.tmp"
export TMP="$ROOT/.tmp"

# --- Home / AppData / sessions / cookies -> this folder ---
export HOME="$ROOT/.home"
export USERPROFILE="$WIN/.home"
export APPDATA="$WIN/.home/AppData/Roaming"
export LOCALAPPDATA="$WIN/.home/AppData/Local"

# --- XDG (gh auth, ssh config, misc tools) -> this folder ---
export XDG_CACHE_HOME="$WIN/.home/.cache"
export XDG_CONFIG_HOME="$WIN/.home/.config"
export XDG_DATA_HOME="$WIN/.home/.local/share"

# --- git: global config lives here, never creates ~/.gitconfig elsewhere ---
export GIT_CONFIG_GLOBAL="$WIN/.gitconfig"

# --- Browser automation / other toolchains (insurance) -> this folder ---
export PLAYWRIGHT_BROWSERS_PATH="$WIN/.cache/ms-playwright"
export CARGO_HOME="$WIN/.cache/cargo"
export RUSTUP_HOME="$WIN/.cache/rustup"
export GOPATH="$WIN/.cache/go"
export GOMODCACHE="$WIN/.cache/go/pkg/mod"
export GOCACHE="$WIN/.cache/go-build"

echo "[env] Everything locked to $WIN (TEMP, HOME, APPDATA, npm, pip, git, sessions)"
