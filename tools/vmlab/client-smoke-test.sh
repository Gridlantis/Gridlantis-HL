#!/bin/bash
# client-smoke-test.sh — run ON a client machine to check Open HL + VM Lab over the network.
#
#   OPENHL_URL=http://100.64.0.1:3000 OPENHL_PW='…' tools/vmlab/client-smoke-test.sh
#   ssh root@client "OPENHL_URL=… OPENHL_PW=… bash -s" < tools/vmlab/client-smoke-test.sh
#
# Checks: login, VM Lab API, host stats, console page, a full VNC handshake
# through the WebSocket tunnel to the first running VM, and the desktop app
# download. Needs curl and python3 on the client.
set -u
H="${OPENHL_URL:?set OPENHL_URL, e.g. http://100.64.0.1:3000}"
: "${OPENHL_PW:?set OPENHL_PW}"
J=$(mktemp); trap 'rm -f "$J"' EXIT
ok() { printf '  \033[32mok\033[0m  %s\n' "$*"; }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

echo "client: $(hostname) · $(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-unknown}")  →  $H"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$H/login") && [ "$code" = 200 ] && ok "reachable ($code)" || bad "cannot reach $H/login (got ${code:-nothing})"
code=$(curl -s -c "$J" -o /dev/null -w '%{http_code}' --data-urlencode "password=$OPENHL_PW" "$H/login")
[ "$code" = 302 ] && ok "login" || bad "login returned $code (wrong password or locked out)"

OV=$(curl -s -b "$J" "$H/api/vmlab/overview")
ENV_ID=$(printf '%s' "$OV" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin); r=[e for e in d["envs"] if e.get("running")]
  print(r[0]["id"] if r else "")
  sys.stderr.write("  ok  VM Lab: %d environments (%d running), %d images, KVM usable: %s\n" % (len(d["envs"]), len(r), len(d["images"]), d["capabilities"]["kvmUsable"]))
except Exception as e: sys.stderr.write("  FAIL VM Lab overview: %s\n" % e)')
curl -s -b "$J" "$H/api/vmlab/host/stats" | python3 -c 'import json,sys; l=json.load(sys.stdin)["latest"]; print("  ok  host CPU %s%% · memory %s%%" % (l["cpu"], l["mem"]))' 2>/dev/null || bad "host stats"

if [ -n "$ENV_ID" ]; then
  code=$(curl -s -b "$J" -o /dev/null -w '%{http_code}' "$H/vmlab/console/$ENV_ID"); [ "$code" = 200 ] && ok "console page" || bad "console page $code"
  COOKIE=$(awk '/openhl_session/{print $7}' "$J") URL="$H" ENV_ID="$ENV_ID" python3 - <<'PY' || FAILED=1
import os, socket, ssl, base64, struct
from urllib.parse import urlparse
u = urlparse(os.environ["URL"]); port = u.port or (443 if u.scheme == "https" else 80)
s = socket.create_connection((u.hostname, port), timeout=10)
if u.scheme == "https": s = ssl.create_default_context().wrap_socket(s, server_hostname=u.hostname)
host = u.netloc
s.sendall(("GET /api/vmlab/envs/%s/vnc HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
  "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: binary\r\nOrigin: %s://%s\r\nCookie: openhl_session=%s\r\n\r\n"
  % (os.environ["ENV_ID"], host, base64.b64encode(os.urandom(16)).decode(), u.scheme, host, os.environ["COOKIE"])).encode())
buf = b""
while b"\r\n\r\n" not in buf: buf += s.recv(4096)
head, rest = buf.split(b"\r\n\r\n", 1)
if b" 101 " not in head.split(b"\r\n")[0]: raise SystemExit("  FAIL VNC tunnel: " + head.split(b"\r\n")[0].decode())
def frame():
    global rest
    while len(rest) < 2: rest += s.recv(65536)
    n = rest[1] & 0x7f; o = 2
    if n == 126:
        while len(rest) < 4: rest += s.recv(65536)
        n = struct.unpack(">H", rest[2:4])[0]; o = 4
    elif n == 127:
        while len(rest) < 10: rest += s.recv(65536)
        n = struct.unpack(">Q", rest[2:10])[0]; o = 10
    while len(rest) < o + n: rest += s.recv(65536)
    p = rest[o:o+n]; rest = rest[o+n:]; return p
def send(p):
    m = os.urandom(4); s.sendall(bytes([0x82, 0x80 | len(p)]) + m + bytes(b ^ m[i % 4] for i, b in enumerate(p)))
frame(); send(b"RFB 003.008\n"); frame(); send(b"\x01"); frame(); send(b"\x01")
i = frame(); w, h = struct.unpack(">HH", i[:4])
print("  ok  VNC tunnel: %dx%d framebuffer from %s" % (w, h, i[24:24+struct.unpack(">I", i[20:24])[0]].decode()))
PY
else
  echo "  --  no running VM, skipped console + VNC tunnel checks"
fi

curl -s -b "$J" "$H/api/desktop/builds" | python3 -c 'import json,sys
b=json.load(sys.stdin)
print("  ok  desktop builds: " + ", ".join(x["name"] for x in b) if b else "  --  no desktop builds on the server")' 2>/dev/null || bad "desktop builds list"
exit $FAILED
