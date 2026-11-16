// comes back null rather than a confidently wrong timestamp.
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function parseWhen(hint, now = new Date()) {
  const h = String(hint || "").toLowerCase().trim();
  if (!h || h === "now" || h === "immediately" || h === "asap") return { at: null, label: "now" };
  // explicit ISO from the model or the UI
  const iso = Date.parse(h);
  if (!isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(h)) {
    const d = new Date(iso);
    return d > now ? { at: d.toISOString(), label: d.toLocaleString() } : { at: null, label: "now (given time is past)" };
  }
  let m = h.match(/^in\s+(\d+)\s*(min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2][0] === "m" ? 60000 : m[2][0] === "h" ? 3600000 : m[2][0] === "d" ? 86400000 : 604800000;
    const d = new Date(now.getTime() + n * unit);
    return { at: d.toISOString(), label: d.toLocaleString() };
  }
  const timeOf = str => {
    const t = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!t) return null;
    let hh = parseInt(t[1], 10);
    const mm = t[2] ? parseInt(t[2], 10) : 0;
    if (t[3] === "pm" && hh < 12) hh += 12;
    if (t[3] === "am" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  };
  m = h.match(/^(today|tomorrow)\b(.*)$/);
  if (m) {
    const d = new Date(now);
    if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
    const t = timeOf(m[2]) || { hh: 9, mm: 0 };
    d.setHours(t.hh, t.mm, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { at: d.toISOString(), label: d.toLocaleString() };
  }
  for (let i = 0; i < 7; i++) {
    if (h.startsWith(WEEKDAYS[i]) || h.startsWith("next " + WEEKDAYS[i])) {
      const d = new Date(now);
      const t = timeOf(h) || { hh: 9, mm: 0 };
      let delta = (i - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      d.setHours(t.hh, t.mm, 0, 0);
      return { at: d.toISOString(), label: d.toLocaleString() };
    }
  }
  const t = timeOf(h);
  if (t && /^\d/.test(h)) {
    const d = new Date(now);
    d.setHours(t.hh, t.mm, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { at: d.toISOString(), label: d.toLocaleString() };
  }
  return { at: null, label: null, unparsed: h };
}


module.exports = { WEEKDAYS, parseWhen };
