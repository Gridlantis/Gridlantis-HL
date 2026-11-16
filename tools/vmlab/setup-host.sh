#!/bin/bash
# setup-host.sh — one-time root setup for VM Lab on the host.
#
#   sudo tools/vmlab/setup-host.sh [--user NAME] [--no-packages]
#
# 1. Installs QEMU, qemu-img, UEFI firmware and the TPM emulator from the
#    distro (skip with --no-packages if you use tools/vmlab/install-qemu.sh).
# 2. Lets the Metis user open /dev/kvm (kvm group).
# 3. USB passthrough: USB device nodes are root-only by default, so QEMU run
#    by Metis cannot claim them. A udev rule gives a group read/write on them.
#    The group is plugdev when the user is already in it (no re-login needed),
#    otherwise a new "vmlab-usb" group.
#
# Undo: sudo rm /etc/udev/rules/65-metis-vmlab-usb.rules && sudo udevadm trigger
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }

USER_NAME="${SUDO_USER:-}"
PACKAGES=1
while [ $# -gt 0 ]; do
  case "$1" in
    --user) USER_NAME="$2"; shift 2 ;;
    --no-packages) PACKAGES=0; shift ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done
[ -n "$USER_NAME" ] || { echo "Pass --user NAME (the account Metis runs as)." >&2; exit 1; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }

if [ "$PACKAGES" = 1 ]; then
  if command -v apt-get >/dev/null; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y qemu-system-x86 qemu-utils ovmf swtpm
  elif command -v dnf >/dev/null; then
    dnf install -y qemu-kvm qemu-img edk2-ovmf swtpm
  elif command -v pacman >/dev/null; then
    pacman -S --needed --noconfirm qemu-full edk2-ovmf swtpm
  else
    echo "! Unknown package manager — install QEMU, qemu-img, OVMF and swtpm yourself."
  fi
fi

# KVM
if getent group kvm >/dev/null; then
  if ! id -nG "$USER_NAME" | tr ' ' '\n' | grep -qx kvm; then
    usermod -aG kvm "$USER_NAME"; echo "Added $USER_NAME to kvm (takes effect at next login)."
  fi
fi

# USB
if id -nG "$USER_NAME" | tr ' ' '\n' | grep -qx plugdev; then
  GROUP=plugdev
else
  GROUP=vmlab-usb
  getent group "$GROUP" >/dev/null || groupadd --system "$GROUP"
  usermod -aG "$GROUP" "$USER_NAME"
  echo "Added $USER_NAME to $GROUP (log out and back in, then restart Metis)."
fi
RULE=/etc/udev/rules/65-metis-vmlab-usb.rules
cat > "$RULE" <<RULES
# Metis VM Lab: let members of $GROUP pass USB devices through to VMs.
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", GROUP="$GROUP", MODE="0664"
RULES
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb --action=change
echo "USB rule installed: $RULE (group $GROUP)."
echo
echo "Done. Devices already plugged in were updated; VM Lab → USB should now show them as accessible."
