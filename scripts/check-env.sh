#!/usr/bin/env bash
# Sanity check: is everything locked INSIDE this folder (any drive/location)?
# Usage:  source "<folder>/env.sh" && bash "<folder>/scripts/check-env.sh"
set -u

# self-locating expected root (Windows form, forward slashes, lowercase)
EXPECTED="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -W | tr '[:upper:]' '[:lower:]' | tr '\\' '/')"
fail=0

norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr '\\' '/' | sed -E 's|^/([a-z])/|\1:/|'; }

check() { # name value
  local name="$1" val="$2"
  local n; n="$(norm "$val")"
  case "$n" in
    "$EXPECTED"/*|"$EXPECTED")
      echo "  OK   $name = $val" ;;
    "")
      echo "  MISS $name is not set"; fail=1 ;;
    *)
      echo "  BAD  $name = $val   (points outside $EXPECTED)"; fail=1 ;;
  esac
}

echo "[check-env] verifying lockdown to: $EXPECTED"
check TEMP        "${TEMP:-}"
check TMP         "${TMP:-}"
check TMPDIR      "${TMPDIR:-}"
check HOME        "${HOME:-}"
check USERPROFILE "${USERPROFILE:-}"
check APPDATA     "${APPDATA:-}"
check LOCALAPPDATA "${LOCALAPPDATA:-}"
check XDG_CONFIG_HOME "${XDG_CONFIG_HOME:-}"
check npm_config_cache "${npm_config_cache:-}"
check npm_config_prefix "${npm_config_prefix:-}"
check PIP_CACHE_DIR "${PIP_CACHE_DIR:-}"
check PIP_CONFIG_FILE "${PIP_CONFIG_FILE:-}"
check PYTHONUSERBASE "${PYTHONUSERBASE:-}"
check GIT_CONFIG_GLOBAL "${GIT_CONFIG_GLOBAL:-}"
check PLAYWRIGHT_BROWSERS_PATH "${PLAYWRIGHT_BROWSERS_PATH:-}"

# Live confirmation from the tools themselves
command -v node >/dev/null 2>&1 && {
  nh=$(norm "$(node -e "console.log(require('os').homedir())" 2>/dev/null)")
  case "$nh" in
    "$EXPECTED"*) echo "  OK   node os.homedir() = $nh" ;;
    *) echo "  BAD  node os.homedir() = $nh"; fail=1 ;;
  esac
}
command -v python >/dev/null 2>&1 && {
  pc=$(norm "$(python -m pip cache dir 2>/dev/null)")
  case "$pc" in
    "$EXPECTED"*) echo "  OK   pip cache dir   = $pc" ;;
    *) echo "  BAD  pip cache dir   = $pc"; fail=1 ;;
  esac
}

if [ "$fail" = 0 ]; then
  echo "[check-env] PASS - everything points into this folder"
else
  echo "[check-env] FAIL - something points outside. Source env.sh first:"
  echo '  source "<folder>/env.sh"'
fi
exit $fail
