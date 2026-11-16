// ── Similarity, for duplicate detection ─────────────────────────────────────
// Word-level Jaccard plus character trigrams. Jaccard alone misses reworded
// posts; trigrams alone over-match on shared boilerplate. Taking the max of the
// two catches both "same words, shuffled" and "same phrasing, swapped nouns".
function socialNorm(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function jaccard(a, b) {
  const A = new Set(socialNorm(a).split(" ").filter(w => w.length > 2));
  const B = new Set(socialNorm(b).split(" ").filter(w => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(w => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}
function trigrams(s) {
  const t = socialNorm(s), out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}
function trigramSim(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(g => { if (B.has(g)) inter++; });
  return inter / Math.min(A.size, B.size);
}
function socialSimilarity(a, b) { return Math.max(jaccard(a, b), trigramSim(a, b)); }
// Returns the closest prior post if it is similar enough to be worth flagging.
function findDuplicate(text, history, threshold = 0.55) {
  let best = null;
  for (const h of history) {
    const score = socialSimilarity(text, h.text);
    if (score >= threshold && (!best || score > best.score)) {
      best = { score: Math.round(score * 100) / 100, text: h.text,
        at: h.finishedAt || h.scheduledAt || h.createdAt, status: h.status };
    }
  }
  return best;
}

// ── Deterministic schedule parsing ──────────────────────────────────────────
// Small local models get date arithmetic wrong constantly, so the model returns
// a plain-English hint and this function does the maths. Anything unparseable

module.exports = { findDuplicate, jaccard, socialNorm, socialSimilarity, trigramSim, trigrams };
