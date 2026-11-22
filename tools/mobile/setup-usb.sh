#!/bin/bash
# setup-usb.sh — let Gridlantis-HL open Android phones plugged into this computer by USB
# (Gridlantis-HL → Mobile host). Run once on the machine running Gridlantis-HL, from the
# Gridlantis-HL folder:
#
#   sudo bash tools/mobile/setup-usb.sh
#   sudo bash tools/mobile/setup-usb.sh --uninstall
#
# Linux only lets root open a USB device unless a udev rule says otherwise, so
# adb lists the phone as "no permissions". This adds one rule that matches the
# adb interface itself (USB class ff, subclass 42, protocol 01), so it works for
# every brand without a vendor list, and gives the signed-in user access to it.
set -euo pipefail

RULE=/etc/udev/rules.d/51-openhl-android.rules
[ "$(id -u)" = 0 ] || { echo "run this with sudo" >&2; exit 1; }

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$RULE"
  udevadm control --reload-rules && udevadm trigger
  echo "Removed $RULE."
  exit 0
fi

cat > "$RULE" <<'EOF'
# Android debug bridge (adb) — written by Gridlantis-HL setup-usb.sh
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", ENV{ID_USB_INTERFACES}=="*:ff4201:*", MODE="0660", GROUP="plugdev", TAG+="uaccess"
EOF
getent group plugdev >/dev/null || groupadd -r plugdev
if [ -n "${SUDO_USER:-}" ] && ! id -nG "$SUDO_USER" | grep -qw plugdev; then
  usermod -aG plugdev "$SUDO_USER"
  echo "Added $SUDO_USER to plugdev (takes effect at next login; the rule's 'uaccess' covers you until then)."
fi
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb
echo "Done. Unplug the phone and plug it back in, then refresh Mobile host."
echo "On the phone, tap Allow on the \"Allow USB debugging?\" prompt."
