// ─── MULTIPART PARSER ─────────────────────────────────────────────────────────
function idxOf(buf, search, start=0) {
  outer: for(let i=start;i<=buf.length-search.length;i++){for(let j=0;j<search.length;j++)if(buf[i+j]!==search[j])continue outer;return i;}
  return -1;
}
function parseMultipart(body, boundary) {
  const bnd = Buffer.from('--' + boundary);
  const parts = [];
  let pos = 0;
  while (true) {
    const bp = idxOf(body, bnd, pos); if (bp === -1) break;
    const hs = bp + bnd.length + 2;
    if (body.slice(hs, hs + 2).toString() === '--') break;
    const he = idxOf(body, Buffer.from('\r\n\r\n'), hs); if (he === -1) break;
    const hdrs = body.slice(hs, he).toString();
    const ds = he + 4, nb = idxOf(body, bnd, ds); if (nb === -1) break;
    const filename     = hdrs.match(/filename="([^"]*)"/)?.[1] || '';
    const relativePath = hdrs.match(/name="relativePath"/) ? null : undefined;
    parts.push({ name: hdrs.match(/name="([^"]+)"/)?.[1], filename, relativePath, data: body.slice(ds, nb - 2) });
    pos = nb;
  }
  // Extract relativePath from a separate field if present
  const relMap = {};
  for (const p of parts) { if (p.name === 'relativePath') relMap[p.filename] = p.data.toString(); }
  return parts.filter(p => p.name !== 'relativePath' && p.filename).map(p => ({
    ...p, relativePath: relMap[p.filename] || p.filename
  }));
}

module.exports = { idxOf, parseMultipart };
