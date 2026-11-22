// api/debug.js — কোন সার্ভার কেন fail করছে দেখায়
const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const ID = "dQw4w9WgXcQ";

async function jget(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": UA } });
    const txt = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status + " " + txt.slice(0, 60).replace(/\s+/g, " "));
    return JSON.parse(txt);
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  let piped = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://api.piped.private.coffee"];
  let inv = ["https://yewtu.be", "https://inv.nadeko.net", "https://invidious.nerdvpn.de"];
  const info = {};
  try {
    const d = await jget("https://piped-instances.kavin.rocks/");
    info.pipedList = d.length;
    piped = [...new Set([...d.map((x) => x.api_url).filter(Boolean).slice(0, 6), ...piped])];
  } catch (e) { info.pipedList = "ERR " + e.message; }
  try {
    const d = await jget("https://api.invidious.io/instances.json?sort_by=health");
    info.invList = d.length;
    inv = [...new Set([...d.filter((x) => x[1] && x[1].api && x[1].type === "https").map((x) => x[1].uri).slice(0, 6), ...inv])];
  } catch (e) { info.invList = "ERR " + e.message; }

  const jobs = [
    ...piped.map((b) => jget(`${b}/streams/${ID}`).then((d) => ({ s: "piped " + b.replace("https://", ""), r: "OK audio=" + ((d.audioStreams || []).length) })).catch((e) => ({ s: "piped " + b.replace("https://", ""), r: "ERR " + e.message }))),
    ...inv.map((b) => jget(`${b}/api/v1/videos/${ID}?local=true&fields=adaptiveFormats`).then((d) => ({ s: "inv " + b.replace("https://", ""), r: "OK fmt=" + ((d.adaptiveFormats || []).length) })).catch((e) => ({ s: "inv " + b.replace("https://", ""), r: "ERR " + e.message }))),
  ];
  info.results = await Promise.all(jobs);
  res.status(200).send(JSON.stringify(info, null, 1));
};
