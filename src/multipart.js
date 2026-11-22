// ─── MULTIPART PARSER ─────────────────────────────────────────────────────────
// Buffer.indexOf is native; the old byte-by-byte loop took minutes on a large
// video.
function idxOf(buf, search, start=0) {
  return buf.indexOf(search, start);
}

// Returns the file parts as [{ name, filename, relativePath, data }], with the
// plain text fields (relativePath, groupId, …) on the array as .fields.
function parseMultipart(body, boundary) {
  const bnd = Buffer.from('--' + boundary);
  const CRLF2 = Buffer.from('\r\n\r\n');
  const parts = [];
  let pos = 0;
  while (true) {
    const bp = idxOf(body, bnd, pos); if (bp === -1) break;
    const hs = bp + bnd.length + 2;
    if (body.slice(hs - 2, hs).toString() === '--') break;
    const he = idxOf(body, CRLF2, hs); if (he === -1) break;
    const hdrs = body.slice(hs, he).toString();
    const ds = he + 4, nb = idxOf(body, bnd, ds); if (nb === -1) break;
    const fn = hdrs.match(/filename="([^"]*)"/);
    parts.push({
      name: hdrs.match(/;\s*name="([^"]*)"/)?.[1] || '',
      filename: fn ? fn[1] : null,           // null: a text field, not a file
      data: body.slice(ds, nb - 2),
    });
    pos = nb;
  }
  const fields = {};
  for (const p of parts) if (p.filename === null) fields[p.name] = p.data.toString();
  const files = parts.filter(p => p.filename);
  // The page sends one file per request with its folder path in a
  // relativePath field (it used to be looked up by filename, which a text
  // field never has, so folder uploads lost their folders).
  const out = files.map(p => ({ ...p, relativePath: (files.length === 1 && fields.relativePath) || p.filename }));
  out.fields = fields;
  return out;
}

// The boundary from a Content-Type header, with or without quotes and with any
// later parameters cut off.
function boundaryOf(ct) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(ct || '');
  return m ? (m[1] || m[2]) : '';
}

module.exports = { boundaryOf, idxOf, parseMultipart };
