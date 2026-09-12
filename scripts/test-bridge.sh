#!/usr/bin/env bash
# Bridge v2 smoke tests — exercises every route with the running bridge.
# Paths use forward slashes: valid JSON, and Windows APIs accept them.
# Usage: bash "H:/chatbot create/scripts/test-bridge.sh"
set -u
BRIDGE="http://127.0.0.1:8765"
TOKEN=$(cat "H:/chatbot create/agent-bridge/bridge-token.txt")
AUTH="Authorization: Bearer $TOKEN"
WS="H:/chatbot create"
SBOX="$WS/.agent-selftest"          # sandbox inside the workspace
PASS=0; FAIL=0

req() { # method route json
  curl -s -X "$1" "$BRIDGE$2" -H "$AUTH" -H "Content-Type: application/json" ${3:+-d "$3"}
}
check() { # label actual expected-substring
  if echo "$2" | grep -q "$3"; then PASS=$((PASS+1)); echo "PASS: $1";
  else FAIL=$((FAIL+1)); echo "FAIL: $1 → $2"; fi
}
jid() { echo "$1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4; }

echo "== control =="
check "status"          "$(req GET /status)"                       '"ok":true'
check "workspace"       "$(req GET /workspace)"                    'chatbot create'
check "sysinfo"         "$(req POST /sysinfo '{}')"                '"platform":"win32"'

echo "== files CRUD in sandbox =="
req POST /file/delete "{\"path\":\"$SBOX\",\"recursive\":true}" >/dev/null
check "mkdir"           "$(req POST /file/mkdir "{\"path\":\"$SBOX/sub\"}")" '"ok":true'
check "write"           "$(req POST /file/write "{\"path\":\"$SBOX/hello.txt\",\"content\":\"hello world\"}")" '"bytes":11'
check "read"            "$(req POST /file/read "{\"path\":\"$SBOX/hello.txt\"}")"  'hello world'
check "edit"            "$(req POST /file/edit "{\"path\":\"$SBOX/hello.txt\",\"search\":\"world\",\"replace\":\"bridge\"}")" '"replacements":1'
check "move"            "$(req POST /file/move "{\"from\":\"$SBOX/hello.txt\",\"to\":\"$SBOX/sub/hi.txt\"}")" '"ok":true'
check "list"            "$(req POST /file/list "{\"path\":\"$SBOX\"}")"           'sub'
check "confine blocks outside workspace" "$(req POST /file/read '{"path":"C:/Windows/win.ini"}')" 'Outside workspace'
check "guard blocks agent-bridge files"  "$(req POST /file/read '{"path":"H:/chatbot create/agent-bridge/bridge-token.txt"}')" 'protected'

echo "== search =="
check "grep"            "$(req POST /grep "{\"pattern\":\"bridge\",\"path\":\"$SBOX\"}")"  'bridge'
check "search files"    "$(req POST /search/files "{\"query\":\"hi.txt\",\"path\":\"$SBOX\"}")" 'hi.txt'

echo "== git (throwaway repo in sandbox) =="
req POST /exec "{\"command\":\"git init -q\",\"cwd\":\"$SBOX\"}" >/dev/null
req POST /exec "{\"command\":\"git config user.email t@t.t\",\"cwd\":\"$SBOX\"}" >/dev/null
req POST /exec "{\"command\":\"git config user.name t\",\"cwd\":\"$SBOX\"}" >/dev/null
req POST /exec "{\"command\":\"echo x> a.txt\",\"cwd\":\"$SBOX\"}" >/dev/null
req POST /exec "{\"command\":\"git add -A\",\"cwd\":\"$SBOX\"}" >/dev/null
req POST /exec "{\"command\":\"git commit -qm init\",\"cwd\":\"$SBOX\"}" >/dev/null
check "git status"      "$(req POST /git/status "{\"cwd\":\"$SBOX\"}")"  '## '
check "git log"         "$(req POST /git/log "{\"cwd\":\"$SBOX\"}")"     'init'

echo "== checkpoint (git mode) + rollback =="
req POST /exec "{\"command\":\"echo CHANGED>> a.txt\",\"cwd\":\"$SBOX\"}" >/dev/null
CP=$(req POST /checkpoint/create "{\"label\":\"selftest\",\"cwd\":\"$SBOX\"}")
check "checkpoint create (git)" "$CP" '"mode":"git"'
CPID=$(jid "$CP")
req POST /exec "{\"command\":\"echo extra> b.txt\",\"cwd\":\"$SBOX\"}" >/dev/null
check "checkpoint list"  "$(req POST /checkpoint/list '{}')"  'selftest'
RB=$(req POST /checkpoint/rollback "{\"id\":\"$CPID\"}")
check "rollback"         "$RB" 'reset --hard'
check "rollback removed new file" "$(req POST /file/read "{\"path\":\"$SBOX/b.txt\"}")" 'error'
check "rollback kept tracked changes" "$(req POST /file/read "{\"path\":\"$SBOX/a.txt\"}")" 'CHANGED'

echo "== snapshot checkpoint (plain dir, deleteNew:false) =="
req POST /file/mkdir "{\"path\":\"$SBOX/nosnap\"}" >/dev/null
req POST /file/write "{\"path\":\"$SBOX/nosnap/s.txt\",\"content\":\"SNAP1\"}" >/dev/null
CP2=$(req POST /checkpoint/create "{\"label\":\"snaptest\",\"cwd\":\"$SBOX/nosnap\"}")
check "checkpoint create (snapshot)" "$CP2" '"mode":"snapshot"'
CP2ID=$(jid "$CP2")
req POST /file/write "{\"path\":\"$SBOX/nosnap/s.txt\",\"content\":\"SNAP2\"}" >/dev/null
req POST /file/write "{\"path\":\"$SBOX/nosnap/new.txt\",\"content\":\"x\"}" >/dev/null
RB2=$(req POST /checkpoint/rollback "{\"id\":\"$CP2ID\",\"deleteNew\":false}")
check "snapshot rollback" "$RB2" 'restored'
check "snapshot content restored" "$(req POST /file/read "{\"path\":\"$SBOX/nosnap/s.txt\"}")" 'SNAP1'
check "snapshot kept newer file" "$(req POST /file/read "{\"path\":\"$SBOX/nosnap/new.txt\"}")" '"ok":true'

echo "== processes =="
printf 'console.log("PROCOK"); setInterval(function(){}, 1000);\n' > "$SBOX/proc.js"
P=$(req POST /proc/start "{\"command\":\"node proc.js\",\"cwd\":\"$SBOX\"}")
PID=$(jid "$P")
sleep 1.5
check "proc start"      "$P" '"status":"running"'
check "proc output"     "$(req POST /proc/output "{\"id\":\"$PID\"}")" 'PROCOK'
check "proc list"       "$(req POST /proc/list '{}')" "$PID"
check "proc stop"       "$(req POST /proc/stop "{\"id\":\"$PID\"}")" '"ok":true'

echo "== SSE stream =="
printf 'console.log("SSEOK"); setInterval(function(){}, 1000);\n' > "$SBOX/sse.js"
P2=$(req POST /proc/start "{\"command\":\"node sse.js\",\"cwd\":\"$SBOX\"}")
SID=$(jid "$P2")
sleep 1.2
SSE=$(curl -s --max-time 2 "$BRIDGE/stream/$SID?token=$TOKEN" || true)
check "sse stream"      "$SSE" 'SSEOK'
req POST /proc/stop "{\"id\":\"$SID\"}" >/dev/null

echo "== terminals =="
T=$(req POST /term/create "{\"cwd\":\"$SBOX\"}")
TID=$(jid "$T")
check "term create"     "$T" '"ok":true'
req POST /term/write "{\"id\":\"$TID\",\"input\":\"echo TERMOK\"}" >/dev/null
sleep 1.2
check "term output"     "$(req POST /term/output "{\"id\":\"$TID\"}")" 'TERMOK'
check "term kill"       "$(req POST /term/kill "{\"id\":\"$TID\"}")" '"ok":true'

echo "== intelligence + policy =="
check "project inspect" "$(req POST /project/inspect "{\"cwd\":\"$WS/app\"}")" 'Next.js'
check "exec policy blocks .ssh" "$(req POST /exec '{"command":"type .ssh/id_rsa"}')" 'command policy'
check "exec ok"         "$(req POST /exec "{\"command\":\"echo EXECSHELL\",\"cwd\":\"$SBOX\"}")" 'EXECSHELL'
check "git branch create" "$(req POST /git/branch "{\"create\":\"agent-test\",\"cwd\":\"$SBOX\"}")" 'Switched\|agent-test'
check "git diff"        "$(req POST /git/diff "{\"cwd\":\"$SBOX\"}")" 'diff\|""'

echo "== cleanup =="
req POST /file/delete "{\"path\":\"$SBOX\",\"recursive\":true}" >/dev/null
echo "-------------------------------------"
echo "PASS=$PASS FAIL=$FAIL"
