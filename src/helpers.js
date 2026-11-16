const fs = require("fs");
const os = require("os");
const path = require("path");

const { dataFile, UPLOAD_DIR } = require("./config");

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Errors that carry the HTTP status their route should answer with. Each module
// binds its own default: 400 for bad input, 502 for a peer that misbehaved.
const errorWithStatus = fallback => (msg, status) => { const e = new Error(msg); e.status = status || fallback; return e; };
const getLocalIPs = () => {
  const ips = [];
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
  return ips;
};
const esc     = s   => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtSize = b   => b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":b<1073741824?(b/1048576).toFixed(1)+" MB":(b/1073741824).toFixed(1)+" GB";
function dirSize(d){let t=0;for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);t+=e.isDirectory()?dirSize(f):fs.statSync(f).size;}return t;}
function dirCount(d){let t=0;for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);t+=e.isDirectory()?dirCount(f):1;}return t;}
function getItems(){
  if(!fs.existsSync(UPLOAD_DIR))return[];
  const FGMAP_FILE=dataFile("file_group_map.json");
  let groupMap={};try{groupMap=JSON.parse(fs.readFileSync(FGMAP_FILE,"utf8"));}catch(_){}
  return fs.readdirSync(UPLOAD_DIR).map(name=>{
    const full=path.join(UPLOAD_DIR,name),stat=fs.statSync(full),isDir=stat.isDirectory();
    return{name,isDir,size:isDir?fmtSize(dirSize(full)):fmtSize(stat.size),count:isDir?dirCount(full):null,mtime:stat.mtime.toISOString(),groupId:groupMap[name]||null};
  }).sort((a,b)=>{if(a.isDir!==b.isDir)return a.isDir?-1:1;return new Date(b.mtime)-new Date(a.mtime);});
}

module.exports = { dirCount, dirSize, errorWithStatus, esc, fmtSize, getItems, getLocalIPs };
