#!/bin/bash
# migrate.sh <user@host> [target-dir]
#
# Copies this Metis installation to another machine: code, all JSON stores,
# secrets and uploads. Nothing is deleted here — verify the target first, then
# remove this copy by hand.
#
# The secret files are mode 0600 and must stay that way, so the transfer
# preserves permissions rather than recreating them.
set -euo pipefail

DEST="${1:?usage: migrate.sh <user@host> [target-dir]}"
TARGET="${2:-\$HOME/Servers/Filebeam/Metis}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_OPTS=(-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)

say() { printf '\n══ %s\n' "$*"; }

say "Preflight"
ssh "${SSH_OPTS[@]}" "$DEST" true || { echo "✗ cannot ssh to $DEST"; exit 1; }

REMOTE_TARGET=$(ssh "${SSH_OPTS[@]}" "$DEST" "echo $TARGET")
echo "  target dir : $REMOTE_TARGET"

NODEV=$(ssh "${SSH_OPTS[@]}" "$DEST" 'node -v 2>/dev/null || echo none')
echo "  node       : $NODEV"
case "$NODEV" in
  none) echo "  ✗ node is not installed on the target — install Node 22+ first"; exit 1;;
  v1[0-9].*|v2[01].*)
    echo "  ! node $NODEV is older than the 22+ Metis expects."
    if [ "${ALLOW_OLD_NODE:-0}" = 1 ]; then
      echo "    ALLOW_OLD_NODE=1 set — continuing."
    else
      echo "    Re-run with ALLOW_OLD_NODE=1 to proceed, or install Node 22+ first."; exit 1
    fi;;
esac

NEED_KB=$(du -sk "$HERE" | cut -f1)
FREE_KB=$(ssh "${SSH_OPTS[@]}" "$DEST" "mkdir -p '$REMOTE_TARGET' && df -Pk '$REMOTE_TARGET' | tail -1 | awk '{print \$4}'")
echo "  need/free  : $((NEED_KB/1024))M / $((FREE_KB/1024))M"
[ "$FREE_KB" -gt "$NEED_KB" ] || { echo "  ✗ not enough space on target"; exit 1; }

if ssh "${SSH_OPTS[@]}" "$DEST" "[ -e '$REMOTE_TARGET/server.js' ]"; then
  echo "  ! $REMOTE_TARGET already contains a Metis install."
  read -rp "  overwrite it? [y/N] " a; [ "$a" = y ] || exit 1
fi

say "Transferring (~$((NEED_KB/1024))M)"
# -a preserves the 0600 modes on .env, .session_secret, mail_accounts.json,
# settings.json and social.json. Backups and scratch files are left behind.
# Anchored to the transfer root with a leading slash. Unanchored patterns also
# match inside uploads/, which silently dropped the .git and node_modules of
# projects the user had uploaded through the file browser.
EXCLUDES=(--exclude '/*.bak' --exclude '/data/**.bak' --exclude '/.env.bak*' --exclude '/*.log'
          --exclude '/node_modules' --exclude '/.git' --exclude '/*.out'
          --exclude '/*.json.corrupt' --exclude '/data/**.corrupt' --exclude '/repos')

if command -v rsync >/dev/null && ssh "${SSH_OPTS[@]}" "$DEST" 'command -v rsync >/dev/null'; then
  rsync -a --info=stats2 "${EXCLUDES[@]}" \
    -e "ssh ${SSH_OPTS[*]}" "$HERE"/ "$DEST:$REMOTE_TARGET"/
else
  echo "  (rsync unavailable on one end — falling back to tar over ssh)"
  tar -C "$HERE" -cpf - \
      --exclude='./*.bak' --exclude='./data/*/*.bak' --exclude='./data/*.bak' --exclude='./.env.bak*' --exclude='./*.log' \
      --exclude='./node_modules' --exclude='./.git' --exclude='./*.out' \
      --exclude='./*.json.corrupt' --exclude='./data/*/*.corrupt' --exclude='./repos' . \
    | ssh "${SSH_OPTS[@]}" "$DEST" "mkdir -p '$REMOTE_TARGET' && tar -C '$REMOTE_TARGET' -xpf -"
fi

say "Verifying transfer"
LOCAL_SUM=$(cd "$HERE" && find src server.js package.json -type f -exec sha256sum {} + | sort -k2 | sha256sum | cut -d' ' -f1)
REMOTE_SUM=$(ssh "${SSH_OPTS[@]}" "$DEST" "cd '$REMOTE_TARGET' && find src server.js package.json -type f -exec sha256sum {} + | sort -k2 | sha256sum | cut -d' ' -f1")
if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then echo "  ✓ code checksums match"
else echo "  ✗ CODE CHECKSUM MISMATCH"; exit 1; fi

echo "  secret file modes on target:"
ssh "${SSH_OPTS[@]}" "$DEST" "cd '$REMOTE_TARGET' && for f in .env .session_secret data/mail/mail_accounts.json data/settings.json data/social/social.json data/laptops/laptops.json data/calendar/gcal.json; do
  [ -e \"\$f\" ] && printf '    %-22s %s\n' \"\$f\" \"\$(stat -c%a \"\$f\")\"; done"
BADMODE=$(ssh "${SSH_OPTS[@]}" "$DEST" "cd '$REMOTE_TARGET' && for f in .env .session_secret data/mail/mail_accounts.json data/settings.json data/social/social.json data/laptops/laptops.json data/calendar/gcal.json; do
  [ -e \"\$f\" ] && [ \"\$(stat -c%a \"\$f\")\" != 600 ] && echo \"\$f\"; done" || true)
[ -z "$BADMODE" ] || { echo "  ✗ these are not 0600 on the target: $BADMODE"; exit 1; }

say "Boot test on target (background timers stubbed — no mail poll, no social publish)"
ssh "${SSH_OPTS[@]}" "$DEST" "cd '$REMOTE_TARGET' && \
  PORT=39777 PASSWORD=migrate-check timeout 25 node -r ./tools/refactor-harness/preload.js server.js > /tmp/metis-boot.log 2>&1 &
  sleep 6
  code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:39777/login || echo 000)
  echo \"  GET /login -> \$code\"
  C=\$(curl -s -i --max-time 10 -X POST -d 'password=migrate-check' http://127.0.0.1:39777/login | grep -i '^set-cookie' | sed 's/.*\(metis_session=[^;]*\).*/\1/')
  for p in / /notes /mail /finance; do
    printf '  %s  %s\n' \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H \"Cookie: \$C\" http://127.0.0.1:39777\$p)\" \"\$p\"
  done
  curl -s --max-time 10 -H \"Cookie: \$C\" http://127.0.0.1:39777/api/status; echo
  echo '  --- boot log ---'; sed 's/^/  /' /tmp/metis-boot.log
  pkill -f 'PORT=39777' 2>/dev/null; pkill -f 'node.*server.js' 2>/dev/null; true"

say "Done"
cat <<EOF
  Metis is installed at $REMOTE_TARGET on $DEST.

  Nothing was removed from this machine.

  To start it there:   ssh $DEST 'cd $REMOTE_TARGET && node server.js'

  Before running it there full time, stop this one — two instances polling the
  same mail and social accounts will fight over the same remote state.
EOF
