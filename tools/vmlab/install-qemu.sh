#!/bin/bash
# install-qemu.sh — put a working QEMU/KVM under vmlab/qemu without root.
#
# VM Lab only needs the qemu-system-x86_64 and qemu-img binaries plus firmware.
# On Debian/Ubuntu/Mint this downloads the distro's own packages with
# `apt-get download` (no root needed), unpacks them with dpkg-deb, and writes
# small wrapper scripts that point the binaries at the unpacked libraries,
# modules and firmware. Open HL finds vmlab/qemu/bin automatically.
#
# If you have root, the system packages are the better option and Open HL will
# use them from PATH instead:
#     sudo apt install qemu-system-x86 qemu-utils ovmf
#
# Usage: tools/vmlab/install-qemu.sh [target-dir]      (default: <repo>/vmlab/qemu)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/../.." && pwd)"
TARGET="${1:-$PROJECT/vmlab/qemu}"

command -v apt-get >/dev/null || { echo "apt-get not found — install QEMU with your package manager instead." >&2; exit 1; }
command -v dpkg-deb >/dev/null || { echo "dpkg-deb not found." >&2; exit 1; }

PKGS=(qemu-system-x86 qemu-system-common qemu-system-data qemu-utils qemu-block-extra
      seabios ovmf ipxe-qemu
      libslirp0 libspice-server1 libvirglrenderer1 libfdt1 libcacard0 libdaxctl1 libndctl6
      libpmem1 libpmemobj1 librados2 librbd1 libiscsi7 librdmacm1t64)
# Ubuntu 22.04 era names, tried when the t64 names do not exist.
ALT=(libusbredirparser1t64:libusbredirparser1 librdmacm1t64:librdmacm1)

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

echo "── downloading packages ──"
fetch() { apt-get download "$1" >/dev/null 2>&1; }
for p in "${PKGS[@]}" libusbredirparser1t64; do
  if ! fetch "$p"; then
    alt=""
    for a in "${ALT[@]}"; do [ "${a%%:*}" = "$p" ] && alt="${a#*:}"; done
    if [ -n "$alt" ] && fetch "$alt"; then echo "  $alt"; else echo "  ! could not download $p (skipped)"; fi
  else echo "  $p"; fi
done

echo "── unpacking into $TARGET ──"
rm -rf "$TARGET.new"; mkdir -p "$TARGET.new/root"
for d in ./*.deb; do dpkg-deb -x "$d" "$TARGET.new/root"; done

R="$TARGET.new/root"
LIB='$ROOT/usr/lib/x86_64-linux-gnu:$ROOT/usr/lib/x86_64-linux-gnu/ceph'
mkdir -p "$TARGET.new/bin"

# The firmware lookup path: QEMU's own data dir, plus seabios/ipxe which the
# data package links to by absolute /usr/share paths.
cat > "$TARGET.new/bin/qemu-system-x86_64" <<WRAP
#!/bin/sh
ROOT="\$(cd "\$(dirname "\$0")/../root" && pwd)"
export LD_LIBRARY_PATH="$LIB\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export QEMU_MODULE_DIR="\$ROOT/usr/lib/x86_64-linux-gnu/qemu"
exec "\$ROOT/usr/bin/qemu-system-x86_64" -L "\$ROOT/usr/share/qemu" -L "\$ROOT/usr/share/seabios" -L "\$ROOT/usr/lib/ipxe/qemu" "\$@"
WRAP
cat > "$TARGET.new/bin/qemu-img" <<WRAP
#!/bin/sh
ROOT="\$(cd "\$(dirname "\$0")/../root" && pwd)"
export LD_LIBRARY_PATH="$LIB\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
exec "\$ROOT/usr/bin/qemu-img" "\$@"
WRAP
chmod +x "$TARGET.new/bin/"*
# Open HL looks here for UEFI firmware when OVMF is not installed system-wide.
ln -sfn root/usr/share/OVMF "$TARGET.new/ovmf"

# Fix the absolute firmware symlinks in qemu-system-data to point inside ROOT.
find "$R/usr/share/qemu" -maxdepth 1 -type l | while read -r l; do
  dest="$(readlink "$l")"
  case "$dest" in /usr/*) ln -sfn "$R$dest" "$l" ;; esac
done

"$TARGET.new/bin/qemu-system-x86_64" --version | head -1
"$TARGET.new/bin/qemu-img" --version | head -1

rm -rf "$TARGET.old"; [ -e "$TARGET" ] && mv "$TARGET" "$TARGET.old"
mv "$TARGET.new" "$TARGET"
# The firmware symlinks above were absolute to TARGET.new; redo them for TARGET.
find "$TARGET/root/usr/share/qemu" -maxdepth 1 -type l | while read -r l; do
  dest="$(readlink "$l")"
  case "$dest" in "$TARGET.new"*) ln -sfn "$TARGET${dest#$TARGET.new}" "$l" ;; esac
done
rm -rf "$TARGET.old"

echo
echo "QEMU installed in $TARGET"
[ -r /dev/kvm ] && [ -w /dev/kvm ] && echo "KVM: available" || echo "KVM: /dev/kvm is not accessible — VMs will run slowly (TCG). Add yourself to the kvm group."
