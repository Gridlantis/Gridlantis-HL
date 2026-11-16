#!/usr/bin/env bash
# Open HL live folders — set up this Linux PC.
#
# Run it as yourself (not with sudo): the live folders go in your home.
#   curl -fsSL http://<openhl>:3000/live/setup.sh | bash
#   curl -fsSL http://<openhl>:3000/live/setup.sh | bash -s -- --name "work PC"
#   curl -fsSL http://<openhl>:3000/live/setup.sh | bash -s -- --uninstall
#
# It installs a private Syncthing (the same version Open HL runs, downloaded
# from Open HL) as a user service, pointed at Open HL only: no discovery, relays
# or internet, just Open HL's tailnet address. Folders Open HL shares with this PC
# appear in ~/Open HL Live/<name>. Then it prints a pairing code to paste into
# Open HL → Live folders → Add a PC.
set -euo pipefail

OPENHL_URL="${OPENHL_URL:-__OPENHL_URL__}"
OPENHL_ID="${OPENHL_ID:-__OPENHL_ID__}"
OPENHL_IP="${OPENHL_IP:-__OPENHL_IP__}"
SYNC_PORT=__SYNC_PORT__
GUI="127.0.0.1:8386"
NAME=""; UNINSTALL=0; FOLDERS="$HOME/Open HL Live"

while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --folder) FOLDERS="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,15p' "$0" 2>/dev/null | sed 's/^# \?//' || true; exit 0 ;;
    *) echo "unknown option $1 (try --help)" >&2; exit 1 ;;
  esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

APP="$HOME/.local/share/openhl-live"
STHOME="$HOME/.local/state/openhl-live"
UNIT="$HOME/.config/systemd/user/openhl-live.service"
RUNIT="$HOME/.config/systemd/user/openhl-live-report.service"

[ "$(id -u)" != 0 ] || die "run this as your normal user, without sudo — the live folders live in your home"
command -v systemctl >/dev/null || die "this PC has no systemd"

if [ "$UNINSTALL" = 1 ]; then
  say "Removing Open HL live folders"
  systemctl --user disable --now openhl-live.service openhl-live-report.service 2>/dev/null || true
  rm -f "$UNIT" "$RUNIT"; systemctl --user daemon-reload 2>/dev/null || true
  rm -rf "$APP" "$STHOME"
  echo "Done. Your files in $FOLDERS are left as they are. Remove this PC in Open HL too."
  exit 0
fi

# ── Checks ───────────────────────────────────────────────────────────────────
say "1/4  Checking this PC"
case "$OPENHL_ID" in __*) die "this script must be downloaded from Open HL (…/live/setup.sh)" ;; esac
command -v curl >/dev/null || die "curl is missing"
command -v tailscale >/dev/null || die "Tailscale is not installed — https://tailscale.com/download/linux"
TS_IP="$(tailscale ip -4 2>/dev/null | head -n1 || true)"
[ -n "$TS_IP" ] || die "Tailscale is not connected — run 'sudo tailscale up' first"
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "no Syncthing build for $(uname -m)" ;;
esac
[ -n "$NAME" ] || NAME="$(hostname)"
NAME="$(printf '%s' "$NAME" | tr -cd 'A-Za-z0-9 ._-' | cut -c1-60)"
echo "   this PC:  $NAME at $TS_IP"
echo "   Open HL:    $OPENHL_IP"
echo "   folders:  $FOLDERS"

# ── Install ──────────────────────────────────────────────────────────────────
say "2/4  Installing Syncthing (from Open HL)"
mkdir -p "$APP" "$STHOME" "$FOLDERS" "$(dirname "$UNIT")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$OPENHL_URL/live/dl/linux-$ARCH" -o "$TMP/st.tgz" || die "could not download Syncthing from Open HL ($OPENHL_URL)"
ENTRY="$(tar -tzf "$TMP/st.tgz" | grep -E '^[^/]+/syncthing$' | head -n1)"
[ -n "$ENTRY" ] || die "the Syncthing download from Open HL is not what was expected"
tar -xzf "$TMP/st.tgz" -C "$TMP" --strip-components=1 "$ENTRY"
install -m 755 "$TMP/syncthing" "$APP/syncthing.new" && mv -f "$APP/syncthing.new" "$APP/syncthing"
"$APP/syncthing" --version | sed 's/^/   /'

[ -f "$STHOME/config.xml" ] || "$APP/syncthing" generate --home "$STHOME" --no-port-probing >/dev/null
KEYF="$STHOME/openhl-apikey"
[ -s "$KEYF" ] || { umask 077; head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$KEYF"; }
KEY="$(cat "$KEYF")"
( umask 077; printf 'STGUIAPIKEY=%s\nSTNOUPGRADE=1\n' "$KEY" > "$STHOME/openhl.env" )

# ── Service ──────────────────────────────────────────────────────────────────
say "3/4  Starting the service"
cat > "$UNIT" <<EOF
[Unit]
Description=Open HL live folders (Syncthing, synced with Open HL)
After=network-online.target

[Service]
EnvironmentFile=$STHOME/openhl.env
ExecStart="$APP/syncthing" serve --home "$STHOME" --no-browser --no-restart --gui-address=$GUI
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable openhl-live.service >/dev/null 2>&1
systemctl --user restart openhl-live.service
# Keep syncing while nobody is signed in (after a reboot, over SSH).
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != yes ]; then
  loginctl enable-linger "$USER" 2>/dev/null && echo "   keeps running when you are signed out" \
    || warn "it only runs while you are signed in — 'sudo loginctl enable-linger $USER' keeps it going after a reboot"
fi

api() { curl -fsS -X "$1" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' "http://$GUI$2" ${3:+--data "$3"}; }
for _ in $(seq 1 40); do api GET /rest/system/ping >/dev/null 2>&1 && break; sleep 0.5; done
api GET /rest/system/ping >/dev/null 2>&1 || { journalctl --user -u openhl-live -n 20 --no-pager >&2 || true; die "Syncthing did not start (log above)"; }

# JSON string escaping for paths and names.
js() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
api PATCH /rest/config/options "{\"listenAddresses\":[\"tcp://$TS_IP:$SYNC_PORT\"],\"globalAnnounceEnabled\":false,\"localAnnounceEnabled\":false,\"relaysEnabled\":false,\"natEnabled\":false,\"urAccepted\":-1,\"crashReportingEnabled\":false,\"autoUpgradeIntervalH\":0,\"startBrowser\":false,\"reconnectionIntervalS\":10}" >/dev/null
# Folders Open HL shares land in ~/Open HL Live/<name>, and changes go out a second after they happen.
api PATCH /rest/config/defaults/folder "{\"path\":\"$(js "$FOLDERS")\",\"fsWatcherDelayS\":1}" >/dev/null
MY_ID="$("$APP/syncthing" device-id --home "$STHOME")"
api PATCH "/rest/config/devices/$MY_ID" "{\"name\":\"$(js "$NAME")\"}" >/dev/null || true
api PUT "/rest/config/devices/$OPENHL_ID" "{\"deviceID\":\"$OPENHL_ID\",\"name\":\"Open HL\",\"addresses\":[\"tcp://$OPENHL_IP:$SYNC_PORT\"],\"autoAcceptFolders\":true,\"compression\":\"metadata\"}" >/dev/null
echo "   running; it talks to Open HL only ($OPENHL_IP:$SYNC_PORT)"

# Syncthing never tells Open HL when a folder here is in trouble (say the folder
# was replaced and lost its .stfolder marker), so a small reporter posts this
# PC's own view of each folder to Open HL every 10 seconds for the Live folders
# page: state, errors, what it still has to download and to upload.
( umask 077; printf 'GUI=%s\nKEYF=%q\nOPENHL_URL=%q\nOPENHL_ID=%s\nMY_ID=%s\n' "$GUI" "$KEYF" "$OPENHL_URL" "$OPENHL_ID" "$MY_ID" > "$STHOME/report.env" )
cat > "$APP/report.sh" <<'EOF'
#!/usr/bin/env bash
# Open HL live folders: tell Open HL how this PC's copy of each folder is doing.
. "$HOME/.local/state/openhl-live/report.env"
KEY="$(cat "$KEYF")"
api() { curl -fsS -m 5 -H "X-API-Key: $KEY" "http://$GUI$1" 2>/dev/null; }
while :; do
  if api /rest/system/ping >/dev/null; then
    body="{\"v\":1,\"id\":\"$MY_ID\",\"running\":true,\"folders\":{"; sep=""
    for f in $(api /rest/config/folders | grep -oE '"id": *"[A-Za-z0-9._-]+"' | sed -E 's/.*"([^"]+)"$/\1/'); do
      s="$(api "/rest/db/status?folder=$f")"; e="$(api "/rest/folder/errors?folder=$f&perpage=5")"
      c="$(api "/rest/db/completion?folder=$f&device=$OPENHL_ID")"
      body+="$sep\"$f\":{\"status\":${s:-null},\"errors\":${e:-null},\"openhl\":${c:-null}}"; sep=","
    done
    body+="}}"
  else
    body="{\"v\":1,\"id\":\"$MY_ID\",\"running\":false,\"folders\":{}}"
  fi
  curl -fsS -m 10 -X POST -H 'Content-Type: application/json' --data-binary "$body" "$OPENHL_URL/live/report" >/dev/null 2>&1
  sleep 10
done
EOF
chmod 755 "$APP/report.sh"
cat > "$RUNIT" <<EOF
[Unit]
Description=Open HL live folders: report this PC's sync status to Open HL

[Service]
ExecStart=/usr/bin/env bash "$APP/report.sh"
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable openhl-live-report.service >/dev/null 2>&1
systemctl --user restart openhl-live-report.service
echo "   reporting its sync status to Open HL"

# ── Pairing code ─────────────────────────────────────────────────────────────
say "4/4  Pairing code — paste it into Open HL → Live folders → Add a PC"
JSON="$(printf '{"v":1,"name":"%s","id":"%s","host":"%s","os":"linux"}' "$(js "$NAME")" "$MY_ID" "$TS_IP")"
CODE="openhl-live:$(printf '%s' "$JSON" | base64 -w0 | tr '+/' '-_' | tr -d '=')"
printf '\n  %s\n\n' "$CODE"
printf '%s\n' "$CODE" > "$STHOME/pairing.txt"
echo "Then pick which live folders this PC gets. They appear in $FOLDERS."
echo "Running this again is safe: it keeps this PC's identity."
