#!/bin/bash
# deploy-agent.sh — put the Metis VM Lab agent on a second machine.
#
#   tools/vmlab/deploy-agent.sh [user@]host [options]
#
#   --port N        port the agent listens on           (default 3010)
#   --dir PATH      install directory on that machine   (default ~/metis-vmlab)
#   --no-qemu       skip installing QEMU there
#   --no-service    just install; do not start a systemd --user unit
#   --ssh "OPTS"    extra options for ssh/rsync (e.g. -i ~/.ssh/other_key)
#
# It copies the agent's code, makes sure QEMU is present, starts it as a
# systemd --user service, and prints the address and token to paste into
# Metis under VM Lab → Hosts → Add a VM host.
#
# The agent has no login of its own: the token is the whole of its security,
# so keep the port on a tailnet or LAN and never expose it to the internet.
set -euo pipefail

TARGET=""
PORT=3010
DIR="metis-vmlab"
WITH_QEMU=1
WITH_SERVICE=1
SSH_OPTS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --no-qemu) WITH_QEMU=0; shift ;;
    --no-service) WITH_SERVICE=0; shift ;;
    --ssh) SSH_OPTS="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \?//'; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 1 ;;
    *) [ -z "$TARGET" ] || { echo "give exactly one host" >&2; exit 1; }; TARGET="$1"; shift ;;
  esac
done
[ -n "$TARGET" ] || { echo "Usage: tools/vmlab/deploy-agent.sh [user@]host [--port N] [--dir PATH]" >&2; exit 1; }

HERE="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC2086
SSH() { ssh $SSH_OPTS -o ConnectTimeout=10 "$TARGET" "$@"; }

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/5  Checking $TARGET"
if ! SSH true 2>/dev/null; then
  cat >&2 <<EOF

✗ Cannot reach $TARGET over SSH.

  On that machine, enable one of:
    sudo tailscale up --ssh          # Tailscale SSH (no sshd, no keys)
    sudo apt install openssh-server  # a normal SSH server

  Or skip this script: copy this directory there yourself and run
  "node vmlab-agent.js" on it.
EOF
  exit 1
fi

REMOTE_HOME="$(SSH 'echo $HOME')"
case "$DIR" in /*) DEST="$DIR" ;; *) DEST="$REMOTE_HOME/$DIR" ;; esac

NODE_V="$(SSH 'command -v node >/dev/null && node -v || true')"
if [ -z "$NODE_V" ]; then
  echo "✗ node is not installed on $TARGET. Install Node 18 or newer there first." >&2
  exit 1
fi
case "${NODE_V#v}" in
  1[0-7].*|[0-9].*) echo "✗ $TARGET has node $NODE_V; the agent needs 18 or newer." >&2; exit 1 ;;
esac
echo "  node $NODE_V, installing into $DEST"

say "2/5  Copying the agent"
# Only src/, tools/ and the entry point are sent, so the data directories
# (vmlab/, uploads/, repos/ …) are already outside the transfer and need no
# exclude — and must not get one: an unanchored "--exclude vmlab" matches at
# every level, so it would silently drop src/domains/vmlab and src/ui/vmlab and
# leave an agent that cannot start. --delete only prunes inside the directories
# actually transferred, so the remote's own vmlab/ data is never touched.
EXCLUDES=(--exclude .git --exclude node_modules --exclude "*.log" --exclude .env --exclude "*.json.bak")
if command -v rsync >/dev/null && SSH 'command -v rsync >/dev/null'; then
  # shellcheck disable=SC2086
  rsync -az --delete-after "${EXCLUDES[@]}" ${SSH_OPTS:+-e "ssh $SSH_OPTS"} \
    "$HERE/src" "$HERE/vmlab-agent.js" "$HERE/tools" "$TARGET:$DEST/"
else
  echo "  (no rsync on one side — falling back to tar over ssh)"
  SSH "mkdir -p '$DEST'"
  tar -C "$HERE" -czf - \
    --exclude=node_modules --exclude='*.log' \
    src vmlab-agent.js tools | SSH "tar -C '$DEST' -xzf -"
fi

# A partial copy shows up as an unhelpful MODULE_NOT_FOUND three steps later.
MISSING="$(SSH "cd '$DEST' 2>/dev/null && for f in vmlab-agent.js src/vmlab-agent.js src/routes/vmlab-api.js src/domains/vmlab/catalog.js src/domains/vmlab/vm.js src/ws.js; do [ -f \"\$f\" ] || echo \"\$f\"; done")"
if [ -n "$MISSING" ]; then
  echo "✗ these files did not arrive at $DEST:" >&2
  echo "$MISSING" | sed 's/^/    /' >&2
  exit 1
fi

if [ "$WITH_QEMU" = 1 ]; then
  say "3/5  Making sure QEMU is there"
  if SSH "command -v qemu-system-x86_64 >/dev/null || [ -x '$DEST/vmlab/qemu/bin/qemu-system-x86_64' ]"; then
    echo "  already installed"
  elif [ "$(SSH 'id -u')" = 0 ]; then
    # We are root over there, so install the distro's own packages — that also
    # brings the UEFI firmware and the TPM emulator, which the user-space
    # fallback cannot provide.
    echo "  installing the distro packages on $TARGET (running as root)"
    SSH 'export DEBIAN_FRONTEND=noninteractive
      if command -v apt-get >/dev/null; then apt-get install -y qemu-system-x86 qemu-utils ovmf swtpm
      elif command -v dnf >/dev/null; then dnf install -y qemu-kvm qemu-img edk2-ovmf swtpm
      elif command -v pacman >/dev/null; then pacman -S --needed --noconfirm qemu-full edk2-ovmf swtpm
      else echo "unknown package manager" >&2; exit 1; fi' 2>&1 | tail -4
    SSH "command -v qemu-system-x86_64 >/dev/null" \
      || { echo "  ! QEMU is still not installed — install it on that machine and re-run" >&2; exit 1; }
  else
    echo "  running tools/vmlab/install-qemu.sh on $TARGET (user-space install, no root)"
    SSH "cd '$DEST' && bash tools/vmlab/install-qemu.sh" || {
      echo "  ! QEMU install failed — run 'sudo tools/vmlab/setup-host.sh --user \$USER' on that machine" >&2; }
  fi
else
  say "3/5  Skipping QEMU (--no-qemu)"
fi

say "4/5  Starting the agent"
if [ "$WITH_SERVICE" = 1 ]; then
  UNIT='[Unit]
Description=Metis VM Lab agent
After=network-online.target

[Service]
Type=simple
WorkingDirectory='"$DEST"'
Environment=VMLAB_AGENT_PORT='"$PORT"'
ExecStart='"$(SSH 'command -v node')"' '"$DEST"'/vmlab-agent.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target'
  SSH "mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/metis-vmlab-agent.service <<'UNITEOF'
$UNIT
UNITEOF
systemctl --user daemon-reload && systemctl --user enable --now metis-vmlab-agent.service"
  # Without lingering the unit dies when the last session on that machine ends.
  if ! SSH "loginctl show-user \$USER -p Linger 2>/dev/null | grep -q Linger=yes"; then
    echo "  ! The agent will stop when you log out of $TARGET. To keep it running:"
    echo "      ssh $TARGET 'sudo loginctl enable-linger \$USER'"
  fi
  sleep 2
  SSH "systemctl --user is-active --quiet metis-vmlab-agent.service" \
    || { echo "✗ the service did not start:"; SSH "systemctl --user status --no-pager -n 30 metis-vmlab-agent.service" || true; exit 1; }
  echo "  metis-vmlab-agent.service is running"
else
  echo "  --no-service: start it yourself with  cd $DEST && node vmlab-agent.js"
fi

say "5/5  Details for Metis"
TOKEN="$(SSH "cat '$DEST/vmlab/agent-token' 2>/dev/null" | tr -d '\r\n' || true)"
ADDR="$(SSH 'tailscale ip -4 2>/dev/null | head -1' | tr -d '\r\n' || true)"
[ -n "$ADDR" ] || ADDR="${TARGET#*@}"

if [ -z "$TOKEN" ]; then
  echo "  ! Could not read the token. On that machine: cat $DEST/vmlab/agent-token"
else
  cat <<EOF

  In Metis: VM Lab → Hosts → Add a VM host

    Address      $ADDR:$PORT
    Agent token  $TOKEN

EOF
fi
echo "  Logs:    ssh $TARGET 'journalctl --user -u metis-vmlab-agent -f'"
echo "  Restart: ssh $TARGET 'systemctl --user restart metis-vmlab-agent'"
