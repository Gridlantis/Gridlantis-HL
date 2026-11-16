const fs = require("fs");
const os = require("os");
const path = require("path");

// Run directly (`node discord-bots.js`), this file is the bot agent for another
// machine: it needs no Open HL config, only DISCORD_BOTS_DIR and where to listen.
const AGENT = require.main === module;
const { DISCORD_BOTS_DIR, DISCORD_BOT_AGENTS } = AGENT
  ? { DISCORD_BOTS_DIR: process.env.DISCORD_BOTS_DIR || "", DISCORD_BOT_AGENTS: [] }
  : require("../config");

// Discord bots running on this machine, one folder each under DISCORD_BOTS_DIR.
// They listen on no port, so the monitor can't probe them like a node. Instead
// a bot counts as online when a node/python process is running from its folder
// and holds an open HTTPS connection, which is the Discord gateway socket.
// Bots on other machines are checked the same way by this file running there
// as an agent; Open HL polls each agent in DISCORD_BOT_AGENTS.

const RUNTIMES = /^(node|nodejs|bun|deno|python[\d.]*)$/;
// The gateway reconnects now and then. Keep a running bot online for this long
// after its socket was last seen, so a routine reconnect doesn't raise an alert.
const RECONNECT_GRACE_MS = 90 * 1000;
const lastLinked = {};   // bot folder -> time its gateway socket was last seen

function isDiscordBot(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    if (deps["discord.js"] || deps.eris || deps.oceanic || deps["@discordjs/core"]) return true;
  } catch {}
  try { return /^\s*(discord\.py|py-cord|nextcord|disnake)\b/im.test(fs.readFileSync(path.join(dir, "requirements.txt"), "utf8")); } catch {}
  return false;
}

function discoverBots() {
  if (!DISCORD_BOTS_DIR) return [];
  let entries;
  try { entries = fs.readdirSync(DISCORD_BOTS_DIR, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith("."))
    .map(e => ({ name: e.name, dir: path.join(DISCORD_BOTS_DIR, e.name) }))
    .filter(b => isDiscordBot(b.dir))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every runtime process (not a shell sitting in the folder) by working dir.
function runtimeProcesses() {
  const out = [];
  let pids;
  try { pids = fs.readdirSync("/proc").filter(p => /^\d+$/.test(p)); } catch { return out; }
  for (const pid of pids) {
    try {
      const argv0 = fs.readFileSync("/proc/" + pid + "/cmdline", "utf8").split("\0")[0];
      if (!RUNTIMES.test(path.basename(argv0))) continue;
      out.push({ pid, cwd: fs.readlinkSync("/proc/" + pid + "/cwd") });
    } catch {}   // gone, or another user's process
  }
  return out;
}

// Socket inodes of established TCP connections to remote port 443.
function httpsSocketInodes() {
  const inodes = new Set();
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let lines;
    try { lines = fs.readFileSync(f, "utf8").split("\n").slice(1); } catch { continue; }
    for (const line of lines) {
      const c = line.trim().split(/\s+/);
      if (c.length < 10 || c[3] !== "01") continue;          // 01 = ESTABLISHED
      if (c[2].split(":")[1] !== "01BB") continue;           // remote port 443
      inodes.add(c[9]);
    }
  }
  return inodes;
}

function hasSocketIn(pid, inodes) {
  let fds;
  try { fds = fs.readdirSync("/proc/" + pid + "/fd"); } catch { return false; }
  for (const fd of fds) {
    try {
      const m = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync("/proc/" + pid + "/fd/" + fd));
      if (m && inodes.has(m[1])) return true;
    } catch {}
  }
  return false;
}

// Seconds since the process started, from /proc/<pid>/stat field 22.
function processAgeS(pid) {
  try {
    const stat = fs.readFileSync("/proc/" + pid + "/stat", "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return Math.max(0, os.uptime() - parseInt(fields[19], 10) / 100);
  } catch { return null; }
}

function fmtAge(s) {
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m + "m";
}

// One entry per bot folder for the monitor sweep.
function discordBotChecks() {
  const bots = discoverBots();
  if (!bots.length) return [];
  const procs = runtimeProcesses();
  const inodes = httpsSocketInodes();
  const now = Date.now();
  return bots.map(b => {
    const mine = procs.filter(p => p.cwd === b.dir || p.cwd.startsWith(b.dir + "/"));
    if (!mine.length) { delete lastLinked[b.dir]; return { name: b.name, online: false, detail: "Not running" }; }
    if (mine.some(p => hasSocketIn(p.pid, inodes))) lastLinked[b.dir] = now;
    const ages = mine.map(p => processAgeS(p.pid)).filter(a => a != null);
    const up = ages.length ? ", up " + fmtAge(Math.max(...ages)) : "";
    const linked = lastLinked[b.dir] && now - lastLinked[b.dir] < RECONNECT_GRACE_MS;
    return linked
      ? { name: b.name, online: true, detail: "Connected to Discord" + up }
      : { name: b.name, online: false, detail: "Running but not connected to Discord" + up };
  });
}

// Bots last reported by each agent, so a dead host (or a stopped agent) still
// marks its bots offline instead of quietly dropping them from the monitor.
const agentBots = {};   // agent url -> [bot name]

async function remoteBotChecks() {
  const { httpGet } = require("../net");
  const out = await Promise.all(DISCORD_BOT_AGENTS.map(async a => {
    try {
      const bots = JSON.parse(await httpGet(a.url.replace(/\/$/, "") + "/bots", 4000)).bots || [];
      agentBots[a.url] = bots.map(b => b.name);
      return bots.map(b => Object.assign({}, b, { detail: b.detail + " · " + a.label }));
    } catch (e) {
      return (agentBots[a.url] || []).map(name => ({ name, online: false, detail: "Agent on " + a.label + " unreachable: " + e.message }));
    }
  }));
  return out.flat();
}

module.exports = { discordBotChecks, discoverBots, remoteBotChecks };

if (AGENT) {
  const host = process.env.BOTS_AGENT_HOST || "127.0.0.1";
  const port = parseInt(process.env.BOTS_AGENT_PORT || "4610", 10);
  require("http").createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/bots") { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ bots: discordBotChecks() }));
  }).listen(port, host, () => console.log("Bot agent watching " + DISCORD_BOTS_DIR + " on " + host + ":" + port));
}
