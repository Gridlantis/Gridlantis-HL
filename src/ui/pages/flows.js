/* Flow Space (/flows): the flowchart canvas. Nodes are HTML boxes in a
   "world" layer that is panned and zoomed. Loaded by src/pages/flows.js after
   the shared toast helpers. */
(function(){
var GRID = 20;
var COLORS = ['slate','blue','teal','green','amber','orange','red','violet','pink'];
var HEX = { slate:'#94a3b8', blue:'#4f8ff7', teal:'#2dd4bf', green:'#22c55e', amber:'#f59e0b', orange:'#fb923c', red:'#ef4444', violet:'#a78bfa', pink:'#f472b6' };
var ICONS = ['lightbulb','star','flag','circle-check','circle-xmark','circle-question','triangle-exclamation','circle-info','user','users','envelope','phone','comment','calendar','clock','bell','gear','wrench','bolt','database','server','cloud','globe','lock','key','shield-halved','code','terminal','laptop','mobile-screen','desktop','file','folder','book','cart-shopping','credit-card','sack-dollar','chart-line','chart-pie','house','building','location-dot','truck','rocket','bug','brain','robot','heart','thumbs-up','magnifying-glass','filter','download','upload','link','image','camera','music','play','pause','stop','repeat','arrow-right','diagram-project','list-check','pen','trash','hourglass','graduation-cap','briefcase','handshake','box','gift','fire','leaf','sun','moon','wifi','network-wired','microchip','print','car','plane','utensils','mug-hot'];
var DEFAULTS = {
  rect:    { w:160, h:70,  text:'Step' },
  round:   { w:160, h:60,  text:'Start' },
  diamond: { w:150, h:110, text:'Decision?' },
  ellipse: { w:110, h:110, text:'' },
  text:    { w:180, h:40,  text:'Text' },
  icon:    { w:100, h:100, text:'', icon:'lightbulb' },
  note:    { w:230, h:130, text:'' }
};
var CLIENT = Math.random().toString(36).slice(2, 10);
var BT = String.fromCharCode(96);

var F = null, FLOWS = [], NOTES = [], SEL = {}, SELE = null;
var view = { x: 0, y: 0, zoom: 1 };
var HIST = [], FUT = [], snapOn = true, CLIP = null;
var saveT = null, inflight = null, dirty = false, interacting = false, editing = null;

function $(id){ return document.getElementById(id); }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function snapV(v){ return snapOn ? Math.round(v / GRID) * GRID : Math.round(v); }
function nodeById(id){ for (var i = 0; i < F.nodes.length; i++) if (F.nodes[i].id === id) return F.nodes[i]; return null; }
function edgeById(id){ for (var i = 0; i < F.edges.length; i++) if (F.edges[i].id === id) return F.edges[i]; return null; }
function noteById(id){ for (var i = 0; i < NOTES.length; i++) if (NOTES[i].id === id) return NOTES[i]; return null; }
function selIds(){ return Object.keys(SEL).filter(function(id){ return nodeById(id); }); }
function noteUrl(id){ return '/notes?open=' + encodeURIComponent(id); }
function plain(s){
  var bad = '#*_>~=[]' + BT, out = '';
  s = String(s || '');
  for (var i = 0; i < s.length; i++) if (bad.indexOf(s.charAt(i)) === -1) out += s.charAt(i);
  return out.trim();
}

// ── history and saving ──────────────────────────────────────────────────────
function snapshot(){ return JSON.stringify({ nodes: F.nodes, edges: F.edges }); }
function checkpoint(){
  HIST.push(snapshot()); if (HIST.length > 120) HIST.shift();
  FUT = []; updUndo();
}
function restore(json){
  var s = JSON.parse(json); F.nodes = s.nodes; F.edges = s.edges;
  SEL = {}; SELE = null; changed();
}
function undo(){ if (!HIST.length) return; FUT.push(snapshot()); restore(HIST.pop()); updUndo(); }
function redo(){ if (!FUT.length) return; HIST.push(snapshot()); restore(FUT.pop()); updUndo(); }
function updUndo(){ $('fs-undo').disabled = !HIST.length; $('fs-redo').disabled = !FUT.length; }

function setStatus(t, bad){ var s = $('fs-status'); s.textContent = t; s.className = 'fs-status' + (bad ? ' bad' : ''); }
function scheduleSave(ms){
  if (!F) return;
  dirty = true; setStatus('Unsaved');
  clearTimeout(saveT); saveT = setTimeout(save, ms || 600);
}
function payload(){ return JSON.stringify({ name: F.name, nodes: F.nodes, edges: F.edges, view: view, client: CLIENT }); }
// One save at a time. A save asked for while another is in flight waits for it
// and then sends whatever changed meanwhile, so switching flows mid-save cannot
// drop the newest edits.
function save(){
  if (inflight) return inflight.then(save);
  if (!F || !dirty) return Promise.resolve();
  clearTimeout(saveT);
  dirty = false; setStatus('Saving');
  var id = F.id, body = payload();
  var sum = { name: F.name, nodes: F.nodes.length, noteIds: F.nodes.map(function(n){ return n.noteId; }).filter(Boolean) };
  inflight = fetch('/api/flows/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: body })
    .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
    .then(function(d){
      inflight = null;
      if (F && F.id === id) { F.updated = d.updated; if (!dirty) setStatus('Saved'); }
      FLOWS.forEach(function(f){ if (f.id === id) { f.updated = d.updated; f.name = sum.name; f.nodes = sum.nodes; f.noteIds = sum.noteIds; } });
      renderList();
    })
    .catch(function(){
      inflight = null;
      if (F && F.id === id) { dirty = true; setStatus('Could not save, retrying', true); clearTimeout(saveT); saveT = setTimeout(save, 4000); }
      else showToast('Your last changes to the previous flow could not be saved', 'bad');
    });
  return inflight;
}
// Something is being typed or dragged: a refresh now would rebuild the inspector
// under the cursor or snap a box back mid-drag.
function busy(){
  var a = document.activeElement;
  return interacting || !!editing || !!(a && (a.id === 'fs-name' || $('insp').contains(a)));
}
window.addEventListener('beforeunload', function(){
  if (F && dirty) fetch('/api/flows/' + F.id, { method:'PUT', keepalive:true, headers:{'Content-Type':'application/json'}, body: payload() });
});
function changed(){ render(); scheduleSave(); }

// ── view ────────────────────────────────────────────────────────────────────
function applyView(){
  $('world').style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.zoom + ')';
  var st = $('stage'), g = GRID * view.zoom;
  st.style.backgroundSize = g + 'px ' + g + 'px';
  st.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
  $('fs-zoom').textContent = Math.round(view.zoom * 100) + '%';
}
function toWorld(cx, cy){
  var r = $('stage').getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.zoom, y: (cy - r.top - view.y) / view.zoom };
}
function zoomAt(z, cx, cy){
  z = Math.min(3, Math.max(0.15, z));
  var r = $('stage').getBoundingClientRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  var w = toWorld(cx, cy);
  view.zoom = z;
  view.x = cx - r.left - w.x * z; view.y = cy - r.top - w.y * z;
  applyView(); scheduleSave(1500);
}
function fit(){
  if (!F || !F.nodes.length) { view = { x: 40, y: 40, zoom: 1 }; applyView(); return; }
  var a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  F.nodes.forEach(function(n){ a = Math.min(a, n.x); b = Math.min(b, n.y); c = Math.max(c, n.x + n.w); d = Math.max(d, n.y + n.h); });
  var r = $('stage').getBoundingClientRect();
  var z = Math.min(1.25, Math.max(0.15, Math.min((r.width - 80) / (c - a), (r.height - 80) / (d - b))));
  view.zoom = z; view.x = (r.width - (c - a) * z) / 2 - a * z; view.y = (r.height - (d - b) * z) / 2 - b * z;
  applyView(); scheduleSave(1500);
}
function centerWorld(){ var r = $('stage').getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); }

// ── geometry ────────────────────────────────────────────────────────────────
var NORMAL = { t:[0,-1], r:[1,0], b:[0,1], l:[-1,0] };
function anchor(n, side){
  if (side === 't') return [n.x + n.w / 2, n.y];
  if (side === 'b') return [n.x + n.w / 2, n.y + n.h];
  if (side === 'l') return [n.x, n.y + n.h / 2];
  return [n.x + n.w, n.y + n.h / 2];
}
function sides(a, b){
  var dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h)) return dx > 0 ? ['r','l'] : ['l','r'];
  return dy > 0 ? ['b','t'] : ['t','b'];
}
function curve(p1, s1, p2, s2){
  var dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  var k = Math.min(160, Math.max(30, dist * 0.4));
  var n1 = NORMAL[s1], n2 = s2 ? NORMAL[s2] : [0, 0];
  var c1 = [p1[0] + n1[0] * k, p1[1] + n1[1] * k], c2 = [p2[0] + n2[0] * k, p2[1] + n2[1] * k];
  return { d: 'M' + p1[0] + ',' + p1[1] + ' C' + c1[0] + ',' + c1[1] + ' ' + c2[0] + ',' + c2[1] + ' ' + p2[0] + ',' + p2[1],
           mid: [(p1[0] + 3 * c1[0] + 3 * c2[0] + p2[0]) / 8, (p1[1] + 3 * c1[1] + 3 * c2[1] + p2[1]) / 8] };
}

// ── render ──────────────────────────────────────────────────────────────────
function nodeHtml(n){
  var cls = 'fs-node shape-' + n.shape + ' c-' + n.color + ' s-' + (n.size || 'm') + (SEL[n.id] ? ' sel' : '');
  var inner = '';
  if (n.shape === 'diamond') inner += '<svg class="fs-dia" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,1 99,50 50,99 1,50"/></svg>';
  if (n.shape === 'icon') inner += '<i class="fa-solid fa-' + esc(n.icon || 'lightbulb') + ' fs-ic"></i>';
  if (n.shape === 'note') {
    var note = noteById(n.noteId);
    var title = note ? (note.title || 'Untitled') : (n.noteId ? 'Note not found' : 'Pick a note');
    var body = !note ? '' : note.hidden ? 'Hidden note' : plain(note.body).slice(0, 400);
    inner += '<div class="fs-note-h"><i class="fa-regular fa-note-sticky"></i>' + esc(title) + '</div><div class="fs-note-b">' + esc(body) + '</div>';
  }
  inner += '<div class="fs-txt">' + esc(n.text) + '</div>';
  if (n.noteId) inner += '<a class="fs-link" href="' + noteUrl(n.noteId) + '" target="_blank" rel="noopener" title="Open the linked note"><i class="fa-regular fa-file-lines"></i></a>';
  inner += '<span class="fs-port" data-side="t"></span><span class="fs-port" data-side="r"></span><span class="fs-port" data-side="b"></span><span class="fs-port" data-side="l"></span><span class="fs-rz"></span>';
  return '<div class="' + cls + '" data-id="' + esc(n.id) + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px">' + inner + '</div>';
}
function renderNodes(){
  $('nodes').innerHTML = F.nodes.map(nodeHtml).join('');
  var only = selIds().length === 1;
  if (only) { var el = document.querySelector('.fs-node.sel'); if (el) el.classList.add('only'); }
}
function renderEdges(){
  var g = '', labels = '';
  F.edges.forEach(function(e){
    var a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) return;
    var s = sides(a, b), c = curve(anchor(a, s[0]), s[0], anchor(b, s[1]), s[1]);
    var mk = (e.arrow === 'none' ? '' : ' marker-end="url(#fs-arrow)"') + (e.arrow === 'both' ? ' marker-start="url(#fs-arrow)"' : '');
    g += '<path class="fs-e' + (e.dashed ? ' dash' : '') + (SELE === e.id ? ' sel' : '') + '" data-e="' + esc(e.id) + '" d="' + c.d + '" stroke="' + HEX[e.color || 'slate'] + '"' + mk + '/>' +
         '<path class="fs-ehit" data-edge="' + esc(e.id) + '" d="' + c.d + '"/>';
    if (e.label || editing === 'e:' + e.id)
      labels += '<div class="fs-elabel' + (SELE === e.id ? ' sel' : '') + '" data-edge="' + esc(e.id) + '" style="left:' + c.mid[0] + 'px;top:' + c.mid[1] + 'px">' + esc(e.label) + '</div>';
  });
  $('eg').innerHTML = g; $('labels').innerHTML = labels;
}
function render(){
  if (!F) return;
  renderNodes(); renderEdges(); renderInsp();
  $('empty').innerHTML = F.nodes.length ? '' : '<div><b>An empty flow.</b><br>Drag a shape from the toolbar, or double-click anywhere to add a box.<br>Drag from the dots on a box to draw an arrow.</div>';
}
// Selection changes only flip classes. Rebuilding the DOM on every click would
// swap the element under the pointer between the two clicks of a double-click,
// and the browser would then send the dblclick to the stage instead.
function applySel(){
  var only = selIds().length === 1;
  document.querySelectorAll('.fs-node').forEach(function(el){
    var on = !!SEL[el.getAttribute('data-id')];
    el.classList.toggle('sel', on); el.classList.toggle('only', on && only);
  });
  document.querySelectorAll('.fs-e').forEach(function(el){ el.classList.toggle('sel', el.getAttribute('data-e') === SELE); });
  document.querySelectorAll('.fs-elabel').forEach(function(el){ el.classList.toggle('sel', el.getAttribute('data-edge') === SELE); });
  renderInsp();
}
function moveNodeEls(ids){
  ids.forEach(function(id){
    var n = nodeById(id), el = document.querySelector('.fs-node[data-id="' + id + '"]');
    if (n && el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.style.width = n.w + 'px'; el.style.height = n.h + 'px'; }
  });
  renderEdges();
}

// ── flow list ───────────────────────────────────────────────────────────────
function renderList(){
  $('fs-flows').innerHTML = FLOWS.length ? FLOWS.map(function(f){
    return '<div class="fs-fl' + (F && F.id === f.id ? ' on' : '') + '" data-flow="' + esc(f.id) + '"><i class="fa-solid fa-diagram-project" style="color:var(--muted)"></i>' +
      '<div class="fs-fl-b"><div class="fs-fl-n">' + esc(f.name) + '</div><div class="fs-fl-m">' + f.nodes + ' items &middot; ' + timeAgo(f.updated) + '</div></div>' +
      '<button class="fs-fl-x" data-del="' + esc(f.id) + '" title="Delete flow" aria-label="Delete flow"><i class="fa-solid fa-trash"></i></button></div>';
  }).join('') : '<div style="padding:10px 14px;color:var(--muted)">No flows yet.</div>';
}
function loadList(){
  return fetch('/api/flows').then(function(r){ return r.json(); }).then(function(l){ FLOWS = l; renderList(); });
}
function openFlow(id, keepView){
  return save().then(function(){
    if (dirty && F && F.id !== id && !confirm('Changes to this flow could not be saved. Open the other flow anyway?')) throw 'stay';
    return fetch('/api/flows/' + encodeURIComponent(id));
  })
    .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
    .then(function(f){
      var same = F && F.id === f.id;
      F = f; dirty = false;
      if (!same) { SEL = {}; SELE = null; HIST = []; FUT = []; updUndo(); }
      $('fs-name').value = f.name;
      if (!keepView) view = f.view && f.view.zoom ? { x: f.view.x, y: f.view.y, zoom: f.view.zoom } : { x: 40, y: 40, zoom: 1 };
      applyView(); render(); renderList(); setStatus('Saved');
      try { localStorage.setItem('openhl-flow', f.id); } catch(e){}
      history.replaceState(null, '', '/flows?open=' + encodeURIComponent(f.id));
    }).catch(function(e){ if (e !== 'stay') showToast('Could not open that flow', 'bad'); });
}
// No prompt() for the name: the desktop app (Electron) does not implement it,
// so it returned nothing and the flow was never made. Create it straight away
// and put the cursor in the name field instead.
function newFlow(focusName){
  return fetch('/api/flows', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Untitled flow', client: CLIENT }) })
    .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
    .then(function(f){ return loadList().then(function(){ return openFlow(f.id); }); })
    .then(function(){ if (focusName !== false) { var n = $('fs-name'); n.focus(); n.select(); } })
    .catch(function(){ showToast('Could not create a flow', 'bad'); });
}
function noFlow(){
  F = null; $('nodes').innerHTML = ''; $('eg').innerHTML = ''; $('labels').innerHTML = ''; $('fs-name').value = '';
  $('empty').innerHTML = '<div><b>Flow Space</b><br>Flowcharts with boxes, icons, notes and arrows.<br><button class="m-btn primary" style="pointer-events:auto;margin-top:10px" id="fs-first">New flow</button></div>';
  $('fs-first').addEventListener('click', function(){ newFlow(); });
  renderInsp(); setStatus('');
}

// ── adding and editing ──────────────────────────────────────────────────────
function addNode(shape, x, y, extra){
  if (!F) return null;
  var d = DEFAULTS[shape];
  var n = { id: uid('n'), shape: shape, w: d.w, h: d.h, text: d.text, color: shape === 'note' ? 'amber' : shape === 'round' ? 'green' : shape === 'diamond' ? 'violet' : 'blue',
            size: 'm', icon: d.icon || '', noteId: null };
  for (var k in extra || {}) n[k] = extra[k];
  n.x = snapV(x - n.w / 2); n.y = snapV(y - n.h / 2);
  checkpoint(); F.nodes.push(n); SEL = {}; SEL[n.id] = 1; SELE = null; changed();
  return n;
}
function startAdd(shape, x, y){
  // Nothing open yet: make a flow to put it in rather than refusing.
  if (!F) { newFlow(false).then(function(){ if (F) startAdd(shape); }); return; }
  if (x == null) { var c = centerWorld(); x = c.x + (Math.random() - 0.5) * 60; y = c.y + (Math.random() - 0.5) * 60; }
  if (shape === 'note') { pickNote(function(id){ addNode('note', x, y, { noteId: id }); }); return; }
  if (shape === 'icon') { pickIcon(function(ic){ addNode('icon', x, y, { icon: ic, text: ic.split('-').join(' ') }); }); return; }
  var n = addNode(shape, x, y);
  if (n && shape !== 'ellipse') editText(n.id);
}
function deleteSel(){
  var ids = selIds();
  if (!ids.length && !SELE) return;
  checkpoint();
  if (ids.length) {
    F.nodes = F.nodes.filter(function(n){ return !SEL[n.id]; });
    F.edges = F.edges.filter(function(e){ return !SEL[e.from] && !SEL[e.to]; });
  }
  if (SELE) F.edges = F.edges.filter(function(e){ return e.id !== SELE; });
  SEL = {}; SELE = null; changed();
}
function copySel(){
  var ids = selIds(); if (!ids.length) return false;
  CLIP = { nodes: F.nodes.filter(function(n){ return SEL[n.id]; }), edges: F.edges.filter(function(e){ return SEL[e.from] && SEL[e.to]; }) };
  CLIP = JSON.parse(JSON.stringify(CLIP));
  return true;
}
function paste(off){
  if (!CLIP || !F) return;
  checkpoint();
  var map = {}; SEL = {}; SELE = null;
  CLIP.nodes.forEach(function(n){ var c = JSON.parse(JSON.stringify(n)); c.id = uid('n'); map[n.id] = c.id; c.x += off; c.y += off; F.nodes.push(c); SEL[c.id] = 1; });
  CLIP.edges.forEach(function(e){ var c = JSON.parse(JSON.stringify(e)); c.id = uid('e'); c.from = map[e.from]; c.to = map[e.to]; F.edges.push(c); });
  CLIP.nodes.forEach(function(n){ n.x += off; n.y += off; });
  changed();
}
function duplicate(){ if (copySel()) paste(GRID * 2); }
function toFront(){
  var ids = selIds(); if (!ids.length) return;
  checkpoint();
  F.nodes = F.nodes.filter(function(n){ return !SEL[n.id]; }).concat(F.nodes.filter(function(n){ return SEL[n.id]; }));
  changed();
}
function setProp(k, v){
  var ids = selIds();
  if (!ids.length && !SELE) return;
  checkpoint();
  ids.forEach(function(id){ nodeById(id)[k] = v; });
  if (SELE && !ids.length) edgeById(SELE)[k] = v;
  changed();
}

// Inline text editing on the canvas.
function editText(id){
  var n = nodeById(id); if (!n || n.shape === 'note') return;
  var el = document.querySelector('.fs-node[data-id="' + id + '"] .fs-txt'); if (!el) return;
  editing = 'n:' + id;
  var before = n.text;
  el.setAttribute('contenteditable', 'plaintext-only');
  el.focus({ preventScroll: true });
  var r = document.createRange(); r.selectNodeContents(el);
  var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  function done(keep){
    el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKey);
    editing = null; el.removeAttribute('contenteditable');
    var t = keep ? el.innerText.replace(/ +$/, '').slice(0, 2000) : before;
    if (keep && t !== before) { checkpoint(); n.text = t; changed(); } else render();
  }
  function onBlur(){ done(true); }
  function onKey(e){
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); done(false); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
  }
  el.addEventListener('blur', onBlur); el.addEventListener('keydown', onKey);
}
function editLabel(eid){
  var e = edgeById(eid); if (!e) return;
  editing = 'e:' + eid; SELE = eid; SEL = {}; renderEdges(); applySel();
  var el = document.querySelector('.fs-elabel[data-edge="' + eid + '"]'); if (!el) return;
  var before = e.label;
  el.setAttribute('contenteditable', 'plaintext-only'); el.focus({ preventScroll: true });
  var r = document.createRange(); r.selectNodeContents(el);
  var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  function done(keep){
    el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKey);
    editing = null;
    var t = keep ? el.innerText.trim().slice(0, 300) : before;
    if (keep && t !== before) { checkpoint(); e.label = t; changed(); } else render();
  }
  function onBlur(){ done(true); }
  function onKey(ev){
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); done(false); }
    else if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); }
  }
  el.addEventListener('blur', onBlur); el.addEventListener('keydown', onKey);
}

// ── inspector ───────────────────────────────────────────────────────────────
function swatches(cur){
  return '<div class="fs-sw">' + COLORS.map(function(c){
    return '<button class="c-' + c + (c === cur ? ' on' : '') + '" data-color="' + c + '" title="' + c + '" aria-label="' + c + '"></button>';
  }).join('') + '</div>';
}
function seg(name, opts, cur){
  return '<div class="fs-seg" data-seg="' + name + '">' + opts.map(function(o){
    return '<button data-v="' + o[0] + '"' + (o[0] === cur ? ' class="on"' : '') + '>' + o[1] + '</button>';
  }).join('') + '</div>';
}
function noteBlock(n){
  var note = noteById(n.noteId);
  if (!n.noteId) return '<button class="m-btn" data-act="link-note"><i class="fa-regular fa-file-lines"></i>Link a note</button>';
  return '<div class="fs-notecard"><b>' + esc(note ? note.title || 'Untitled' : 'Note not found') + '</b>' +
    '<div class="fs-row" style="margin-top:8px"><a class="m-btn" href="' + noteUrl(n.noteId) + '" target="_blank" rel="noopener">Open</a>' +
    '<button class="m-btn" data-act="link-note">Change</button>' + (n.shape === 'note' ? '' : '<button class="m-btn ghost" data-act="unlink-note">Remove</button>') + '</div></div>';
}
function renderInsp(){
  var box = $('insp'), app = $('app'), ids = F ? selIds() : [];
  var e = F && SELE ? edgeById(SELE) : null;
  var h = '';
  if (!F) { app.classList.add('no-insp'); box.innerHTML = ''; return; }
  if (ids.length === 1) {
    var n = nodeById(ids[0]);
    var shapes = [['rect','Box'],['round','Pill'],['diamond','Decision'],['ellipse','Circle'],['text','Text']];
    h += '<div class="fs-side-h">' + (n.shape === 'note' ? 'Note card' : n.shape === 'icon' ? 'Icon' : 'Shape') + '</div><div class="fs-insp-b">';
    h += '<div><div class="fs-lbl">' + (n.shape === 'note' ? 'Caption' : 'Text') + '</div><textarea class="fs-ta" id="in-text" maxlength="2000">' + esc(n.text) + '</textarea></div>';
    if (n.shape !== 'note' && n.shape !== 'icon') h += '<div><div class="fs-lbl">Shape</div><select class="fs-sel" id="in-shape">' + shapes.map(function(s){
      return '<option value="' + s[0] + '"' + (s[0] === n.shape ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>';
    if (n.shape === 'icon') h += '<div><div class="fs-lbl">Icon</div><button class="m-btn" data-act="icon"><i class="fa-solid fa-' + esc(n.icon) + '"></i>Change icon</button></div>';
    h += '<div><div class="fs-lbl">Colour</div>' + swatches(n.color) + '</div>';
    h += '<div><div class="fs-lbl">Text size</div>' + seg('size', [['s','Small'],['m','Medium'],['l','Large']], n.size || 'm') + '</div>';
    h += '<div><div class="fs-lbl">' + (n.shape === 'note' ? 'Note' : 'Linked note') + '</div>' + noteBlock(n) + '</div>';
    h += '<div class="fs-row"><button class="m-btn" data-act="dup"><i class="fa-regular fa-copy"></i>Duplicate</button><button class="m-btn" data-act="front">To front</button>' +
         '<button class="m-btn" data-act="del" style="color:var(--fault)"><i class="fa-solid fa-trash"></i>Delete</button></div></div>';
  } else if (ids.length > 1) {
    h += '<div class="fs-side-h">' + ids.length + ' selected</div><div class="fs-insp-b">' +
      '<div><div class="fs-lbl">Colour</div>' + swatches(null) + '</div>' +
      '<div><div class="fs-lbl">Text size</div>' + seg('size', [['s','Small'],['m','Medium'],['l','Large']], null) + '</div>' +
      '<div><div class="fs-lbl">Align</div><div class="fs-row"><button class="m-btn" data-act="al-l" title="Align left edges"><i class="fa-solid fa-align-left"></i></button>' +
      '<button class="m-btn" data-act="al-c" title="Align centres vertically"><i class="fa-solid fa-align-center"></i></button>' +
      '<button class="m-btn" data-act="al-t" title="Align top edges"><i class="fa-solid fa-arrows-up-to-line"></i></button>' +
      '<button class="m-btn" data-act="al-m" title="Align middles horizontally"><i class="fa-solid fa-grip-lines"></i></button></div></div>' +
      '<div class="fs-row"><button class="m-btn" data-act="dup"><i class="fa-regular fa-copy"></i>Duplicate</button>' +
      '<button class="m-btn" data-act="del" style="color:var(--fault)"><i class="fa-solid fa-trash"></i>Delete</button></div></div>';
  } else if (e) {
    h += '<div class="fs-side-h">Arrow</div><div class="fs-insp-b">' +
      '<div><div class="fs-lbl">Label</div><input class="fs-in" id="in-label" maxlength="300" value="' + esc(e.label) + '" placeholder="Yes, No, then&hellip;"></div>' +
      '<div><div class="fs-lbl">Colour</div>' + swatches(e.color) + '</div>' +
      '<div><div class="fs-lbl">Line</div>' + seg('dashed', [['0','Solid'],['1','Dashed']], e.dashed ? '1' : '0') + '</div>' +
      '<div><div class="fs-lbl">Arrowheads</div>' + seg('arrow', [['end','End'],['both','Both'],['none','None']], e.arrow) + '</div>' +
      '<div class="fs-row"><button class="m-btn" data-act="rev"><i class="fa-solid fa-right-left"></i>Reverse</button>' +
      '<button class="m-btn" data-act="del" style="color:var(--fault)"><i class="fa-solid fa-trash"></i>Delete</button></div></div>';
  }
  if (!h) { app.classList.add('no-insp'); box.innerHTML = ''; return; }
  app.classList.remove('no-insp');
  box.innerHTML = h;
}
$('insp').addEventListener('click', function(ev){
  var c = ev.target.closest('[data-color]');
  if (c) { setProp('color', c.getAttribute('data-color')); return; }
  var sb = ev.target.closest('[data-seg] button');
  if (sb) {
    var k = sb.parentNode.getAttribute('data-seg'), v = sb.getAttribute('data-v');
    setProp(k, k === 'dashed' ? v === '1' : v); return;
  }
  var a = ev.target.closest('[data-act]'); if (!a) return;
  var act = a.getAttribute('data-act'), ids = selIds(), one = ids.length === 1 ? nodeById(ids[0]) : null;
  if (act === 'del') deleteSel();
  else if (act === 'dup') duplicate();
  else if (act === 'front') toFront();
  else if (act === 'icon' && one) pickIcon(function(ic){ checkpoint(); one.icon = ic; changed(); });
  else if (act === 'link-note' && one) pickNote(function(id){ checkpoint(); one.noteId = id; changed(); });
  else if (act === 'unlink-note' && one) { checkpoint(); one.noteId = null; changed(); }
  else if (act === 'rev' && SELE) { var e = edgeById(SELE); checkpoint(); var t = e.from; e.from = e.to; e.to = t; changed(); }
  else if (act.indexOf('al-') === 0 && ids.length > 1) {
    var ns = ids.map(nodeById); checkpoint();
    if (act === 'al-l') { var mx = Math.min.apply(null, ns.map(function(n){ return n.x; })); ns.forEach(function(n){ n.x = mx; }); }
    if (act === 'al-t') { var my = Math.min.apply(null, ns.map(function(n){ return n.y; })); ns.forEach(function(n){ n.y = my; }); }
    if (act === 'al-c') { var cx = ns[0].x + ns[0].w / 2; ns.forEach(function(n){ n.x = Math.round(cx - n.w / 2); }); }
    if (act === 'al-m') { var cy = ns[0].y + ns[0].h / 2; ns.forEach(function(n){ n.y = Math.round(cy - n.h / 2); }); }
    changed();
  }
});
// Typing in the inspector updates the canvas live; one undo step per field visit.
var inspFocusSnap = null;
$('insp').addEventListener('focusin', function(ev){ if (ev.target.id === 'in-text' || ev.target.id === 'in-label') inspFocusSnap = snapshot(); });
$('insp').addEventListener('input', function(ev){
  var ids = selIds();
  if (ev.target.id === 'in-text' && ids.length === 1) {
    var n = nodeById(ids[0]); n.text = ev.target.value.slice(0, 2000);
    var el = document.querySelector('.fs-node[data-id="' + n.id + '"] .fs-txt'); if (el) el.textContent = n.text;
    scheduleSave();
  } else if (ev.target.id === 'in-label' && SELE) {
    edgeById(SELE).label = ev.target.value.slice(0, 300); renderEdges(); scheduleSave();
  }
});
$('insp').addEventListener('focusout', function(ev){
  if ((ev.target.id === 'in-text' || ev.target.id === 'in-label') && inspFocusSnap && inspFocusSnap !== snapshot()) {
    HIST.push(inspFocusSnap); FUT = []; updUndo();
  }
  inspFocusSnap = null;
});
$('insp').addEventListener('change', function(ev){
  if (ev.target.id === 'in-shape') setProp('shape', ev.target.value);
});

// ── pickers ─────────────────────────────────────────────────────────────────
function closeModal(){ $('modal').classList.remove('on'); $('mbox').innerHTML = ''; }
$('modal').addEventListener('click', function(e){ if (e.target === $('modal')) closeModal(); });
function pickNote(cb){
  $('mbox').innerHTML = '<div class="fs-mh"><i class="fa-regular fa-note-sticky" style="color:var(--muted)"></i><input class="fs-in" id="pk-q" placeholder="Search notes, or type a title for a new one" aria-label="Search notes">' +
    '<button class="fs-tool" id="pk-x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="fs-ml" id="pk-l"></div>';
  $('modal').classList.add('on');
  var q = $('pk-q'); q.focus();
  function draw(){
    var t = q.value.trim().toLowerCase();
    var list = NOTES.filter(function(n){ return !t || (n.title || '').toLowerCase().indexOf(t) > -1 || (!n.hidden && (n.body || '').toLowerCase().indexOf(t) > -1); })
      .sort(function(a, b){ return String(b.updated).localeCompare(String(a.updated)); }).slice(0, 60);
    var h = q.value.trim() ? '<button class="fs-mi" data-new="1"><i class="fa-solid fa-plus" style="color:var(--accent)"></i><span>New note &ldquo;' + esc(q.value.trim()) + '&rdquo;</span></button>' : '';
    h += list.map(function(n){
      return '<button class="fs-mi" data-note="' + esc(n.id) + '"><i class="fa-regular fa-file-lines" style="color:var(--muted)"></i><span>' + esc(n.title || 'Untitled') +
        '<small>' + esc(n.hidden ? 'Hidden' : plain(n.body).slice(0, 90)) + '</small></span></button>';
    }).join('');
    $('pk-l').innerHTML = h || '<div style="padding:14px;color:var(--muted)">No notes match.</div>';
  }
  draw();
  q.addEventListener('input', draw);
  q.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); if (e.key === 'Enter') { var f = $('pk-l').querySelector('.fs-mi'); if (f) f.click(); } });
  $('pk-x').addEventListener('click', closeModal);
  $('pk-l').addEventListener('click', function(e){
    var b = e.target.closest('.fs-mi'); if (!b) return;
    if (b.getAttribute('data-new')) {
      fetch('/api/notes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: q.value.trim() }) })
        .then(function(r){ return r.json(); }).then(function(n){ NOTES.push(n); closeModal(); cb(n.id); showToast('Note created', 'ok'); });
      return;
    }
    closeModal(); cb(b.getAttribute('data-note'));
  });
}
function pickIcon(cb){
  $('mbox').innerHTML = '<div class="fs-mh"><input class="fs-in" id="pk-q" placeholder="Search icons" aria-label="Search icons">' +
    '<button class="fs-tool" id="pk-x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="fs-icons" id="pk-l"></div>';
  $('modal').classList.add('on');
  var q = $('pk-q'); q.focus();
  function draw(){
    var t = q.value.trim().toLowerCase();
    $('pk-l').innerHTML = ICONS.filter(function(i){ return !t || i.indexOf(t) > -1; }).map(function(i){
      return '<button data-ic="' + i + '" title="' + i + '" aria-label="' + i + '"><i class="fa-solid fa-' + i + '"></i></button>'; }).join('');
  }
  draw();
  q.addEventListener('input', draw);
  q.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });
  $('pk-x').addEventListener('click', closeModal);
  $('pk-l').addEventListener('click', function(e){ var b = e.target.closest('[data-ic]'); if (!b) return; closeModal(); cb(b.getAttribute('data-ic')); });
}

// ── pointer interaction ─────────────────────────────────────────────────────
var drag = null;
var stage = $('stage');
stage.addEventListener('pointerdown', function(e){
  if (!F || editing) return;
  if (e.target.closest('.fs-link')) return;
  var w = toWorld(e.clientX, e.clientY);
  if (e.button === 1 || (e.button === 0 && spaceDown)) { drag = { kind:'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); }
  else if (e.button !== 0) return;
  else if (e.target.closest('.fs-port')) {
    var nid = e.target.closest('.fs-node').getAttribute('data-id');
    drag = { kind:'link', from: nid, side: e.target.getAttribute('data-side') };
  } else if (e.target.closest('.fs-rz')) {
    var rn = nodeById(e.target.closest('.fs-node').getAttribute('data-id'));
    drag = { kind:'resize', id: rn.id, sx: w.x, sy: w.y, w: rn.w, h: rn.h, snap: snapshot(), moved: false };
  } else if (e.target.closest('.fs-node')) {
    var id = e.target.closest('.fs-node').getAttribute('data-id');
    if (e.shiftKey) { if (SEL[id]) delete SEL[id]; else SEL[id] = 1; }
    else if (!SEL[id]) { SEL = {}; SEL[id] = 1; }
    SELE = null;
    var starts = {}; selIds().forEach(function(i){ var n = nodeById(i); starts[i] = [n.x, n.y]; });
    drag = { kind:'move', sx: w.x, sy: w.y, starts: starts, snap: snapshot(), moved: false };
    applySel();
  } else if (e.target.closest('[data-edge]')) {
    SELE = e.target.closest('[data-edge]').getAttribute('data-edge'); SEL = {};
    applySel();
    return;
  } else if (e.shiftKey) {
    drag = { kind:'marquee', sx: e.clientX, sy: e.clientY, base: Object.assign({}, SEL) };
  } else {
    drag = { kind:'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, click: true };
    stage.classList.add('panning');
  }
  // No pointer capture: it would retarget the click and dblclick that follow to
  // the stage, so double-clicking a box would add a new one instead of editing.
  // Moves and the release are followed on window instead.
  if (drag) interacting = true;
});
window.addEventListener('pointermove', function(e){
  if (!drag) return;
  var w = toWorld(e.clientX, e.clientY);
  if (drag.kind === 'pan') {
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.click = false;
    view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView();
  } else if (drag.kind === 'move') {
    var dx = w.x - drag.sx, dy = w.y - drag.sy;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3 / view.zoom) return;
    drag.moved = true;
    var ids = Object.keys(drag.starts);
    ids.forEach(function(id){ var n = nodeById(id), s = drag.starts[id]; n.x = snapV(s[0] + dx); n.y = snapV(s[1] + dy); });
    moveNodeEls(ids);
  } else if (drag.kind === 'resize') {
    var n = nodeById(drag.id); drag.moved = true;
    n.w = Math.max(40, snapV(drag.w + w.x - drag.sx)); n.h = Math.max(30, snapV(drag.h + w.y - drag.sy));
    moveNodeEls([n.id]);
  } else if (drag.kind === 'link') {
    var a = nodeById(drag.from), p1 = anchor(a, drag.side);
    var g = $('ghost'); g.style.display = ''; g.setAttribute('d', curve(p1, drag.side, [w.x, w.y], null).d);
    document.querySelectorAll('.fs-node.target').forEach(function(el){ el.classList.remove('target'); });
    var under = document.elementFromPoint(e.clientX, e.clientY), t = under && under.closest('.fs-node');
    if (t && t.getAttribute('data-id') !== drag.from) t.classList.add('target');
  } else if (drag.kind === 'marquee') {
    var r = stage.getBoundingClientRect(), m = $('marquee');
    var x1 = Math.min(drag.sx, e.clientX), y1 = Math.min(drag.sy, e.clientY), x2 = Math.max(drag.sx, e.clientX), y2 = Math.max(drag.sy, e.clientY);
    m.style.display = 'block'; m.style.left = (x1 - r.left) + 'px'; m.style.top = (y1 - r.top) + 'px'; m.style.width = (x2 - x1) + 'px'; m.style.height = (y2 - y1) + 'px';
    var a1 = toWorld(x1, y1), a2 = toWorld(x2, y2);
    SEL = Object.assign({}, drag.base);
    F.nodes.forEach(function(n){ if (n.x < a2.x && n.x + n.w > a1.x && n.y < a2.y && n.y + n.h > a1.y) SEL[n.id] = 1; });
    document.querySelectorAll('.fs-node').forEach(function(el){ el.classList.toggle('sel', !!SEL[el.getAttribute('data-id')]); });
  }
});
function endDrag(e){
  if (!drag) return;
  var d = drag; drag = null; interacting = false;
  stage.classList.remove('panning');
  if (d.kind === 'pan') { if (d.click) { SEL = {}; SELE = null; applySel(); } else scheduleSave(1500); }
  else if ((d.kind === 'move' || d.kind === 'resize') && d.moved) { HIST.push(d.snap); FUT = []; updUndo(); changed(); }
  else if (d.kind === 'link') {
    $('ghost').style.display = 'none';
    document.querySelectorAll('.fs-node.target').forEach(function(el){ el.classList.remove('target'); });
    var under = e && document.elementFromPoint(e.clientX, e.clientY), t = under && under.closest('.fs-node');
    var to = t && t.getAttribute('data-id');
    if (to && to !== d.from) {
      checkpoint(); F.edges.push({ id: uid('e'), from: d.from, to: to, label: '', color: 'slate', dashed: false, arrow: 'end' }); changed();
    } else if (!to && e && e.type === 'pointerup') {
      // Dropped on empty canvas: grow the flow with a new box there.
      var w = toWorld(e.clientX, e.clientY), src = nodeById(d.from);
      var n = addNode(src.shape === 'note' || src.shape === 'icon' || src.shape === 'text' ? 'rect' : src.shape === 'diamond' ? 'rect' : src.shape, w.x, w.y);
      F.edges.push({ id: uid('e'), from: d.from, to: n.id, label: '', color: 'slate', dashed: false, arrow: 'end' });
      changed(); editText(n.id);
    }
  } else if (d.kind === 'marquee') { $('marquee').style.display = 'none'; applySel(); }
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
// Focusing text near the edge makes the browser scroll even an overflow:hidden
// box, which would shift every screen-to-canvas conversion. Keep it at 0.
stage.addEventListener('scroll', function(){ stage.scrollLeft = 0; stage.scrollTop = 0; });
stage.addEventListener('dblclick', function(e){
  if (!F || editing) return;
  var lab = e.target.closest('[data-edge]');
  if (lab) { editLabel(lab.getAttribute('data-edge')); return; }
  var el = e.target.closest('.fs-node');
  if (el) {
    var n = nodeById(el.getAttribute('data-id'));
    if (n.shape === 'note') { if (n.noteId) window.open(noteUrl(n.noteId), '_blank'); else pickNote(function(id){ checkpoint(); n.noteId = id; changed(); }); }
    else editText(n.id);
    return;
  }
  var w = toWorld(e.clientX, e.clientY);
  var nn = addNode('rect', w.x, w.y); if (nn) editText(nn.id);
});
stage.addEventListener('wheel', function(e){
  if (!F) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
  else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); scheduleSave(1500); }
}, { passive: false });

// Palette: drag onto the canvas, or click to drop one in the middle.
document.querySelectorAll('[data-add]').forEach(function(b){
  b.addEventListener('dragstart', function(e){ e.dataTransfer.setData('text/x-flow-shape', b.getAttribute('data-add')); e.dataTransfer.effectAllowed = 'copy'; });
  b.addEventListener('click', function(){ startAdd(b.getAttribute('data-add')); });
});
stage.addEventListener('dragover', function(e){ if (e.dataTransfer.types.indexOf('text/x-flow-shape') > -1) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
stage.addEventListener('drop', function(e){
  var s = e.dataTransfer.getData('text/x-flow-shape'); if (!s) return;
  e.preventDefault();
  var w = toWorld(e.clientX, e.clientY); startAdd(s, w.x, w.y);
});

// ── keyboard ────────────────────────────────────────────────────────────────
var spaceDown = false;
document.addEventListener('keyup', function(e){ if (e.key === ' ') spaceDown = false; });
document.addEventListener('keydown', function(e){
  if ($('modal').classList.contains('on')) { if (e.key === 'Escape') closeModal(); return; }
  var t = document.activeElement, tag = t && t.tagName;
  if (editing || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  if (!F) return;
  var ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); }
  else if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (ctrl && k === 'd') { e.preventDefault(); duplicate(); }
  else if (ctrl && k === 'c') { if (copySel()) showToast('Copied ' + CLIP.nodes.length + ' item' + (CLIP.nodes.length === 1 ? '' : 's'), 'ok'); }
  else if (ctrl && k === 'x') { if (copySel()) deleteSel(); }
  else if (ctrl && k === 'v') { e.preventDefault(); paste(GRID * 2); }
  else if (ctrl && k === 'a') { e.preventDefault(); SEL = {}; F.nodes.forEach(function(n){ SEL[n.id] = 1; }); SELE = null; render(); }
  else if (e.key === 'Escape') { SEL = {}; SELE = null; applySel(); }
  else if (e.key === 'Enter' || e.key === 'F2') { var ids = selIds(); if (ids.length === 1) { e.preventDefault(); editText(ids[0]); } else if (SELE) { e.preventDefault(); editLabel(SELE); } }
  else if (e.key.indexOf('Arrow') === 0 && selIds().length) {
    e.preventDefault();
    var step = e.shiftKey ? GRID : (snapOn ? GRID / 2 : 1);
    var dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    checkpoint(); selIds().forEach(function(id){ var n = nodeById(id); n.x += dx; n.y += dy; }); moveNodeEls(selIds()); scheduleSave();
  }
  else if (!ctrl && (e.key === '+' || e.key === '=')) zoomAt(view.zoom * 1.2);
  else if (!ctrl && e.key === '-') zoomAt(view.zoom / 1.2);
  else if (!ctrl && e.key === '0') fit();
});

// ── toolbar ─────────────────────────────────────────────────────────────────
$('fs-undo').addEventListener('click', undo);
$('fs-redo').addEventListener('click', redo);
$('fs-zin').addEventListener('click', function(){ zoomAt(view.zoom * 1.2); });
$('fs-zout').addEventListener('click', function(){ zoomAt(view.zoom / 1.2); });
$('fs-fit').addEventListener('click', fit);
$('fs-snap').addEventListener('click', function(){ snapOn = !snapOn; this.classList.toggle('on', snapOn); try { localStorage.setItem('openhl-flow-snap', snapOn ? '1' : '0'); } catch(e){} });
$('fs-new').addEventListener('click', function(){ newFlow(); });
$('fs-list-t').addEventListener('click', function(){
  var hid = $('app').classList.toggle('no-list');
  try { localStorage.setItem('openhl-flow-list', hid ? '0' : '1'); } catch(e){}
});
$('fs-name').addEventListener('input', function(){ if (!F) return; F.name = this.value.slice(0, 120) || 'Untitled flow'; scheduleSave(); });
$('fs-name').addEventListener('keydown', function(e){ if (e.key === 'Enter') this.blur(); });
$('fs-flows').addEventListener('click', function(e){
  var del = e.target.closest('[data-del]');
  if (del) {
    var id = del.getAttribute('data-del'), f = FLOWS.filter(function(x){ return x.id === id; })[0];
    if (!confirm('Delete the flow "' + (f ? f.name : '') + '"? This cannot be undone.')) return;
    if (F && F.id === id) { dirty = false; clearTimeout(saveT); }
    fetch('/api/flows/' + id, { method:'DELETE' }).then(function(){
      return loadList();
    }).then(function(){ if (F && F.id === id) { if (FLOWS.length) openFlow(FLOWS[0].id); else noFlow(); } });
    return;
  }
  var row = e.target.closest('[data-flow]');
  if (row && (!F || row.getAttribute('data-flow') !== F.id)) openFlow(row.getAttribute('data-flow'));
});

// ── live updates ────────────────────────────────────────────────────────────
function loadNotes(){
  return fetch('/api/notes').then(function(r){ return r.json(); }).then(function(n){ NOTES = Array.isArray(n) ? n : []; if (F && !busy()) render(); });
}
try {
  var es = openhlEvents();
  es.addEventListener('flows_changed', function(ev){
    var d = {}; try { d = JSON.parse(ev.data); } catch(e){}
    if (d.client === CLIENT) return;
    loadList().then(function(){
      // Someone else changed the flow open here. Follow along unless there are
      // edits of our own not yet saved, which would be lost.
      if (F && d.id === F.id) {
        if (!FLOWS.some(function(f){ return f.id === F.id; })) { showToast('This flow was deleted elsewhere', 'bad'); noFlow(); return; }
        if (!dirty && !inflight && !busy()) openFlow(F.id, true);
      }
    });
  });
  es.addEventListener('change', function(ev){ var d = {}; try { d = JSON.parse(ev.data); } catch(e){} if (d.type === 'notes') loadNotes(); });
} catch(e){}

// ── boot ────────────────────────────────────────────────────────────────────
try {
  if (localStorage.getItem('openhl-flow-snap') === '0') { snapOn = false; $('fs-snap').classList.remove('on'); }
  if (localStorage.getItem('openhl-flow-list') === '0' || window.innerWidth <= 900) $('app').classList.add('no-list');
} catch(e){}
updUndo(); applyView();
Promise.all([loadList(), loadNotes()]).then(function(){
  var want = new URLSearchParams(location.search).get('open'), last = null;
  try { last = localStorage.getItem('openhl-flow'); } catch(e){}
  var has = function(id){ return id && FLOWS.some(function(f){ return f.id === id; }); };
  var id = has(want) ? want : has(last) ? last : FLOWS[0] && FLOWS[0].id;
  if (want && !has(want)) showToast('That flow no longer exists', 'bad');
  if (id) openFlow(id); else noFlow();
});
})();
