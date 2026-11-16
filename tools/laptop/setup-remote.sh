#!/bin/bash
# setup-remote.sh — let Metis remote into this PC (Metis → PC host).
#
#   curl -fsSL http://<metis-tailnet-ip>:<port>/laptops/setup.sh | sudo bash
#   sudo bash setup-remote.sh [options]
#
#   --metis IP      Metis's tailnet address; the only machine let in
#                   (filled in automatically when fetched from Metis)
#   --port N        VNC port on this PC's tailnet address       (default 5900)
#   --name NAME     what Metis calls this PC                    (default hostname)
#   --display D     X display to serve, e.g. :0   (default: find it — follows the
#                   login screen and whichever desktop is signed in)
#   --new-password  make a fresh password (re-pair in Metis after); a plain
#                   re-run keeps the password Metis already has
#   --x11           switch the login screen and desktop to Xorg even when no
#                   Wayland session is running right now
#   --keep-wayland  leave a Wayland PC alone (Metis then only reaches it when
#                   someone picks an X11 session by hand)
#   --uninstall     remove the service, password and firewall rule
#
# x11vnc can only share an Xorg screen. On a Wayland PC (KDE on SDDM — e.g.
# CachyOS, Fedora KDE — or GNOME on GDM) the script switches the login screen
# and the default session to Xorg, installing the X11 session if it is missing.
# That takes effect at the next reboot.
#
# KDE Plasma 6.8+ has no X11 session either. There the script runs KDE's own
# Desktop Sharing (krfb) in the signed-in session: unattended access with the
# Metis password, pre-authorized with the screen-sharing portal so nobody has
# to click Allow, restarted by systemd if it ever exits. Same limit as GNOME
# below: the desktop and lock screen, not the login screen.
#
# GNOME 49+ has no X11 session to switch to. There the script turns on GNOME
# Remote Desktop's own VNC server in the signed-in user's session instead,
# with the same password and Metis-only firewall guard. That shares the
# desktop and its lock screen, but not GDM's login screen: after a reboot
# Metis reaches the PC once someone signs in (or GDM auto-login does).
#
# The RustDesk model without a relay: a service that starts at boot and serves
# the screen whether or not anyone is signed in, plus a permanent random
# password. Metis stores that password from the pairing code and signs in with
# it every time, so you never type it. Unlike RustDesk, nothing leaves the
# tailnet — the VNC server listens only on this PC's Tailscale address and
# accepts only Metis's address, and the firewall is opened for that one peer.
set -euo pipefail

METIS_IP="${METIS_IP:-}"
PORT=5900
NAME=""
DISPLAY_ARG=""
NEW_PASSWORD=0
FORCE_X11=0
KEEP_WAYLAND=0
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --metis) METIS_IP="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --display) DISPLAY_ARG="$2"; shift 2 ;;
    --x11) FORCE_X11=1; shift ;;
    --keep-wayland) KEEP_WAYLAND=1; shift ;;
    --new-password) NEW_PASSWORD=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,43p' "$0" 2>/dev/null | sed 's/^# \?//' || echo "see the header of setup-remote.sh"; exit 0 ;;
    *) echo "unknown option $1 (try --help)" >&2; exit 1 ;;
  esac
done

CONF=/etc/metis-remote
UNIT=/etc/systemd/system/metis-remote.service
INFO_SOCKET=/etc/systemd/system/metis-remote-info.socket
INFO_SERVICE=/etc/systemd/system/metis-remote-info@.service
CLIP_SOCKET=/etc/systemd/system/metis-remote-clip.socket
CLIP_SERVICE=/etc/systemd/system/metis-remote-clip@.service
CLIP_SH=/usr/local/lib/metis-remote/clip.sh   # outside $CONF: that one is root-only
SDDM_DROPIN=/etc/sddm.conf.d/99-metis-x11.conf
GUARD_UNIT=/etc/systemd/system/metis-remote-guard.service
say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Install packages with whichever package manager this PC has. Output is kept
# so a failure shows why.
pkg_install() {
  if command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@"
  elif command -v dnf >/dev/null; then dnf install -y -q "$@"
  elif command -v pacman >/dev/null; then
    # No -Sy here: syncing without upgrading leaves Arch half-upgraded.
    pacman -S --noconfirm --needed "$@" || { warn "pacman failed — if it says 404 or 'not found', run 'sudo pacman -Syu' and try again"; return 1; }
  elif command -v zypper >/dev/null; then zypper -q install -y "$@"
  else return 2; fi
}

[ "$(id -u)" = 0 ] || die "run this with sudo — it installs a system service"
command -v systemctl >/dev/null || die "this PC has no systemd; set up x11vnc by hand"

# Run a command as the desktop user, inside their session's D-Bus (GNOME
# Remote Desktop's settings and its password in the keyring live there).
as_user() {
  local uid; uid="$(id -u "$DESK_USER")"
  runuser -u "$DESK_USER" -- env XDG_RUNTIME_DIR="/run/user/$uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" "$@"
}

# Remove our firewall rule, whichever firewall took it.
close_firewall() {
  local ip="$1" port="$2"
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw delete allow in on tailscale0 from "$ip" to any port "$port" proto tcp >/dev/null 2>&1 || true
  fi
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd -q --permanent --remove-rich-rule "rule family=ipv4 source address=$ip port port=$port protocol=tcp accept" 2>/dev/null || true
    firewall-cmd -q --reload || true
  fi
}

# ── Uninstall ────────────────────────────────────────────────────────────────
if [ "$UNINSTALL" = 1 ]; then
  say "Removing Metis remote desktop"
  systemctl disable --now metis-remote metis-remote-info.socket metis-remote-clip.socket metis-remote-guard 2>/dev/null || true
  if [ -f "$CONF/remote.env" ]; then
    # shellcheck disable=SC1091
    . "$CONF/remote.env"
    [ -n "${ALLOW:-}" ] && close_firewall "$ALLOW" "${RFBPORT:-5900}"
    [ -n "${ALLOW:-}" ] && close_firewall "$ALLOW" "${INFOPORT:-5899}"
    [ -n "${ALLOW:-}" ] && [ -n "${CLIPPORT:-}" ] && close_firewall "$ALLOW" "$CLIPPORT"
    if [ "${MODE:-}" = kde ] && [ -n "${DESKUSER:-}" ]; then
      DESK_USER="$DESKUSER"
      as_user systemctl --user disable --now app-org.kde.krfb.service >/dev/null 2>&1 || true
      rm -f "$(getent passwd "$DESK_USER" | cut -d: -f6)/.config/systemd/user/app-org.kde.krfb.service"
      as_user "$(command -v kwriteconfig6 || echo kwriteconfig5)" --file krfbrc --group Security --key allowUnattendedAccess false 2>/dev/null || true
      echo "KDE Desktop Sharing (krfb) stopped and unattended access turned off for $DESK_USER."
    fi
    if [ "${MODE:-}" = gnome ] && [ -n "${DESKUSER:-}" ]; then
      DESK_USER="$DESKUSER"
      as_user grdctl vnc disable 2>/dev/null && echo "GNOME Remote Desktop VNC turned off for $DESK_USER." \
        || warn "could not turn off GNOME's VNC sharing (is $DESKUSER signed in?) — Settings → System → Remote Desktop"
    fi
  fi
  rm -f "$UNIT" "$INFO_SOCKET" "$INFO_SERVICE" "$CLIP_SOCKET" "$CLIP_SERVICE" "$GUARD_UNIT"; rm -rf "$CONF" "$(dirname "$CLIP_SH")"
  if [ -f "$SDDM_DROPIN" ]; then
    rm -f "$SDDM_DROPIN"
    echo "SDDM's own display server setting applies again from the next reboot."
    echo "Pick the Wayland session on the login screen to go back to it."
  fi
  systemctl daemon-reload
  echo "Done. x11vnc itself is left installed. Forget this PC in Metis too."
  exit 0
fi

# ── Checks ───────────────────────────────────────────────────────────────────
say "1/5  Checking this PC"
command -v tailscale >/dev/null || die "Tailscale is not installed — https://tailscale.com/download/linux"
TS_IP="$(tailscale ip -4 2>/dev/null | head -n1 || true)"
[ -n "$TS_IP" ] || die "Tailscale is not connected — run 'sudo tailscale up' first"
[ -n "$METIS_IP" ] || die "Metis's tailnet address is unknown — re-run with --metis 100.x.y.z"
[[ "$METIS_IP" =~ ^100\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "--metis must be a tailnet IPv4 address (100.x.y.z), got '$METIS_IP'"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 3 ] && [ "$PORT" -le 65535 ] || die "--port must be 3–65535"
INFO_PORT=$((PORT - 1))   # hardware/usage info for the PC host card
CLIP_PORT=$((PORT - 2))   # clipboard bridge (KDE on Wayland only)
[ -n "$NAME" ] || NAME="$(hostname)"
NAME="$(printf '%s' "$NAME" | tr -cd 'A-Za-z0-9 ._-' | cut -c1-60)"
echo "   this PC:     $NAME at $TS_IP:$PORT"
echo "   Metis:       $METIS_IP (the only address let in)"

# ── Wayland → Xorg ───────────────────────────────────────────────────────────
# x11vnc serves X11 only; a Wayland desktop shows as a black screen or not at
# all. There is no VNC server that runs unattended on KDE's or GNOME's Wayland
# (they ask the person at the screen for permission), so the login screen and
# the default session are switched to Xorg instead.
WAYLAND=0
for s in $(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $1}'); do
  [ "$(loginctl show-session "$s" -p Type --value 2>/dev/null)" = wayland ] && WAYLAND=1
done
DM="$(basename "$(readlink -f /etc/systemd/system/display-manager.service 2>/dev/null || true)" .service)"
GDM_CONF=""
for f in /etc/gdm3/custom.conf /etc/gdm/custom.conf; do [ -f "$f" ] && GDM_CONF="$f" && break; done
# SDDM reads /usr/lib/sddm/sddm.conf.d, then /etc/sddm.conf.d, then
# /etc/sddm.conf; the last value wins. Our drop-in is excluded so a re-run
# sees what SDDM would do without it.
sddm_conf() {
  local f out=""
  for f in /usr/lib/sddm/sddm.conf.d/*.conf /etc/sddm.conf.d/*.conf /etc/sddm.conf; do
    [ -f "$f" ] && [ "$f" != "$SDDM_DROPIN" ] && out="$out$(cat "$f")"$'\n'
  done
  printf '%s' "$out"
}
SDDM_CONF="$(sddm_conf)"
if [ "$DM" = sddm ] && grep -qiE '^\s*DisplayServer\s*=\s*wayland' <<<"$SDDM_CONF" && [ ! -f "$SDDM_DROPIN" ]; then
  WAYLAND=1   # Wayland login screen, even if nobody is signed in to Wayland now
fi

x11_session() {
  local f
  for f in /usr/share/xsessions/plasmax11.desktop /usr/share/xsessions/plasma.desktop /usr/share/xsessions/*.desktop; do
    [ -f "$f" ] && { basename "$f"; return 0; }
  done
  return 1
}

# Which desktop is signed in on Wayland, and as whom. Decided by the session
# itself, not by what is installed: a PC can have GNOME installed and run KDE.
DESK_USER=""; DESK=""
for s in $(loginctl list-sessions --no-legend 2>/dev/null | awk '{print $1}'); do
  if [ "$(loginctl show-session "$s" -p Class --value 2>/dev/null)" = user ] &&
     [ "$(loginctl show-session "$s" -p Type --value 2>/dev/null)" = wayland ]; then
    DESK_USER="$(loginctl show-session "$s" -p Name --value)"
    DESK="$(loginctl show-session "$s" -p Desktop --value 2>/dev/null | tr 'A-Z' 'a-z')"
    break
  fi
done
case "$DESK" in *plasma*|*kde*) DESK=kde ;; *gnome*) DESK=gnome ;; *) DESK="" ;; esac
# GDM leaves the session's Desktop field empty; go by the shell that is running.
if [ -z "$DESK" ] && [ -n "$DESK_USER" ]; then
  if pgrep -u "$DESK_USER" -x plasmashell >/dev/null; then DESK=kde
  elif pgrep -u "$DESK_USER" -x gnome-shell >/dev/null; then DESK=gnome; fi
fi

# Pick how the screen is served:
#   x11    x11vnc on Xorg (switching the PC to Xorg if needed) — also reaches
#          the login screen
#   kde    KDE's krfb in the signed-in Plasma Wayland session, for Plasma 6.8+
#          (no X11 session exists) or a login screen this script cannot switch
#   gnome  GNOME Remote Desktop's VNC in the signed-in GNOME Wayland session,
#          for GNOME 49+ (no X11 session exists)
MODE=x11
if [ "$KEEP_WAYLAND" = 0 ] && [ "$FORCE_X11" = 0 ]; then
  if [ "$DESK" = kde ] && [ "$DM" != sddm ]; then MODE=kde
  elif [ "$DESK" = gnome ] && ! x11_session >/dev/null; then MODE=gnome
  fi
fi

# kde and gnome modes configure the signed-in user's session.
wayland_mode_checks() {
  [ -n "$DESK_USER" ] && [ "$DESK_USER" != root ] || die "sign in to the desktop first, then run this again"
  [ -S "/run/user/$(id -u "$DESK_USER")/bus" ] || die "$DESK_USER is not signed in to the desktop — sign in, then run this again"
  # An earlier run of this script turned GDM's Wayland off, which does nothing
  # useful without an X11 session; put it back.
  if [ -n "$GDM_CONF" ] && grep -qE '^\s*WaylandEnable\s*=\s*false' "$GDM_CONF" && ! x11_session >/dev/null; then
    sed -i -E 's/^\s*WaylandEnable\s*=\s*false/#WaylandEnable=false/' "$GDM_CONF"
    echo "   GDM: Wayland setting restored"
  fi
}
if [ "$MODE" = kde ]; then
  wayland_mode_checks
  echo "   KDE Plasma on Wayland: using KDE Desktop Sharing (krfb) for $DESK_USER"
elif [ "$MODE" = gnome ]; then
  wayland_mode_checks
  echo "   GNOME on Wayland with no X11 session: using GNOME Remote Desktop (VNC) for $DESK_USER"
fi

SWITCHED=0
if [ "$MODE" != x11 ]; then :
elif { [ "$WAYLAND" = 1 ] || [ "$FORCE_X11" = 1 ]; } && [ "$KEEP_WAYLAND" = 0 ]; then
  say "     Switching this PC from Wayland to Xorg (--keep-wayland to skip)"
  if [ "$DM" = sddm ] || { [ -z "$GDM_CONF" ] && command -v sddm >/dev/null; }; then
    # KDE: Plasma 6.4+ ships its X11 session as a separate package.
    if ! x11_session >/dev/null; then
      echo "   installing the Plasma X11 session"
      if command -v pacman >/dev/null; then pkg_install xorg-server xorg-xrandr plasma-x11-session
      elif command -v apt-get >/dev/null; then pkg_install xserver-xorg x11-xserver-utils plasma-session-x11 || pkg_install xserver-xorg x11-xserver-utils
      elif command -v dnf >/dev/null; then pkg_install xorg-x11-server-Xorg xrandr plasma-workspace-x11
      elif command -v zypper >/dev/null; then pkg_install xorg-x11-server xrandr plasma6-session-x11 || pkg_install xorg-x11-server xrandr
      fi || true
    elif ! command -v Xorg >/dev/null && [ ! -x /usr/lib/Xorg ]; then
      pkg_install xorg-server xorg-xrandr 2>/dev/null || pkg_install xserver-xorg 2>/dev/null || true
    fi
    if ! SESS="$(x11_session)"; then
      # Plasma 6.8+ has no X11 session at all: serve the Wayland desktop instead.
      [ "$DESK" = kde ] || die "no X11 desktop session is installed (nothing in /usr/share/xsessions). Install one, or re-run with --keep-wayland."
      MODE=kde
      wayland_mode_checks
      echo "   no X11 session for this Plasma: using KDE Desktop Sharing (krfb) for $DESK_USER"
    fi
  fi
  if [ "$MODE" = kde ]; then :
  elif [ "$DM" = sddm ] || { [ -z "$GDM_CONF" ] && command -v sddm >/dev/null; }; then
    install -d -m 755 /etc/sddm.conf.d
    {
      echo "# Written by Metis setup-remote.sh: x11vnc can only share an Xorg screen."
      echo "# Delete this file (or run setup-remote.sh --uninstall) to go back to Wayland."
      echo "[General]"
      echo "DisplayServer=x11"
      # Autologin names its own session; point it at the X11 one.
      if grep -qE '^\s*User\s*=\s*\S' <<<"$SDDM_CONF"; then
        echo
        echo "[Autologin]"
        echo "Session=$SESS"
      fi
    } > "$SDDM_DROPIN"
    chmod 644 "$SDDM_DROPIN"
    # The login screen preselects the last session used; make that the X11 one.
    STATE=/var/lib/sddm/state.conf
    if [ -f "$STATE" ] && grep -q '^Session=' "$STATE"; then
      sed -i -E "s|^Session=.*|Session=/usr/share/xsessions/$SESS|" "$STATE"
    elif [ -f "$STATE" ] && grep -q '^\[Last\]' "$STATE"; then
      sed -i "/^\[Last\]/a Session=/usr/share/xsessions/$SESS" "$STATE"
    elif [ -d /var/lib/sddm ]; then
      printf '[Last]\nSession=/usr/share/xsessions/%s\n' "$SESS" >> "$STATE"
      id sddm >/dev/null 2>&1 && chown sddm:sddm "$STATE" || true
    fi
    echo "   SDDM: login screen on Xorg, default session $SESS"
    SWITCHED=1
  elif [ -n "$GDM_CONF" ]; then
    if grep -qE '^\s*#?\s*WaylandEnable\s*=' "$GDM_CONF"; then
      sed -i -E 's/^\s*#?\s*WaylandEnable\s*=.*/WaylandEnable=false/' "$GDM_CONF"
    else
      sed -i '/^\[daemon\]/a WaylandEnable=false' "$GDM_CONF"
    fi
    x11_session >/dev/null || warn "no X11 desktop session is installed — newer GNOME dropped it; GDM may fall back to Wayland"
    echo "   GDM: Wayland turned off"
    SWITCHED=1
  else
    warn "a Wayland session is running, and this script only knows how to switch SDDM and GDM ($DM here)."
    warn "pick an X11/Xorg session on the login screen for remote access."
  fi
elif [ "$WAYLAND" = 1 ]; then
  warn "a Wayland session is running and --keep-wayland was given: Metis can only reach this PC"
  warn "when someone signs in to an X11/Xorg session."
fi

# ── Install the VNC server ───────────────────────────────────────────────────
X11VNC=""
if [ "$MODE" = kde ]; then
  say "2/5  Installing KDE Desktop Sharing (krfb)"
  if command -v krfb >/dev/null; then echo "   already installed"
  else pkg_install krfb || die "could not install krfb (see above)"; fi
  KWRITE="$(command -v kwriteconfig6 || command -v kwriteconfig5 || true)"
  [ -n "$KWRITE" ] || die "kwriteconfig6 is missing — it comes with KDE Frameworks; is this really a Plasma desktop?"
  command -v python3 >/dev/null || command -v perl >/dev/null || pkg_install python3 || pkg_install python || die "need python3 or perl to store krfb's password"
  # krfb listens on every address, so a guard rule drops the port for anyone but Metis.
  command -v nft >/dev/null || pkg_install nftables || warn "no nft: port $PORT is only guarded if your firewall blocks it"
elif [ "$MODE" = gnome ]; then
  say "2/5  Installing GNOME Remote Desktop"
  if command -v grdctl >/dev/null; then echo "   already installed"
  else pkg_install gnome-remote-desktop || die "could not install gnome-remote-desktop (see above)"; fi
  grdctl --help 2>&1 | grep -qw vnc || die "this build of GNOME Remote Desktop has no VNC server (only RDP), which Metis cannot speak"
  # GNOME listens on every address, not just the tailnet one, so a guard
  # rule drops the port for anyone but Metis.
  command -v nft >/dev/null || pkg_install nftables || warn "no nft: port $PORT is only guarded if your firewall blocks it"
else
  say "2/5  Installing x11vnc"
  if command -v x11vnc >/dev/null; then echo "   already installed"
  else
    rc=0; pkg_install x11vnc || rc=$?
    [ "$rc" = 2 ] && die "no known package manager — install x11vnc, then run this again"
    [ "$rc" = 0 ] && command -v x11vnc >/dev/null || die "could not install x11vnc (see above)"
  fi
  X11VNC="$(command -v x11vnc)"
fi

# ── Password ─────────────────────────────────────────────────────────────────
# VNC passwords stop at 8 characters; 8 random alphanumerics is ~47 bits, on
# top of only answering Metis's address. A re-run keeps the existing password
# so Metis stays paired.
install -d -m 700 "$CONF"
OLD_ALLOW=""; OLD_PORT=""; OLD_INFO=""; OLD_CLIP=""
if [ -f "$CONF/remote.env" ]; then
  OLD_ALLOW="$(sed -n 's/^ALLOW=//p' "$CONF/remote.env")"; OLD_PORT="$(sed -n 's/^RFBPORT=//p' "$CONF/remote.env")"
  OLD_INFO="$(sed -n 's/^INFOPORT=//p' "$CONF/remote.env")"
  OLD_CLIP="$(sed -n 's/^CLIPPORT=//p' "$CONF/remote.env")"
fi
PASS=""
if [ "$NEW_PASSWORD" = 0 ]; then
  if [ -s "$CONF/password" ]; then PASS="$(cat "$CONF/password")"
  elif [ -s "$CONF/pairing.txt" ]; then
    # Installed by an older copy of this script: recover it from the pairing code.
    b="$(sed 's/^metis-laptop://' "$CONF/pairing.txt" | tr -- '-_' '+/')"
    while [ $(( ${#b} % 4 )) -ne 0 ]; do b="$b="; done
    PASS="$(printf '%s' "$b" | base64 -d 2>/dev/null | sed -n 's/.*"password":"\([A-Za-z0-9]*\)".*/\1/p' || true)"
  fi
fi
if [ -n "$PASS" ]; then say "3/5  Keeping the existing password (--new-password to change it)"
else
  say "3/5  Making a password"
  RAND="$(tr -dc 'A-Za-z0-9' < <(head -c 512 /dev/urandom))"
  PASS="${RAND:0:8}"
fi
printf '%s' "$PASS" > "$CONF/password"; chmod 600 "$CONF/password"
if [ "$MODE" = x11 ]; then
  "$X11VNC" -storepasswd "$PASS" "$CONF/passwd" >/dev/null 2>&1
  chmod 600 "$CONF/passwd"
fi
cat > "$CONF/remote.env" <<EOF
MODE=$MODE
DESKUSER=$DESK_USER
LISTEN=$TS_IP
ALLOW=$METIS_IP
RFBPORT=$PORT
INFOPORT=$INFO_PORT
CLIPPORT=$CLIP_PORT
DISPLAY_OVERRIDE=$DISPLAY_ARG
X11VNC=$X11VNC
EOF
chmod 600 "$CONF/remote.env"

# ── Service ──────────────────────────────────────────────────────────────────
# Runs as root so it can reach the login screen's X server as well as the
# signed-in desktop. The launcher serves the newest X server — the signed-in
# desktop when there is one, else the login screen — with the auth file the
# display manager gave that server. When the display goes away (logout, login,
# a new session) x11vnc exits and systemd starts it on whatever is there now.
say "4/5  Starting the service"
if [ "$MODE" = x11 ]; then
cat > "$CONF/run.sh" <<'RUN'
#!/bin/sh
. /etc/metis-remote/remote.env
export HOME=/root
if [ -n "$DISPLAY_OVERRIDE" ]; then
  DISP="$DISPLAY_OVERRIDE"; AUTH=guess
else
  PID="$(pgrep -n -x Xorg || pgrep -n -x Xorg.bin || pgrep -n -x X || true)"
  if [ -z "$PID" ]; then echo "no X server yet (no login screen or X11 desktop running); waiting" >&2; sleep 10; exit 1; fi
  # shellcheck disable=SC2046
  set -- $(tr '\0' ' ' < "/proc/$PID/cmdline")
  DISP=""; AUTH=guess
  while [ $# -gt 0 ]; do
    case "$1" in :[0-9]*) DISP="$1" ;; -auth) AUTH="$2"; shift ;; esac
    shift
  done
  # GDM starts Xorg with -displayfd, so the number is not on its command line;
  # read it off the socket the server listens on instead.
  if [ -z "$DISP" ]; then
    SOCK="$(ss -xlpn 2>/dev/null | grep "pid=$PID," | grep -o '/tmp/.X11-unix/X[0-9]*' | head -n1)"
    [ -n "$SOCK" ] && DISP=":${SOCK##*/X}"
  fi
  [ -n "$DISP" ] || DISP=:0
fi
# The monitor layout rides along in the desktop name so Metis's viewer can show
# one monitor at a time ("WxH+X+Y/OUTPUT,…" from xrandr). -xrandr exit makes
# x11vnc quit when the layout changes, so systemd restarts it with a fresh one.
MONS=""
if command -v xrandr >/dev/null; then
  [ "$AUTH" = guess ] && XA="" || XA="$AUTH"
  MONS="$(DISPLAY="$DISP" XAUTHORITY="$XA" xrandr --listmonitors 2>/dev/null |
    awk 'NR > 1 { g = $3; gsub(/\/[0-9]+/, "", g); printf "%s%s/%s", (n++ ? "," : ""), g, $NF }')"
fi
DESKTOP="$(hostname)$DISP"
[ -n "$MONS" ] && DESKTOP="$DESKTOP metis-monitors=$MONS"
echo "serving display $DISP (auth $AUTH, monitors ${MONS:-unknown})" >&2
exec "$X11VNC" -display "$DISP" -auth "$AUTH" -rfbauth /etc/metis-remote/passwd -listen "$LISTEN" -allow "$ALLOW" \
  -rfbport "$RFBPORT" -no6 -noshm -forever -shared -noxdamage -repeat -norc -nolookup \
  -desktop "$DESKTOP" -xrandr exit
RUN
chmod 700 "$CONF/run.sh"
cat > "$UNIT" <<EOF
[Unit]
Description=Metis remote desktop (x11vnc on the tailnet, Metis only)
After=network-online.target tailscaled.service display-manager.service
Wants=network-online.target

[Service]
ExecStart=$CONF/run.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
fi

# Hardware and live usage for Metis's PC host card: a socket on the tailnet
# address, Metis only, that answers each connection with one line of JSON from
# info.sh and hangs up. (Not in the VNC desktop name: x11vnc cuts that at 127
# characters.) FreeBind lets it start before Tailscale has its address.
cat > "$CONF/info.sh" <<'INFO'
#!/bin/sh
# One line of JSON about this PC for Metis: what it is, and how busy it is now.
clean() { tr -d '"\\' | tr -s ' ' | sed 's/^ //;s/ $//'; }
CPU="$(sed -n 's/^model name[[:space:]]*:[[:space:]]*//p' /proc/cpuinfo | head -n1 | sed 's/(R)//g;s/(TM)//g;s/ CPU//' | clean)"
[ -n "$CPU" ] || CPU="$(lscpu 2>/dev/null | sed -n 's/^Model name:[[:space:]]*//p' | head -n1 | clean)"
CORES="$(nproc 2>/dev/null || echo 0)"
mem() { sed -n "s/^$1:[[:space:]]*\([0-9]*\).*/\1/p" /proc/meminfo; }
RAMKB="$(mem MemTotal)"; AVAILKB="$(mem MemAvailable)"
# CPU busy % over a short sample of /proc/stat.
s1="$(head -n1 /proc/stat)"; sleep 0.4; s2="$(head -n1 /proc/stat)"
CPUPCT="$(printf '%s\n%s\n' "$s1" "$s2" | awk '{ idle = $5 + $6; tot = 0; for (i = 2; i <= NF; i++) tot += $i; if (NR == 1) { i1 = idle; t1 = tot } else { dt = tot - t1; print (dt > 0 ? int(100 * (dt - (idle - i1)) / dt + 0.5) : 0) } }')"
GPUS=""
if command -v nvidia-smi >/dev/null 2>&1; then
  GPUS="$(nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits 2>/dev/null |
    awk -F', *' '{ n = $1; gsub(/["\\]/, "", n); if (n !~ /^NVIDIA/) n = "NVIDIA " n;
      printf "%s{\"name\":\"%s\",\"vramMb\":%d,\"vramUsedMb\":%d,\"util\":%d}", (c++ ? "," : ""), n, $2, $3, $4 }')"
fi
if [ -z "$GPUS" ] && command -v lspci >/dev/null 2>&1; then
  GPUS="$(lspci 2>/dev/null | grep -Ei 'vga|3d controller|display controller' |
    sed -E 's/^[^:]*:[^:]*: //;s/ \(rev [0-9a-f]+\)$//;s/ Corporation//;s/Advanced Micro Devices, Inc\. \[AMD\/ATI\]/AMD/' | clean |
    awk '{ printf "%s{\"name\":\"%s\"}", (c++ ? "," : ""), $0 }')"
fi
OS="$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-}" | clean)"
UP="$(cut -d. -f1 /proc/uptime)"
printf '{"v":1,"cpu":"%s","cores":%s,"cpuPct":%s,"ramKb":%s,"ramAvailKb":%s,"gpus":[%s],"os":"%s","uptime":%s}\n' \
  "$CPU" "${CORES:-0}" "${CPUPCT:-0}" "${RAMKB:-0}" "${AVAILKB:-0}" "$GPUS" "$OS" "${UP:-0}"
INFO
chmod 755 "$CONF/info.sh"
cat > "$INFO_SOCKET" <<SOCK
[Unit]
Description=Metis remote desktop: hardware info for Metis

[Socket]
ListenStream=$TS_IP:$INFO_PORT
FreeBind=yes
Accept=yes
IPAddressAllow=$METIS_IP
IPAddressDeny=any

[Install]
WantedBy=sockets.target
SOCK
cat > "$INFO_SERVICE" <<SVC
[Unit]
Description=Metis remote desktop: hardware info for Metis

[Service]
ExecStart=$CONF/info.sh
StandardInput=socket
StandardOutput=socket
StandardError=journal
RuntimeMaxSec=10
SVC
systemctl daemon-reload
if [ "$MODE" = x11 ]; then
  systemctl disable --now metis-remote-guard >/dev/null 2>&1 || true; rm -f "$GUARD_UNIT"
  systemctl enable metis-remote metis-remote-info.socket >/dev/null 2>&1
  systemctl restart metis-remote metis-remote-info.socket
else
  # x11vnc from an earlier run would only loop on "no X server"; retire it.
  systemctl disable --now metis-remote >/dev/null 2>&1 || true; rm -f "$UNIT"
  # Guard: krfb and GNOME's VNC listen on every address, so drop the port for anyone
  # but Metis (IPv6 included). Loaded at boot before the desktop starts.
  if command -v nft >/dev/null; then
    cat > "$CONF/guard.nft" <<NFT
table inet metis_remote
delete table inet metis_remote
table inet metis_remote {
  chain input {
    type filter hook input priority -10; policy accept;
    tcp dport $PORT ip saddr != $METIS_IP drop
    tcp dport $PORT meta nfproto ipv6 drop
  }
}
NFT
    cat > "$GUARD_UNIT" <<GUARD
[Unit]
Description=Metis remote desktop: only Metis may reach the VNC port
Before=network-pre.target display-manager.service
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$(command -v nft) -f $CONF/guard.nft
ExecStop=$(command -v nft) delete table inet metis_remote

[Install]
WantedBy=multi-user.target
GUARD
    systemctl daemon-reload
    systemctl enable metis-remote-guard >/dev/null 2>&1
    systemctl restart metis-remote-guard
    echo "   guard: port $PORT answers $METIS_IP only"
  fi
  systemctl daemon-reload
  systemctl enable metis-remote-info.socket >/dev/null 2>&1
  systemctl restart metis-remote-info.socket
  # A switch between the Wayland modes leaves the other server holding the port.
  if [ "$MODE" = kde ] && command -v grdctl >/dev/null; then as_user grdctl vnc disable >/dev/null 2>&1 || true; fi
  if [ "$MODE" = gnome ]; then as_user systemctl --user disable --now app-org.kde.krfb.service >/dev/null 2>&1 || true; fi
fi
if [ "$MODE" != kde ] && [ -f "$CLIP_SOCKET" ]; then
  systemctl disable --now metis-remote-clip.socket >/dev/null 2>&1 || true
  rm -f "$CLIP_SOCKET" "$CLIP_SERVICE"; rm -rf "$(dirname "$CLIP_SH")"; systemctl daemon-reload
fi

if [ "$MODE" = kde ]; then
  # krfb reads its password from KWallet first and only falls back to its
  # config file when the wallet will not open. Under GDM (or any login screen
  # without pam_kwallet) the wallet stays locked, and krfb would sit waiting
  # on an unlock prompt — so KWallet is told to deny krfb outright, and the
  # password goes in krfbrc, scrambled the way krfb expects
  # (KStringHandler::obscure: characters above U+0021 become U+1001F - c).
  if command -v python3 >/dev/null; then
    OBSCURED="$(printf '%s' "$PASS" | python3 -I -c 'import sys; print("".join(c if ord(c) <= 0x21 else chr(0x1001F - ord(c)) for c in sys.stdin.read()))')"
  else
    OBSCURED="$(printf '%s' "$PASS" | perl -CS -ne 'print join "", map { ord($_) <= 0x21 ? $_ : chr(0x1001F - ord($_)) } split //')"
  fi
  kw() { as_user "$KWRITE" --file "$1" --group "$2" --key "$3" "$4"; }
  kw krfbrc MainWindow startMinimized true
  kw krfbrc TCP useDefaultPort false
  kw krfbrc TCP port "$PORT"
  kw krfbrc TCP publishService false
  kw krfbrc Security allowDesktopControl true
  kw krfbrc Security allowUnattendedAccess true
  kw krfbrc Security unattendedPassword "$OBSCURED"
  kw krfbrc Security desktopPassword "$OBSCURED"
  kw krfbrc FrameBuffer preferredFrameBufferPlugin pw
  kw kwalletrc "Auto Deny" kdewallet krfb
  chmod 600 "$(getent passwd "$DESK_USER" | cut -d: -f6)/.config/krfbrc"
  # Screen sharing on Wayland goes through the desktop portal, which asks the
  # person at the screen. Pre-authorize krfb so it never asks.
  as_user busctl --user call org.freedesktop.impl.portal.PermissionStore /org/freedesktop/impl/portal/PermissionStore \
    org.freedesktop.impl.portal.PermissionStore SetPermission sbssas kde-authorized true remote-desktop org.kde.krfb 1 yes \
    || warn "could not pre-authorize krfb with the desktop portal — the PC may ask once on screen"
  # A user service named after krfb's app ID (the portal reads the ID from it),
  # started with the desktop and restarted if it ever exits.
  UHOME="$(getent passwd "$DESK_USER" | cut -d: -f6)"
  install -d -o "$DESK_USER" -g "$(id -gn "$DESK_USER")" "$UHOME/.config" "$UHOME/.config/systemd" "$UHOME/.config/systemd/user"
  cat > "$UHOME/.config/systemd/user/app-org.kde.krfb.service" <<KRFB
[Unit]
Description=KDE Desktop Sharing (krfb) for Metis
After=plasma-workspace.target
PartOf=graphical-session.target

[Service]
ExecStart=$(command -v krfb) --nodialog
Restart=always
RestartSec=3

[Install]
WantedBy=graphical-session.target
KRFB
  chown "$DESK_USER:" "$UHOME/.config/systemd/user/app-org.kde.krfb.service"
  as_user systemctl --user daemon-reload
  as_user systemctl --user enable app-org.kde.krfb.service >/dev/null 2>&1
  as_user systemctl --user restart app-org.kde.krfb.service

  # Clipboard bridge. krfb uses Qt's clipboard, which Wayland only lets a
  # focused window touch, so on its own copy/paste never crosses. Klipper (the
  # Plasma clipboard) can, over D-Bus: Metis talks to it through this socket
  # (tailnet address, Metis only), running as the desktop user.
  #   get          → the clipboard text
  #   set\n<text>  → replace it (text runs to end of input), answers "ok"
  #   watch        → "T <bytes>\n<text>" now and on every change, "." keep-alives
  install -d -m 755 "$(dirname "$CLIP_SH")"
  cat > "$CLIP_SH" <<'CLIP'
#!/bin/sh
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
QDBUS="$(command -v qdbus6 || command -v qdbus)"
k() { "$QDBUS" org.kde.klipper /klipper "$@"; }
# Command substitution eats trailing newlines; keep the text's own.
cur() { t="$(k getClipboardContents 2>/dev/null; echo x)"; t="${t%x}"; t="${t%?}"; }
IFS= read -r cmd
case "$cmd" in
  get) cur; printf '%s' "$t" ;;
  set) t="$(cat; echo x)"; t="${t%x}"; k setClipboardContents "$t" >/dev/null 2>&1 && echo ok || echo fail ;;
  watch)
    last=""; n=0; first=1
    while :; do
      cur
      if [ "$first" = 1 ] || [ "$t" != "$last" ]; then
        printf 'T %s\n%s' "$(printf '%s' "$t" | wc -c)" "$t" || exit 0
        last="$t"; first=0; n=0
      elif [ $((n += 1)) -ge 20 ]; then
        echo . || exit 0; n=0
      fi
      sleep 0.4
    done ;;
esac
CLIP
  chmod 755 "$CLIP_SH"
  cat > "$CLIP_SOCKET" <<SOCK
[Unit]
Description=Metis remote desktop: clipboard bridge for Metis

[Socket]
ListenStream=$TS_IP:$CLIP_PORT
FreeBind=yes
Accept=yes
IPAddressAllow=$METIS_IP
IPAddressDeny=any

[Install]
WantedBy=sockets.target
SOCK
  cat > "$CLIP_SERVICE" <<SVC
[Unit]
Description=Metis remote desktop: clipboard bridge for Metis

[Service]
User=$DESK_USER
ExecStart=$CLIP_SH
StandardInput=socket
StandardOutput=socket
StandardError=journal
LogLevelMax=notice
RuntimeMaxSec=12h
SVC
  systemctl daemon-reload
  systemctl enable metis-remote-clip.socket >/dev/null 2>&1
  systemctl restart metis-remote-clip.socket
  echo "   clipboard: bridged through Klipper on port $CLIP_PORT"
elif [ "$MODE" = gnome ]; then
  # GNOME Remote Desktop, VNC side, in the user's session. Password auth with
  # no prompt at the screen; no TLS layer (Metis's viewer speaks plain VNC
  # auth, and the traffic is inside WireGuard anyway).
  as_user grdctl vnc set-password "$PASS" >/dev/null || die "could not store the VNC password — is $DESK_USER's keyring unlocked?"
  # set-password can return 0 without storing anything; check it took.
  as_user grdctl status --show-credentials 2>/dev/null | sed -n '/^VNC/,$p' | grep -q 'Password:' \
    || die "GNOME did not keep the VNC password — unlock $DESK_USER's login keyring (Passwords and Keys) and run this again"
  as_user grdctl vnc set-auth-method password
  as_user grdctl vnc disable-view-only
  if [ "$PORT" != 5900 ]; then as_user grdctl vnc set-port "$PORT" 2>/dev/null || die "this GNOME cannot move VNC off port 5900; drop --port"; fi
  as_user gsettings set org.gnome.desktop.remote-desktop.vnc encryption "['none']" 2>/dev/null || true
  as_user grdctl vnc enable
  as_user systemctl --user enable gnome-remote-desktop.service >/dev/null 2>&1 || true
  as_user systemctl --user restart gnome-remote-desktop.service
fi

# Firewall: open the port to Metis only, on the tailnet interface only.
if [ -n "$OLD_ALLOW" ] && { [ "$OLD_ALLOW" != "$METIS_IP" ] || [ "$OLD_PORT" != "$PORT" ]; }; then
  close_firewall "$OLD_ALLOW" "${OLD_PORT:-5900}"
  [ -n "$OLD_INFO" ] && close_firewall "$OLD_ALLOW" "$OLD_INFO"
  [ -n "$OLD_CLIP" ] && close_firewall "$OLD_ALLOW" "$OLD_CLIP"
fi
OPEN_PORTS="$PORT $INFO_PORT"; [ "$MODE" = kde ] && OPEN_PORTS="$OPEN_PORTS $CLIP_PORT"
for P in $OPEN_PORTS; do
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow in on tailscale0 from "$METIS_IP" to any port "$P" proto tcp comment metis-remote >/dev/null
    echo "   ufw: allowed $METIS_IP → port $P on tailscale0"
  fi
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd -q --permanent --add-rich-rule "rule family=ipv4 source address=$METIS_IP port port=$P protocol=tcp accept"
    firewall-cmd -q --reload
    echo "   firewalld: allowed $METIS_IP → port $P"
  fi
done

# ── Check + pairing code ─────────────────────────────────────────────────────
say "5/5  Checking it answers"
ok=0
for _ in $(seq 1 15); do
  # x11vnc listens on the tailnet address only; GNOME on every address.
  if ss -ltnH "( sport = :$PORT )" 2>/dev/null | grep -qE "($TS_IP|0\.0\.0\.0|\*|\[::\]):$PORT"; then ok=1; break; fi
  sleep 1
done
if [ "$ok" = 1 ]; then echo "   listening on port $PORT"
elif [ "$SWITCHED" = 1 ]; then
  echo "   not yet — it starts once the PC comes back up on Xorg (reboot below)"
elif [ "$MODE" = kde ]; then
  warn "krfb is not listening yet. Its log:"
  as_user journalctl --user -u app-org.kde.krfb -n 25 --no-pager >&2 || true
elif [ "$MODE" = gnome ]; then
  warn "GNOME Remote Desktop is not listening yet. Its log:"
  as_user journalctl --user -u gnome-remote-desktop -n 25 --no-pager >&2 || true
else
  warn "x11vnc is not listening yet. Its log:"
  journalctl -u metis-remote -n 25 --no-pager >&2 || true
  warn "if it says it cannot open the display, sign in to an X11 desktop or pass --display :0"
fi

JSON="$(printf '{"v":1,"name":"%s","host":"%s","port":%s,"password":"%s"}' "$NAME" "$TS_IP" "$PORT" "$PASS")"
CODE="metis-laptop:$(printf '%s' "$JSON" | base64 -w0 | tr '+/' '-_' | tr -d '=')"
printf '%s\n' "$CODE" > "$CONF/pairing.txt"; chmod 600 "$CONF/pairing.txt"

say "Pairing code — paste it into Metis → PC host → Pair a PC"
printf '\n  %s\n\n' "$CODE"
echo "It is also kept in $CONF/pairing.txt (root only). Running this script again"
echo "keeps this password; --new-password makes a new one to re-pair with."
if [ "$SWITCHED" = 1 ]; then
  say "Reboot this PC to finish"
  echo "The login screen and desktop come back up on Xorg, and Metis can reach both."
  echo "Pairing now is fine; the PC shows offline in Metis until the reboot."
fi
if [ "$MODE" = kde ]; then
  say "KDE note"
  echo "Metis reaches this PC while $DESK_USER is signed in (locked screen is fine)."
  echo "After a reboot it is offline until someone signs in; turn on automatic login"
  echo "on the login screen to cover reboots (krfb's password does not need the wallet)."
fi
if [ "$MODE" = gnome ]; then
  say "GNOME note"
  echo "Metis reaches this PC while $DESK_USER is signed in (locked screen is fine)."
  echo "After a reboot it is offline until someone signs in. To cover reboots, turn on"
  echo "automatic login (Settings → System → Users) and give the login keyring an empty"
  echo "password (Passwords and Keys app) — GNOME keeps the VNC password in that keyring."
fi
