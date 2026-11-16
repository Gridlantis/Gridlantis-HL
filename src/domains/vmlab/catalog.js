// ─── VM LAB · operating-system catalog ───────────────────────────────────────
// Each entry is something VM Lab knows how to fetch and boot sensibly.
//   kind 'cloud' — a ready-to-boot disk with cloud-init; Open HL seeds a user,
//                  password and the guest agent on first boot.
//   kind 'iso'   — an installer or live ISO; boots from CD onto a blank disk.
//   manual       — cannot be downloaded automatically (licensing); the entry
//                  links to the vendor and the ISO is uploaded or imported.
//   kind 'disk'  — a ready-to-boot disk image without cloud-init.
//   fileName     — the name to save as, when the URL does not end in one
//                  (SourceForge's ".../download" links).
//   resolve.dir  — builds that live in dated folders: the newest folder
//                  matching it is searched for `pattern`.
//   checksum     — "sha256": verify against the "<url>.sha256" published
//                  next to the file. ".xz" downloads are unpacked after.
//   mobile       — offered by "New mobile VM"; `screen` gives a phone-shaped
//                  display, `login` the image's documented default login.
// Android entries are x86_64 builds of Android that boot in QEMU like any
// live/installer ISO; their VMs forward adb, so Mobile host can mirror and
// control them with scrcpy. The Linux phone systems are postmarketOS's
// generic x86_64 images with a phone shell (Phosh, Plasma Mobile, GNOME
// Mobile), UEFI-booted disk images. (iOS has no equivalent: Apple does not
// license it for virtual machines.)
// `resolve` finds today's file name in a directory index, so point releases do
// not break the catalog. The highest version matching `pattern` wins.
const CATALOG = [
  { id: "ubuntu-24.04", name: "Ubuntu Server 24.04 LTS", family: "linux", distro: "ubuntu", kind: "cloud",
    url: "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img", size: "~600 MB",
    defaults: { cpus: 2, memoryMb: 2048, diskGb: 20 } },
  { id: "debian-13", name: "Debian 13 (trixie)", family: "linux", distro: "debian", kind: "cloud",
    url: "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2", size: "~350 MB",
    defaults: { cpus: 2, memoryMb: 2048, diskGb: 16 } },
  { id: "debian-12", name: "Debian 12 (bookworm)", family: "linux", distro: "debian", kind: "cloud",
    url: "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2", size: "~330 MB",
    defaults: { cpus: 2, memoryMb: 2048, diskGb: 16 } },
  { id: "fedora-cloud", name: "Fedora Cloud", family: "linux", distro: "fedora", kind: "cloud", size: "~550 MB",
    resolve: { index: ["https://download.fedoraproject.org/pub/fedora/linux/releases/45/Cloud/x86_64/images/",
                       "https://download.fedoraproject.org/pub/fedora/linux/releases/44/Cloud/x86_64/images/"],
               pattern: "Fedora-Cloud-Base-Generic-[0-9.-]+\\.x86_64\\.qcow2" },
    defaults: { cpus: 2, memoryMb: 2048, diskGb: 20 } },
  { id: "almalinux-9", name: "AlmaLinux 9", family: "linux", distro: "rhel", kind: "cloud", size: "~550 MB",
    url: "https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2",
    defaults: { cpus: 2, memoryMb: 2048, diskGb: 20 } },
  { id: "alpine", name: "Alpine Linux 3.22", family: "linux", distro: "alpine", kind: "cloud", size: "~180 MB",
    resolve: { index: ["https://dl-cdn.alpinelinux.org/alpine/v3.22/releases/cloud/"],
               pattern: "nocloud_alpine-3\\.22\\.[0-9]+-x86_64-bios-cloudinit-r0\\.qcow2" },
    defaults: { cpus: 1, memoryMb: 1024, diskGb: 8 } },
  { id: "ubuntu-desktop-24.04", name: "Ubuntu Desktop 24.04 (installer)", family: "linux", distro: "ubuntu", kind: "iso", desktop: true, size: "~6 GB",
    resolve: { index: ["https://releases.ubuntu.com/24.04/"], pattern: "ubuntu-24\\.04\\.[0-9]+-desktop-amd64\\.iso" },
    defaults: { cpus: 4, memoryMb: 4096, diskGb: 32 } },
  { id: "debian-13-xfce", name: "Debian 13 Live XFCE", family: "linux", distro: "debian", kind: "iso", desktop: true, size: "~3 GB",
    resolve: { index: ["https://cdimage.debian.org/debian-cd/current-live/amd64/iso-hybrid/"], pattern: "debian-live-[0-9.]+-amd64-xfce\\.iso" },
    defaults: { cpus: 2, memoryMb: 4096, diskGb: 24 } },
  { id: "kali", name: "Kali Linux (installer)", family: "linux", distro: "kali", kind: "iso", desktop: true, size: "~4 GB",
    resolve: { index: ["https://cdimage.kali.org/current/"], pattern: "kali-linux-[0-9.]+-installer-amd64\\.iso" },
    defaults: { cpus: 2, memoryMb: 4096, diskGb: 40 } },
  { id: "windows-11", name: "Windows 11", family: "windows", distro: "windows", kind: "iso", desktop: true, manual: true,
    infoUrl: "https://www.microsoft.com/software-download/windows11", firmware: "uefi",
    note: "Download the ISO from Microsoft, then upload or import it. Windows 11 expects TPM 2.0 — VM Lab adds one when swtpm is installed; otherwise use Windows 10 or the LabConfig bypass.",
    defaults: { cpus: 4, memoryMb: 8192, diskGb: 64 } },
  { id: "windows-10", name: "Windows 10", family: "windows", distro: "windows", kind: "iso", desktop: true, manual: true,
    infoUrl: "https://www.microsoft.com/software-download/windows10ISO", firmware: "bios",
    note: "Download the ISO from Microsoft, then upload or import it.",
    defaults: { cpus: 4, memoryMb: 6144, diskGb: 48 } },
  { id: "virtio-win", name: "VirtIO drivers + guest agent for Windows", family: "windows", distro: "windows", kind: "iso", size: "~700 MB",
    driverDisc: true,
    url: "https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso",
    note: "Attach as a second CD to a Windows VM and run virtio-win-guest-tools.exe — it installs the QEMU guest agent (guest IP, clean shutdown) and spice-vdagent (shared clipboard)." },
  { id: "blissos-16-foss", name: "Bliss OS 16.9.7 (Android 13)", family: "android", distro: "android", kind: "iso", mobile: true, desktop: true, size: "~2.3 GB",
    url: "https://sourceforge.net/projects/blissos-x86/files/Official/BlissOS16/FOSS/Generic/Bliss-v16.9.7-x86_64-OFFICIAL-foss-20241011.iso/download",
    fileName: "Bliss-v16.9.7-x86_64-OFFICIAL-foss-20241011.iso", defaults: { cpus: 4, memoryMb: 4096, diskGb: 24 },
    note: "Open-source apps (F-Droid, no Google). Boot menu: Live to try it, or Install to keep it on the disk (make the VM persistent first)." },
  { id: "blissos-16-gapps", name: "Bliss OS 16.9.7 (Android 13) with Google apps", family: "android", distro: "android", kind: "iso", mobile: true, desktop: true, size: "~2.4 GB",
    url: "https://sourceforge.net/projects/blissos-x86/files/Official/BlissOS16/Gapps/Generic/Bliss-v16.9.7-x86_64-OFFICIAL-gapps-20241011.iso/download",
    fileName: "Bliss-v16.9.7-x86_64-OFFICIAL-gapps-20241011.iso", defaults: { cpus: 4, memoryMb: 4096, diskGb: 24 },
    note: "Includes the Play Store. Google may flag the device as uncertified the first time; Bliss's docs explain registering it." },
  { id: "android-x86-9", name: "Android-x86 9.0-r2 (Android 9)", family: "android", distro: "android", kind: "iso", mobile: true, desktop: true, size: "~1 GB",
    url: "https://sourceforge.net/projects/android-x86/files/Release%209.0/android-x86_64-9.0-r2.iso/download",
    fileName: "android-x86_64-9.0-r2.iso", defaults: { cpus: 2, memoryMb: 3072, diskGb: 16 },
    note: "Older but light and very stable in VMs. Boot menu: \"Run Android-x86 without installation\", or Installation to keep it." },
  { id: "postmarketos-phosh", name: "postmarketOS 26.06 · Phosh", family: "linux", distro: "postmarketos", kind: "disk", mobile: true, desktop: true,
    firmware: "uefi", size: "~1.7 GB download", screen: { w: 720, h: 1440 }, login: { user: "user", password: "147147" }, checksum: "sha256",
    resolve: { index: ["https://images.nura.eco/bpo/v26.06/generic-x86_64/phosh/"], dir: "[0-9]{8}-[0-9]{4}/", pattern: "[0-9]{8}-[0-9]{4}-postmarketOS-v26\\.06-phosh-[0-9.]+-generic-x86_64-lts\\.img\\.xz" },
    defaults: { cpus: 2, memoryMb: 3072, diskGb: 16 },
    note: "Linux phone OS with Phosh, the shell of the Librem 5 / PinePhone. Login user / 147147 (the lock screen PIN too)." },
  { id: "postmarketos-plasma-mobile", name: "postmarketOS 26.06 · Plasma Mobile", family: "linux", distro: "postmarketos", kind: "disk", mobile: true, desktop: true,
    firmware: "uefi", size: "~2 GB download", screen: { w: 720, h: 1440 }, login: { user: "user", password: "147147" }, checksum: "sha256",
    resolve: { index: ["https://images.nura.eco/bpo/v26.06/generic-x86_64/plasma-mobile/"], dir: "[0-9]{8}-[0-9]{4}/", pattern: "[0-9]{8}-[0-9]{4}-postmarketOS-v26\\.06-plasma-mobile-[0-9.]+-generic-x86_64-lts\\.img\\.xz" },
    defaults: { cpus: 2, memoryMb: 3072, diskGb: 16 },
    note: "Linux phone OS with KDE Plasma Mobile. Login user / 147147." },
  { id: "postmarketos-gnome-mobile", name: "postmarketOS 26.06 · GNOME Mobile", family: "linux", distro: "postmarketos", kind: "disk", mobile: true, desktop: true,
    firmware: "uefi", size: "~1.7 GB download", screen: { w: 720, h: 1440 }, login: { user: "user", password: "147147" }, checksum: "sha256",
    resolve: { index: ["https://images.nura.eco/bpo/v26.06/generic-x86_64/gnome-mobile/"], dir: "[0-9]{8}-[0-9]{4}/", pattern: "[0-9]{8}-[0-9]{4}-postmarketOS-v26\\.06-gnome-mobile-[0-9.]+-generic-x86_64-lts\\.img\\.xz" },
    defaults: { cpus: 2, memoryMb: 3072, diskGb: 16 },
    note: "Linux phone OS with GNOME Shell's mobile layout. Login user / 147147." },
];

const byId = id => CATALOG.find(c => c.id === id) || null;

module.exports = { CATALOG, byId };
