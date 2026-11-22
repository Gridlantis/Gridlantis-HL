const { BASE_CSS, FAVICON, FONT, GAMEPAD_CSS, GAMEPAD_JS, NAV_CSS, SSE_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function filesHtml(){
  const seedGroups = '[]';
  const seedItems  = '[]';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gridlantis-HL \xb7 Files</title>${FONT}${FAVICON}<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}${GAMEPAD_CSS}
.files-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start;}
.files-sidebar{position:sticky;top:calc(var(--pulse-h) + 16px);}
.group-list{display:flex;flex-direction:column;padding:0 8px 8px;}
.group-item{display:flex;align-items:center;gap:10px;height:34px;padding:0 8px;border-radius:var(--r-ctl);cursor:pointer;color:var(--text-2);font-weight:500;}
.group-item i{width:16px;text-align:center;color:var(--muted);}
.group-item:hover{background:var(--raised);color:var(--text);}
.group-item.active{background:var(--raised);color:var(--text);}
.group-item.active i{color:var(--accent);}
.group-count{font-size:12.5px;color:var(--muted);margin-left:auto;flex-shrink:0;}
.del-group{visibility:hidden;background:transparent;border:none;color:var(--muted);font-size:12px;padding:2px 4px;border-radius:4px;flex-shrink:0;}
.group-item:hover .del-group{visibility:visible;}
.del-group:hover{color:var(--fault);}
.add-group-form{display:flex;gap:6px;padding:10px 12px 12px;border-top:1px solid var(--line);}
.add-group-form .m-input{height:32px;}
.files-main{min-width:0;display:flex;flex-direction:column;gap:16px;}
.tabs{display:inline-flex;gap:4px;padding:3px;background:var(--raised);border:1px solid var(--line);border-radius:var(--r-ctl);}
.tab{height:30px;padding:0 12px;border-radius:4px;display:inline-flex;align-items:center;gap:8px;color:var(--text-2);font-weight:500;cursor:pointer;}
.tab.active{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line);}
.upload .m-panel-b{display:flex;flex-direction:column;gap:12px;}
.drop-wrap{display:none;}.drop-wrap.active{display:block;}
.drop{border:1px dashed var(--line-strong);border-radius:var(--r-ctl);padding:28px 20px;text-align:center;cursor:pointer;background:var(--field);position:relative;transition:border-color .15s,background .15s;}
.drop:hover{border-color:var(--accent);}
.drop.over{border-color:var(--accent);background:var(--accent-soft);}
.drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.drop-ico{font-size:22px;display:block;margin-bottom:8px;color:var(--accent);}
.drop-ttl{font-weight:600;margin-bottom:2px;}
.drop-sub{color:var(--muted);font-size:13px;}
.prog-wrap{display:none;}.prog-wrap.on{display:block;}
.prog-top{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:13px;}
.prog-top span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.prog-bg{background:var(--raised);border-radius:3px;height:6px;overflow:hidden;}
.prog-fill{height:100%;background:var(--accent);width:0%;transition:width .15s;}
.prog-st{margin-top:6px;font-size:13px;color:var(--muted);}
.badge{background:var(--raised);border:1px solid var(--line);color:var(--text-2);font-size:12px;padding:2px 8px;border-radius:99px;font-weight:500;}
.flist{display:flex;flex-direction:column;}
.frow{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--line);}
.frow:hover{background:var(--raised);}
.ficon{font-size:17px;flex-shrink:0;width:28px;text-align:center;color:var(--muted);}
.frow.is-dir .ficon{color:var(--accent);}
.finfo{flex:1;min-width:0;}
.fname{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px;}
.fmeta{color:var(--muted);font-size:13px;margin-top:1px;}
.dir-badge{font-size:12px;font-weight:500;padding:1px 7px;border-radius:99px;background:var(--accent-soft);color:var(--accent);}
.fbtns{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.assign-group-select{height:30px;font-size:13px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);color:var(--text-2);padding:0 6px;visibility:hidden;}
.frow:hover .assign-group-select,.assign-group-select:focus{visibility:visible;}
.btn-prev,.btn-dl,.btn-rm{height:30px;display:inline-flex;align-items:center;gap:6px;padding:0 10px;border-radius:var(--r-ctl);border:1px solid var(--line);
  background:var(--raised);color:var(--text);font-size:13px;font-weight:500;text-decoration:none;white-space:nowrap;}
.btn-prev:hover,.btn-dl:hover{border-color:var(--line-strong);}
.btn-rm{width:30px;padding:0;justify-content:center;color:var(--muted);}
.btn-rm:hover{color:var(--fault);border-color:color-mix(in srgb,var(--fault) 45%,var(--line));}
.empty{text-align:center;padding:36px 16px;color:var(--muted);border-top:1px solid var(--line);}
.empty span{font-size:22px;display:block;margin-bottom:8px;}
.preview-bg{position:fixed;inset:0;background:rgba(5,8,12,.72);z-index:400;display:none;align-items:center;justify-content:center;padding:20px;}
.preview-bg.on{display:flex;}
.preview-box{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);width:100%;max-width:880px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5);}
.preview-hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);flex-shrink:0;}
.preview-name{font:600 16px var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.preview-close{background:transparent;border:1px solid var(--line);color:var(--muted);width:32px;height:32px;border-radius:var(--r-ctl);}
.preview-close:hover{color:var(--text);border-color:var(--line-strong);}
.preview-body{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;min-height:200px;}
.preview-body img{max-width:100%;max-height:70vh;border-radius:var(--r-ctl);object-fit:contain;}
.preview-body video,.preview-body audio{width:100%;border-radius:var(--r-ctl);}
.preview-body pre{font-family:var(--font-mono);font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--text);padding:8px;width:100%;}
.preview-body iframe{width:100%;height:70vh;border:none;border-radius:var(--r-ctl);}
.preview-box.pdf-mode{max-width:min(1100px,96vw);height:92vh;}
.preview-box.pdf-mode .preview-body{padding:0;flex-direction:column;align-items:stretch;overflow:hidden;}
.pdf-toolbar{display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--raised);border-bottom:1px solid var(--line);flex-shrink:0;font-size:13px;}
.pdf-toolbar .pdf-label{color:var(--muted);display:flex;align-items:center;gap:6px;}
.pdf-dl-btn{margin-left:auto;background:var(--accent);color:var(--accent-ink);border-radius:var(--r-ctl);padding:5px 12px;text-decoration:none;font-size:13px;font-weight:500;}
.pdf-fallback{padding:24px;text-align:center;color:var(--muted);display:none;}
.pdf-frame{flex:1;width:100%;border:none;background:#525659;}
.preview-dir-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;width:100%;}
.preview-dir-item{background:var(--raised);border:1px solid var(--line);border-radius:var(--r-ctl);padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;color:var(--text-2);text-align:center;}
.preview-dir-icon{font-size:22px;color:var(--accent);}
@media(max-width:860px){.files-layout{grid-template-columns:1fr;}.files-sidebar{position:static;}.assign-group-select{visibility:visible;}.fbtns{flex-wrap:wrap;justify-content:flex-end;}}
</style></head><body>${navBar("/files")}

<main class="m-page">
  <div class="m-head"><div><h1 class="m-title">Files</h1><p class="m-sub">Upload, preview and share files stored on this machine.</p></div></div>
  <div class="files-layout">
    <aside class="m-panel files-sidebar" aria-label="Groups">
      <div class="m-panel-h"><h2 class="m-panel-t">Groups</h2></div>
      <div class="group-list" id="group-list"></div>
      <div class="add-group-form">
        <input class="m-input" id="new-group-name" placeholder="New group" maxlength="40" aria-label="New group name">
        <button class="m-btn icon" id="btn-add-group" title="Add group" aria-label="Add group"><i class="fa-solid fa-plus"></i></button>
      </div>
    </aside>
    <div class="files-main">
      <section class="m-panel upload" aria-labelledby="up-t">
        <div class="m-panel-h"><h2 class="m-panel-t" id="up-t">Upload</h2>
          <div class="tabs" role="tablist">
            <div class="tab active" id="tab-file" role="tab" tabindex="0" onclick="switchTab('file')"><i class="fa-regular fa-file"></i>Files</div>
            <div class="tab" id="tab-folder" role="tab" tabindex="0" onclick="switchTab('folder')"><i class="fa-regular fa-folder"></i>Folder</div>
          </div></div>
        <div class="m-panel-b">
          <div class="drop-wrap active" id="zone-file"><div class="drop" id="drop-file"><input type="file" id="finput" multiple aria-label="Choose files"><i class="fa-solid fa-arrow-up-from-bracket drop-ico"></i><div class="drop-ttl">Drop files here or click to choose</div><div class="drop-sub">Any type, several at once</div></div></div>
          <div class="drop-wrap" id="zone-folder"><div class="drop" id="drop-folder"><input type="file" id="dinput" webkitdirectory multiple aria-label="Choose a folder"><i class="fa-regular fa-folder-open drop-ico"></i><div class="drop-ttl">Click to choose a folder</div><div class="drop-sub">Keeps the folder structure. Downloads as a ZIP.</div></div></div>
          <div class="prog-wrap" id="pw2"><div class="prog-top"><span id="pname">Uploading</span><span id="ppct">0%</span></div><div class="prog-bg"><div class="prog-fill" id="pfill"></div></div><div class="prog-st" id="pst">Preparing</div></div>
        </div>
      </section>
      <section class="m-panel" aria-labelledby="list-t">
        <div class="m-panel-h"><h2 class="m-panel-t" id="list-t">Files and folders</h2><span class="badge" id="fcnt">0</span></div>
        <div class="flist" id="flist"></div>
      </section>
    </div>
  </div>
</main>

<div class="preview-bg" id="preview-bg">
  <div class="preview-box" role="dialog" aria-modal="true" aria-labelledby="preview-name">
    <div class="preview-hdr">
      <div class="preview-name" id="preview-name"></div>
      <button class="preview-close" id="preview-close" aria-label="Close preview"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="preview-body" id="preview-body"></div>
  </div>
</div>

<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
let ALL_ITEMS=${seedItems};
let GROUPS=${seedGroups};
let activeGroup=null;
function renderSidebar(){const list=document.getElementById('group-list');list.innerHTML='';const allItem=document.createElement('div');allItem.className='group-item'+(activeGroup===null?' active':'');allItem.innerHTML='<i class="fa-solid fa-layer-group"></i><span style="flex:1">All files</span><span class="group-count">'+ALL_ITEMS.length+'</span>';allItem.addEventListener('click',()=>{activeGroup=null;renderFiles();renderSidebar();});list.appendChild(allItem);GROUPS.forEach(g=>{const count=ALL_ITEMS.filter(f=>(f.groupId||'')===g.id).length;const item=document.createElement('div');item.className='group-item'+(activeGroup===g.id?' active':'');item.innerHTML='<i class="fa-regular fa-folder"></i><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(g.name)+'</span><span class="group-count">'+count+'</span><button class="del-group" title="Delete group">\u2715</button>';item.querySelector('.del-group').addEventListener('click',e=>{e.stopPropagation();deleteGroup(g.id);});item.addEventListener('click',()=>{activeGroup=g.id;renderFiles();renderSidebar();});list.appendChild(item);});}
function addGroup(){const inp=document.getElementById('new-group-name');const name=inp.value.trim();if(!name)return;fetch('/api/file-groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(g=>{GROUPS.push(g);inp.value='';renderSidebar();showToast('\u2713 Group created','ok');}).catch(()=>showToast('\u2717 Failed','bad'));}
function deleteGroup(id){if(!confirm('Delete this group? Files will move to All Files.'))return;fetch('/api/file-groups/'+id,{method:'DELETE'}).then(r=>{if(!r.ok)throw new Error();}).then(()=>{GROUPS=GROUPS.filter(g=>g.id!==id);ALL_ITEMS=ALL_ITEMS.map(f=>f.groupId===id?{...f,groupId:null}:f);if(activeGroup===id)activeGroup=null;renderSidebar();renderFiles();showToast('\u2713 Group deleted','ok');}).catch(()=>showToast('\u2717 Failed','bad'));}
function assignGroup(fileName,groupId){fetch('/api/file-groups/assign',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName,groupId:groupId||null})}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(updated=>{ALL_ITEMS=ALL_ITEMS.map(f=>f.name===fileName?{...f,groupId:updated.groupId}:f);renderSidebar();renderFiles();}).catch(()=>showToast('\u2717 Failed to assign','bad'));}
function renderFiles(){const displayed=activeGroup===null?ALL_ITEMS:ALL_ITEMS.filter(f=>(f.groupId||'')===(activeGroup||''));document.getElementById('fcnt').textContent=displayed.length;const list=document.getElementById('flist');if(!displayed.length){list.innerHTML='<div class="empty"><span><i class="fa-regular fa-folder-open"></i></span>No files in this group yet.</div>';return;}list.innerHTML='';displayed.forEach(f=>{const row=document.createElement('div');row.className='frow'+(f.isDir?' is-dir':'');const meta=f.isDir?f.count+' file'+(f.count!==1?'s':'')+', '+f.size:f.size+', '+new Date(f.mtime).toLocaleString();const dlHref=f.isDir?'/api/files/download?path='+encodeURIComponent(f.name):'/api/files/download?path='+encodeURIComponent(f.name);const canPreview=!f.isDir&&isPreviewable(f.name);row.innerHTML='<span class="ficon">'+ico(f.name,f.isDir)+'</span><div class="finfo"><div class="fname">'+esc(f.name)+(f.isDir?'<span class="dir-badge">folder</span>':'')+'</div><div class="fmeta">'+meta+'</div></div><div class="fbtns"><select class="assign-group-select" title="Assign to group"><option value="">No group</option>'+GROUPS.map(g=>'<option value="'+g.id+'"'+(f.groupId===g.id?' selected':'')+'>'+esc(g.name)+'</option>').join('')+'</select>'+(canPreview||f.isDir?'<button class="btn-prev" data-prev-name="'+esc(f.name)+'" data-prev-dir="'+f.isDir+'"><i class="fa-regular fa-eye"></i>Preview</button>':'')+'<a class="btn-dl" href="'+dlHref+'"'+(f.isDir?'':' download')+'><i class="fa-solid fa-download"></i>'+(f.isDir?'ZIP':'Download')+'</a><button class="btn-rm" title="Delete" aria-label="Delete '+esc(f.name)+'" data-rm-name="'+esc(f.name)+'" data-rm-dir="'+f.isDir+'"><i class="fa-solid fa-trash"></i></button></div>';const sel=row.querySelector('.assign-group-select');if(sel)sel.addEventListener('change',()=>assignGroup(f.name,sel.value));list.appendChild(row);});list.onclick=e=>{const p=e.target.closest('.btn-prev');if(p){const isDir=p.dataset.prevDir==='true';if(isDir)previewDir(p.dataset.prevName);else previewFile(p.dataset.prevName);return;}const r=e.target.closest('.btn-rm');if(r)del(r.dataset.rmName,r.dataset.rmDir==='true');};}
function openPreviewModal(name){document.getElementById('preview-name').textContent=name;document.getElementById('preview-bg').classList.add('on');}
function closePreview(){document.getElementById('preview-bg').classList.remove('on');document.querySelector('.preview-box').classList.remove('pdf-mode');document.getElementById('preview-body').innerHTML='';document.getElementById('preview-body').style.cssText='';}
async function previewFile(name){openPreviewModal(name);const body=document.getElementById('preview-body');const ext=(name.split('.').pop()||'').toLowerCase();const dlUrl='/api/files/download?path='+encodeURIComponent(name);const inlineUrl='/api/files/preview?path='+encodeURIComponent(name);if(['jpg','jpeg','png','gif','webp','svg'].includes(ext)){body.innerHTML='<img src="'+inlineUrl+'" alt="'+esc(name)+'">';}else if(['mp4','mov','webm'].includes(ext)){body.innerHTML='<video controls autoplay src="'+inlineUrl+'"></video>';}else if(['mp3','wav','ogg'].includes(ext)){body.innerHTML='<audio controls autoplay src="'+inlineUrl+'"></audio>';}else if(ext==='pdf'){document.querySelector('.preview-box').classList.add('pdf-mode');body.style.cssText='flex-direction:column;align-items:stretch;padding:0;overflow:hidden;';body.innerHTML='<div class="pdf-toolbar"><span class="pdf-label"><i class="fa-regular fa-file-pdf"></i>'+esc(name)+'</span><a class="pdf-dl-btn" href="'+dlUrl+'" download>Download</a></div><iframe class="pdf-frame" id="pdf-frame" src="'+inlineUrl+'#toolbar=1&navpanes=1&scrollbar=1"></iframe><div class="pdf-fallback" id="pdf-fallback">Your browser blocked the inline PDF viewer. <a href="'+inlineUrl+'" target="_blank" style="color:var(--accent)">Open in new tab →</a> or <a href="'+dlUrl+'" download style="color:var(--accent)">download it</a>.</div>';const frame=document.getElementById('pdf-frame');frame.onerror=()=>{frame.style.display='none';document.getElementById('pdf-fallback').style.display='block';};}else{body.innerHTML='<div style="color:var(--muted);font-family:var(--font-ui);font-size:12px">Loading\u2026</div>';try{const r=await fetch(inlineUrl);const text=await r.text();const pre=document.createElement('pre');pre.textContent=text.slice(0,50000);body.innerHTML='';body.appendChild(pre);}catch(e){body.innerHTML='<div style="color:var(--red);font-family:var(--font-ui)">Failed to load file</div>';}}}
async function previewDir(name){openPreviewModal(name+'/');const body=document.getElementById('preview-body');try{const r=await fetch('/api/files');const all=await r.json();const grid=document.createElement('div');grid.className='preview-dir-grid';const folderItem=all.find(f=>f.name===name);if(!folderItem){body.innerHTML='<div style="color:var(--muted);font-family:var(--font-ui)">Empty or not found</div>';return;}const info=document.createElement('div');info.className='preview-dir-item';info.innerHTML='<div class="preview-dir-icon"><i class="fa-solid fa-folder"></i></div><div>'+esc(name)+'</div><div style="font-size:10px">'+folderItem.count+' file'+(folderItem.count!==1?'s':'')+', '+folderItem.size+'</div>';grid.appendChild(info);body.innerHTML='';body.appendChild(grid);}catch(e){body.innerHTML='<div style="color:var(--red);font-family:var(--font-ui)">Failed</div>';}}
function isPreviewable(name){const e=(name.split('.').pop()||'').toLowerCase();return['jpg','jpeg','png','gif','webp','svg','mp4','mov','mp3','wav','txt','md','json','pdf','js','ts','py','html','css','xml','csv'].includes(e);}
function switchTab(t){['file','folder'].forEach(x=>{document.getElementById('tab-'+x).classList.toggle('active',x===t);document.getElementById('zone-'+x).classList.toggle('active',x===t);});}
function del(name,isDir){if(!confirm(isDir?'Delete folder "'+name+'" and all contents?':'Delete "'+name+'"?'))return;fetch('/api/files/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:name})}).then(r=>{if(r.ok){showToast('\u2713 Deleted','ok');refresh();}else showToast('\u2717 Delete failed','bad');});}
function refresh(){Promise.all([fetch('/api/files').then(r=>r.json()),fetch('/api/file-groups').then(r=>r.json())]).then(([items,groups])=>{ALL_ITEMS=Array.isArray(items)?items:[];GROUPS=Array.isArray(groups)?groups:[];renderSidebar();renderFiles();}).catch(()=>{renderSidebar();renderFiles();});}
function fmtB(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function ico(n,isDir){const I=c=>'<i class="'+c+'"></i>';if(isDir)return I('fa-solid fa-folder');const x=n.split('.').pop().toLowerCase();const m={pdf:'fa-regular fa-file-pdf',jpg:'fa-regular fa-file-image',jpeg:'fa-regular fa-file-image',png:'fa-regular fa-file-image',gif:'fa-regular fa-file-image',webp:'fa-regular fa-file-image',svg:'fa-regular fa-file-image',mp4:'fa-regular fa-file-video',mov:'fa-regular fa-file-video',webm:'fa-regular fa-file-video',mp3:'fa-regular fa-file-audio',wav:'fa-regular fa-file-audio',ogg:'fa-regular fa-file-audio',zip:'fa-regular fa-file-zipper',rar:'fa-regular fa-file-zipper',gz:'fa-regular fa-file-zipper','7z':'fa-regular fa-file-zipper',doc:'fa-regular fa-file-word',docx:'fa-regular fa-file-word',xls:'fa-regular fa-file-excel',xlsx:'fa-regular fa-file-excel',csv:'fa-regular fa-file-excel',ppt:'fa-regular fa-file-powerpoint',pptx:'fa-regular fa-file-powerpoint',js:'fa-regular fa-file-code',ts:'fa-regular fa-file-code',py:'fa-regular fa-file-code',html:'fa-regular fa-file-code',css:'fa-regular fa-file-code',json:'fa-regular fa-file-code',sh:'fa-regular fa-file-code',txt:'fa-regular fa-file-lines',md:'fa-regular fa-file-lines',iso:'fa-solid fa-compact-disc',exe:'fa-solid fa-gear',appimage:'fa-solid fa-gear',deb:'fa-solid fa-box'};return I(m[x]||'fa-regular fa-file');}
const dropFile=document.getElementById('drop-file'),finput=document.getElementById('finput');
dropFile.addEventListener('dragover',e=>{e.preventDefault();dropFile.classList.add('over');});dropFile.addEventListener('dragleave',()=>dropFile.classList.remove('over'));
dropFile.addEventListener('drop',e=>{e.preventDefault();dropFile.classList.remove('over');uploadFiles([...e.dataTransfer.files]);});
finput.addEventListener('change',()=>{uploadFiles([...finput.files]);finput.value='';});
const dinput=document.getElementById('dinput');
dinput.addEventListener('change',()=>{const files=[...dinput.files].map(f=>{f._rel=f.webkitRelativePath||f.name;return f;});uploadQueue(files);dinput.value='';});
const dropFolder=document.getElementById('drop-folder');
dropFolder.addEventListener('dragover',e=>{e.preventDefault();dropFolder.classList.add('over');});dropFolder.addEventListener('dragleave',()=>dropFolder.classList.remove('over'));
dropFolder.addEventListener('drop',async e=>{e.preventDefault();dropFolder.classList.remove('over');const files=[];for(const item of[...e.dataTransfer.items]){const entry=item.webkitGetAsEntry?.();if(entry)await collectEntry(entry,'',files);}if(files.length)uploadQueue(files);});
async function collectEntry(entry,prefix,out){if(entry.isFile){const file=await new Promise(r=>entry.file(r));file._rel=(prefix?prefix+'/':'')+entry.name;out.push(file);}else if(entry.isDirectory){const reader=entry.createReader();let entries=[];await new Promise(resolve=>{function read(){reader.readEntries(b=>{if(!b.length)resolve();else{entries.push(...b);read();}});}read();});for(const e of entries)await collectEntry(e,(prefix?prefix+'/':'')+entry.name,out);}}
function uploadFiles(files){let i=0;function next(){if(i<files.length)uploadOne(files[i++],null,next);else refresh();}next();}
function uploadQueue(files){let i=0;function next(){if(i<files.length)uploadOne(files[i],files[i]._rel,()=>{i++;next();});else refresh();}next();}
function uploadOne(file,rel,done){const fd=new FormData();if(rel)fd.append('relativePath',rel);if(activeGroup)fd.append('groupId',activeGroup);fd.append('file',file);const pw2=document.getElementById('pw2'),pname=document.getElementById('pname'),ppct=document.getElementById('ppct'),pfill=document.getElementById('pfill'),pst=document.getElementById('pst');pw2.classList.add('on');pname.textContent=rel||file.name;const xhr=new XMLHttpRequest();xhr.open('POST','/upload');xhr.upload.onprogress=e=>{if(!e.lengthComputable)return;const p=Math.round(e.loaded/e.total*100);pfill.style.width=p+'%';ppct.textContent=p+'%';pst.textContent=fmtB(e.loaded)+' / '+fmtB(e.total);};xhr.onload=()=>{let saved=null;try{saved=(JSON.parse(xhr.responseText).saved||[])[0]}catch(e){}if(xhr.status===200)showToast('\u2713 '+(saved||rel||file.name),'ok');else showToast('\u2717 Upload failed','bad');setTimeout(()=>{pw2.classList.remove('on');done();},300);};xhr.onerror=()=>{showToast('\u2717 Network error','bad');pw2.classList.remove('on');done();};xhr.send(fd);}
document.getElementById('btn-add-group').addEventListener('click',addGroup);
document.getElementById('new-group-name').addEventListener('keydown',e=>{if(e.key==='Enter')addGroup();});
document.getElementById('preview-close').addEventListener('click',closePreview);
document.getElementById('preview-bg').addEventListener('click',e=>{if(e.target===document.getElementById('preview-bg'))closePreview();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePreview();});
refresh();
window.__sseRefresh=function(d){if(d.type==='files')refresh();};
${SSE_JS}
${GAMEPAD_JS}
</script></body></html>`;
}


// ─── NOTES PAGE ────────────────────────────────────────────────────────────────
// Mission-select HUD: chamfered cards in a bracketed frame, paged with chevrons.
// Folders keep their sidebar; all note/link/undo behaviour is unchanged.

module.exports = { filesHtml };
