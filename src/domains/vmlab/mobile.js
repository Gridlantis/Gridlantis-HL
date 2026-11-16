const images = require("./images");
const vm = require("./vm");
const { CATALOG, byId } = require("./catalog");

// ─── VM LAB · mobile VMs ─────────────────────────────────────────────────────
// "New mobile VM": pick a phone OS from the catalog's mobile entries (Android
// builds, Linux phone systems) and get a VM set up for it in one step — the
// right firmware, a phone-shaped screen where the OS supports one, kept
// between boots (a phone is something you set up once), and its documented
// login on the card. If the OS is not downloaded yet, the download starts and
// the VM is created when it finishes.

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

function specFor(os, name) {
  const d = os.defaults || {};
  return { name: String(name || "").trim().slice(0, 80) || os.name, family: os.family, desktop: true,
    firmware: os.firmware || "bios", cpus: d.cpus || 2, memoryMb: d.memoryMb || 3072, diskGb: d.diskGb || 16,
    persistent: true, network: "nat", mobile: true, screen: os.screen || null, login: os.login || null };
}
const withImage = (spec, img) => Object.assign({}, spec, img.kind === "iso" ? { isoId: img.id } : { imageId: img.id });

function mobileCatalog() {
  const have = images.listImages();
  const jobs = images.listJobs();
  return CATALOG.filter(c => c.mobile).map(c => ({
    id: c.id, name: c.name, family: c.family, distro: c.distro, kind: c.kind, size: c.size, note: c.note,
    login: c.login || null, phoneScreen: !!c.screen,
    imageId: (have.find(i => i.osId === c.id) || {}).id || null,
    download: jobs.find(j => j.osId === c.id && !["done", "error", "cancelled"].includes(j.status)) || null,
  }));
}

async function createMobile({ osId, name }) {
  const os = byId(osId);
  if (!os || !os.mobile) throw err("unknown mobile OS");
  const spec = specFor(os, name);
  const img = images.listImages().find(i => i.osId === osId);
  if (img) return { env: await vm.createEnv(withImage(spec, img)) };
  const job = images.startDownload({ osId, after: rec => vm.createEnv(withImage(spec, rec)) });
  return { downloading: job };
}

module.exports = { createMobile, mobileCatalog };
