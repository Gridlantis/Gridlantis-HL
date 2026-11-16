const fs = require("fs");
const path = require("path");

// ─── VM LAB · host USB devices ───────────────────────────────────────────────
// Read straight from sysfs (no lsusb dependency). Passing a device through to a
// VM needs read/write on /dev/bus/usb/BBB/DDD, which by default only root has;
// tools/vmlab/setup-host.sh installs a udev rule that grants it.
const SYS = "/sys/bus/usb/devices";
const rd = (dir, f) => { try { return fs.readFileSync(path.join(dir, f), "utf8").trim(); } catch { return ""; } };

const CLASS = { "01": "Audio", "02": "Communications", "03": "HID", "06": "Imaging", "07": "Printer", "08": "Storage",
  "09": "Hub", "0a": "CDC data", "0b": "Smart card", "0e": "Video", "10": "Audio/Video", "e0": "Wireless", "ef": "Misc", "ff": "Vendor" };

function listUsb() {
  let names = [];
  try { names = fs.readdirSync(SYS); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (n.includes(":")) continue;                         // interfaces, not devices
    const dir = path.join(SYS, n);
    const vendorId = rd(dir, "idVendor");
    if (!vendorId) continue;
    const busnum = parseInt(rd(dir, "busnum"), 10), devnum = parseInt(rd(dir, "devnum"), 10);
    const devClass = rd(dir, "bDeviceClass");
    if (devClass === "09") continue;                       // hubs, including root hubs
    const ifaceClasses = new Set();
    try {
      for (const i of fs.readdirSync(dir)) if (i.startsWith(n + ":")) ifaceClasses.add(rd(path.join(dir, i), "bInterfaceClass"));
    } catch {}
    const classes = Array.from(ifaceClasses).filter(Boolean);
    const node = "/dev/bus/usb/" + String(busnum).padStart(3, "0") + "/" + String(devnum).padStart(3, "0");
    let accessible = false;
    try { fs.accessSync(node, fs.constants.R_OK | fs.constants.W_OK); accessible = true; } catch {}
    out.push({
      key: busnum + "-" + devnum, port: n, busnum, devnum, vendorId, productId: rd(dir, "idProduct"),
      manufacturer: rd(dir, "manufacturer"), product: rd(dir, "product") || "USB device " + vendorId + ":" + rd(dir, "idProduct"),
      serial: rd(dir, "serial"), speedMbps: parseInt(rd(dir, "speed"), 10) || null,
      classes: classes.map(c => CLASS[c] || c), hid: classes.includes("03"), node, accessible,
    });
  }
  return out.sort((a, b) => a.busnum - b.busnum || a.devnum - b.devnum);
}

// Devices are remembered by vendor:product (+ serial when there is one) so a
// template still finds its device after it is unplugged and moves address.
function findUsb(sel) {
  const all = listUsb();
  if (sel.busnum && sel.devnum) return all.find(d => d.busnum === +sel.busnum && d.devnum === +sel.devnum) || null;
  return all.find(d => d.vendorId === sel.vendorId && d.productId === sel.productId && (!sel.serial || d.serial === sel.serial)) || null;
}

module.exports = { findUsb, listUsb };
