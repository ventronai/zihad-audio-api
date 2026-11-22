// api/audio.js — Zihad Audio API (Vercel Serverless, কোনো package লাগে না)
const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const FALLBACK_PIPED = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://api.piped.private.coffee"];
const FALLBACK_INV = ["https://yewtu.be", "https://inv.nadeko.net", "https://invidious.nerdvpn.de"];

let cache = { t: 0, piped: [], inv: [] };

async function jget(url, ms = 7000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": UA } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function instances() {
  if (Date.now() - cache.t < 3600000 && cache.piped.length) return cache;
  let piped = [], inv = [];
  try {
    const d = await jget("https://piped-instances.kavin.rocks/", 5000);
    piped = d.map((x) => x.api_url).filter(Boolean);
  } catch (e) {}
  try {
    const d = await jget("https://api.invidious.io/instances.json?sort_by=health", 5000);
    inv = d.filter((x) => x[1] && x[1].api && x[1].type === "https").map((x) => x[1].uri);
  } catch (e) {}
  cache = {
    t: Date.now(),
    piped: [...new Set([...piped, ...FALLBACK_PIPED])],
    inv: [...new Set([...inv, ...FALLBACK_INV])],
  };
  return cache;
}

const best = (arr, mime, rate) =>
  (arr || [])
    .filter((a) => /audio/i.test(mime(a) || "") && a.url)
    .sort((a, b) => (rate(b) || 0) - (rate(a) || 0))[0];

async function viaPiped(base, id) {
  const d = await jget(`${base}/streams/${id}`);
  const a = best(d.audioStreams, (x) => x.mimeType, (x) => x.bitrate);
  if (!a) throw new Error("no audio");
  return { url: a.url, ext: /webm/i.test(a.mimeType) ? "webm" : "m4a" };
}

async function viaInv(base, id) {
  const d = await jget(`${base}/api/v1/videos/${id}?local=true&fields=adaptiveFormats`);
  const a = best(d.adaptiveFormats, (x) => x.type, (x) => parseInt(x.bitrate));
  if (!a) throw new Error("no audio");
  return { url: a.url.startsWith("http") ? a.url : base + a.url, ext: /webm/i.test(a.type) ? "webm" : "m4a" };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const q = req.query || {};

  if (process.env.API_KEY && q.key !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: "invalid key" });
  }

  let id = (q.id || "").trim();
  if (!id && q.url) {
    const m = String(q.url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
    if (m) id = m[1];
  }
  if (!/^[\w-]{11}$/.test(id)) {
    return res.status(400).json({ ok: false, error: "use /api/audio?id=VIDEO_ID (11 character YouTube id)" });
  }

  try {
    const { piped, inv } = await instances();
    const jobs = [];
    for (let i = 0; i < 4; i++) {
      if (piped[i]) jobs.push(viaPiped(piped[i], id).then((r) => ({ ...r, source: "piped:" + piped[i].replace("https://", "") })));
      if (inv[i]) jobs.push(viaInv(inv[i], id).then((r) => ({ ...r, source: "inv:" + inv[i].replace("https://", "") })));
    }
    const r = await Promise.any(jobs);
    res.setHeader("Cache-Control", "s-maxage=600");
    return res.status(200).json({ ok: true, id, url: r.url, ext: r.ext, source: r.source });
  } catch (e) {
    return res.status(502).json({ ok: false, id, error: "সব সার্ভার ব্যর্থ, একটু পরে আবার চেষ্টা করো" });
  }
};
