#!/usr/bin/env python3
"""Assemble the self-contained audition folder: index.html + new/*.ogg + current/*.ogg (copies of today's game sounds).

    python3 tools/audio/audition.py DEST_DIR

Needs out/ and manifest.json from build.py. The page makes no external requests; open index.html straight from disk.
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(os.path.dirname(os.path.dirname(HERE)), "public")


def assemble(dest):
    man = json.load(open(os.path.join(HERE, "manifest.json")))
    os.makedirs(os.path.join(dest, "new"), exist_ok=True)
    os.makedirs(os.path.join(dest, "current"), exist_ok=True)
    rows = []
    for gid, g in man["groups"].items():
        vs = [s for s in man["sounds"] if s["group"] == gid]
        if not vs:
            continue
        cur = []
        for c in g["current"]:
            src = os.path.join(PUBLIC, c["file"])
            if not os.path.exists(src):
                continue
            name = c["file"].replace("/", "_")
            shutil.copyfile(src, os.path.join(dest, "current", name))
            cur.append({"file": "current/" + name, "label": os.path.basename(c["file"]).replace(".ogg", ""), "note": c["note"]})
        variants = []
        for s in vs:
            shutil.copyfile(os.path.join(HERE, "out", s["id"] + ".ogg"), os.path.join(dest, "new", s["id"] + ".ogg"))
            variants.append({
                "id": s["id"], "variant": s["variant"], "file": "new/" + s["id"] + ".ogg", "source": s["source"],
                "licence": s["licence"], "packs": [p["name"] for p in s["packs"]], "note": s["note"], "loop": s["loop"],
                "dur": s["duration_s"], "peak": s["peak_dbfs"], "lufs": s["lufs"], "cat": s["category"],
            })
        rows.append({"group": gid, "section": g["section"], "event": g["event"], "current": cur, "variants": variants,
                     "loop": any(v["loop"] for v in variants)})
    html = TEMPLATE.replace("/*DATA*/[]", json.dumps(rows, ensure_ascii=False))
    open(os.path.join(dest, "index.html"), "w").write(html)
    n = sum(len(r["variants"]) for r in rows)
    print(f"audition: {len(rows)} rows, {n} new sounds -> {dest}")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cockroach audio audition</title>
<style>
:root{--bg:#0e0f13;--panel:#171922;--panel2:#1f2230;--fg:#e8e9ef;--dim:#9096a8;--acc:#7cf0a8;--cur:#f0b36c;--new:#7cb7f0;--pick:#ff7ccf;--line:#2a2e3f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;background:#0b0c10ee;backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
header h1{font-size:18px;margin:0 12px 0 0}
header label{color:var(--dim);display:flex;gap:8px;align-items:center}
input[type=range]{width:160px;accent-color:var(--acc)}
input[type=search]{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:16px;width:200px}
button{font:inherit;color:var(--fg);background:var(--panel2);border:2px solid var(--line);border-radius:10px;padding:12px 18px;min-height:48px;cursor:pointer}
button:hover{border-color:#4a516c}
button:focus-visible,input:focus-visible,.row:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
button.cur{border-color:#6b4f27;color:var(--cur)}
button.new{border-color:#27496b;color:var(--new)}
button.playing{background:#243b2f;border-color:var(--acc);color:var(--acc)}
button.go{background:var(--acc);color:#04210f;border-color:var(--acc);font-weight:700}
nav{display:flex;flex-wrap:wrap;gap:6px;padding:8px 16px}
nav a{color:var(--dim);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:14px}
nav a:hover{color:var(--fg);border-color:#4a516c}
main{padding:0 16px 120px;max-width:1200px;margin:0 auto}
h2{margin:34px 0 8px;font-size:20px;border-bottom:1px solid var(--line);padding-bottom:6px;scroll-margin-top:90px}
.row{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0;display:grid;grid-template-columns:minmax(180px,1fr) 3fr;gap:8px 18px}
.row.picked{border-color:var(--pick)}
.ev{font-weight:650}
.ev small{display:block;color:var(--dim);font-weight:400;margin-top:2px}
.btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.btns .sp{width:14px}
.meta{grid-column:2;color:var(--dim);font-size:13px;display:grid;gap:3px}
.meta b{color:var(--fg);font-weight:600}
.pick{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;border-top:1px dashed var(--line);padding-top:8px;margin-top:2px;font-size:14px;color:var(--dim)}
.pick label{display:flex;gap:6px;align-items:center;cursor:pointer;color:var(--fg)}
.pick input{width:20px;height:20px;accent-color:var(--pick)}
.tag{font-size:11px;border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--dim);margin-left:6px}
footer{position:fixed;bottom:0;left:0;right:0;background:#0b0c10f2;border-top:1px solid var(--line);padding:8px 16px;color:var(--dim);font-size:13px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;z-index:5}
kbd{background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 6px;color:var(--fg)}
#toast{position:fixed;right:16px;bottom:56px;background:var(--acc);color:#04210f;padding:10px 16px;border-radius:10px;font-weight:700;opacity:0;transition:opacity .2s;z-index:9}
.hidden{display:none!important}
@media(max-width:760px){.row{grid-template-columns:1fr}.meta{grid-column:1}}
</style></head>
<body>
<header>
 <h1>Cockroach audio audition</h1>
 <label>Volume <input id="vol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Master volume"><span id="volv">70%</span></label>
 <input id="q" type="search" placeholder="Filter events (press /)" aria-label="Filter events">
 <button id="stop" title="Esc">Stop all</button>
 <button id="copy" class="go">Copy picks (<span id="npicks">0</span>)</button>
 <button id="clear" title="Forget all picks">Reset picks</button>
</header>
<nav id="nav"></nav>
<main id="main"></main>
<footer>
 <span><kbd>J</kbd>/<kbd>K</kbd> or arrows: next/prev event</span>
 <span><kbd>0</kbd> current, <kbd>1</kbd>-<kbd>9</kbd> new variants (a=1, b=2 ...)</span>
 <span><kbd>Shift</kbd>+digit: pick that one, <kbd>Shift</kbd>+<kbd>0</kbd>: keep current, <kbd>X</kbd>: skip</span>
 <span><kbd>Space</kbd>/<kbd>Esc</kbd>: stop</span>
 <span><kbd>A</kbd>: current then new (A/B)</span>
 <span>Loops (marked) repeat until you press them again.</span>
</footer>
<div id="toast"></div>
<script>
const DATA = /*DATA*/[];
const KEY = "cockroach-audition-picks-v1";
let picks = {}; try { picks = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
const audios = new Map(); // file -> Audio
let vol = 0.7;
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function getAudio(file, loop) {
  let a = audios.get(file);
  if (!a) {
    a = new Audio(file); a.preload = "auto"; a.loop = !!loop;
    a.addEventListener("ended", () => mark(file, false));
    a.addEventListener("pause", () => mark(file, false));
    a.addEventListener("play", () => mark(file, true));
    audios.set(file, a);
  }
  a.volume = vol; return a;
}
function mark(file, on) { document.querySelectorAll('button[data-file="' + CSS.escape(file) + '"]').forEach(b => b.classList.toggle("playing", on)); }
function stopAll() { audios.forEach(a => { a.pause(); a.currentTime = 0; }); chainTimer && clearTimeout(chainTimer); }
let chainTimer = null;
function play(file, loop) {
  const a = getAudio(file, loop);
  if (loop && !a.paused) { a.pause(); a.currentTime = 0; return a; }   // toggle loops
  if (!loop) audios.forEach((o, k) => { if (k !== file && !o.loop) { o.pause(); o.currentTime = 0; } });
  a.currentTime = 0; a.play().catch(() => {}); return a;
}
function playAB(row) {
  stopAll();
  const c = row.current[0], v = row.variants[0];
  if (!c) return play(v.file, v.loop);
  const a = getAudio(c.file, false); a.currentTime = 0; a.play().catch(() => {});
  const go = () => { chainTimer = setTimeout(() => play(v.file, v.loop), 350); a.removeEventListener("ended", go); };
  a.addEventListener("ended", go);
}

const secs = [...new Set(DATA.map(r => r.section))];
const nav = $("#nav"), main = $("#main");
secs.forEach((s, i) => { const a = el("a", "", esc(s)); a.href = "#sec" + i; nav.appendChild(a); });
const rowEls = [];
secs.forEach((s, i) => {
  const h = el("h2", "", esc(s)); h.id = "sec" + i; main.appendChild(h);
  DATA.filter(r => r.section === s).forEach(r => main.appendChild(buildRow(r)));
});

function buildRow(r) {
  const row = el("section", "row"); row.tabIndex = 0; row.dataset.group = r.group;
  row._data = r; rowEls.push(row);
  const ev = el("div", "ev", esc(r.event) + (r.loop ? '<span class="tag">loop</span>' : "") + "<small>" + esc(r.group) + "</small>");
  const btns = el("div", "btns");
  if (r.current.length) {
    r.current.forEach((c, i) => {
      const b = el("button", "cur", "&#9654; current" + (r.current.length > 1 ? " " + esc(c.label) : ""));
      b.dataset.file = c.file; b.title = c.label + " - " + c.note; b.onclick = () => play(c.file, r.loop);
      btns.appendChild(b);
    });
  } else { const n = el("span", "", '<span class="tag">no sound today</span>'); btns.appendChild(n); }
  btns.appendChild(el("span", "sp"));
  r.variants.forEach((v, i) => {
    const label = v.variant ? v.variant.toUpperCase() : "new";
    const b = el("button", "new", "&#9654; " + esc(label) + (v.loop ? " &#10227;" : ""));
    b.dataset.file = v.file; b.title = v.id + ": " + v.note; b.onclick = () => play(v.file, v.loop);
    btns.appendChild(b);
  });
  if (!r.loop && r.variants.length > 0) {
    const ab = el("button", "", "A/B"); ab.title = "play current, then the first new one"; ab.onclick = () => playAB(r); btns.appendChild(ab);
  }
  const meta = el("div", "meta");
  r.variants.forEach(v => {
    const src = v.source === "synth" ? "synth (original)" : v.source === "pack" ? "pack" : "pack + synth";
    meta.appendChild(el("div", "", "<b>" + esc(v.id) + "</b> &middot; " + src + (v.packs.length ? " [" + esc(v.packs.join(", ")) + "]" : "") +
      " &middot; " + esc(v.licence) + " &middot; " + v.dur.toFixed(2) + " s, " + v.lufs + " LUFS, peak " + v.peak + " dB<br>" + esc(v.note)));
  });
  r.current.forEach(c => meta.appendChild(el("div", "", "<b>current " + esc(c.label) + "</b> &middot; " + esc(c.note))));
  const pick = el("div", "pick", "<span>Pick:</span>");
  const opts = [];
  if (r.variants.length > 3) opts.push(["new-set", "use the new set"]); else r.variants.forEach(v => opts.push([v.id, v.variant ? v.variant.toUpperCase() : "new"]));
  opts.push(["current", "keep current"], ["skip", "no sound / drop"]);
  opts.forEach(([val, lab]) => {
    const l = el("label"); const i = el("input"); i.type = "radio"; i.name = "p-" + r.group; i.value = val;
    i.checked = picks[r.group] === val;
    i.onchange = () => setPick(r.group, val, row);
    l.appendChild(i); l.appendChild(document.createTextNode(lab)); pick.appendChild(l);
  });
  const clr = el("button", "", "clear"); clr.style.minHeight = "32px"; clr.style.padding = "2px 10px"; clr.onclick = () => setPick(r.group, null, row); pick.appendChild(clr);
  row.append(ev, btns, meta, pick);
  if (picks[r.group]) row.classList.add("picked");
  return row;
}
function setPick(g, val, row) {
  if (val == null) delete picks[g]; else picks[g] = val;
  localStorage.setItem(KEY, JSON.stringify(picks));
  row.classList.toggle("picked", val != null);
  row.querySelectorAll('input[type=radio]').forEach(i => i.checked = (i.value === val));
  $("#npicks").textContent = Object.keys(picks).length;
}
$("#npicks").textContent = Object.keys(picks).length;

function toast(t) { const e = $("#toast"); e.textContent = t; e.style.opacity = 1; setTimeout(() => e.style.opacity = 0, 1800); }
$("#copy").onclick = async () => {
  const out = {}; DATA.forEach(r => { if (picks[r.group]) out[r.group] = picks[r.group]; });
  const txt = JSON.stringify(out, null, 1);
  try { await navigator.clipboard.writeText(txt); }
  catch (e) { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
  toast("Copied " + Object.keys(out).length + " picks");
};
$("#clear").onclick = () => { if (confirm("Forget all picks?")) { picks = {}; localStorage.removeItem(KEY); document.querySelectorAll(".row").forEach(r => { r.classList.remove("picked"); r.querySelectorAll("input[type=radio]").forEach(i => i.checked = false); }); $("#npicks").textContent = 0; } };
$("#stop").onclick = stopAll;
$("#vol").oninput = e => { vol = +e.target.value; $("#volv").textContent = Math.round(vol * 100) + "%"; audios.forEach(a => a.volume = vol); };
$("#q").oninput = e => { const q = e.target.value.toLowerCase(); rowEls.forEach(r => r.classList.toggle("hidden", q && !(r._data.event + " " + r._data.group).toLowerCase().includes(q))); };

function focusedRow() { const a = document.activeElement; return a && a.closest ? a.closest(".row") : null; }
function visibleRows() { return rowEls.filter(r => !r.classList.contains("hidden")); }
addEventListener("keydown", e => {
  if (e.target.matches("input[type=search]")) { if (e.key === "Escape") e.target.blur(); return; }
  if (e.target.matches("input[type=range]") && e.key.startsWith("Arrow")) return;
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); return; }
  if (e.key === "Escape" || (e.key === " " && !e.target.matches("button,input"))) { e.preventDefault(); stopAll(); return; }
  const rows = visibleRows(); let cur = focusedRow(); let idx = rows.indexOf(cur);
  if (["j", "ArrowDown"].includes(e.key) && !e.target.matches("input")) { e.preventDefault(); const n = rows[Math.min(rows.length - 1, idx + 1)]; n && (n.focus(), n.scrollIntoView({ block: "center" })); return; }
  if (["k", "ArrowUp"].includes(e.key) && !e.target.matches("input")) { e.preventDefault(); const n = rows[Math.max(0, idx - 1)]; n && (n.focus(), n.scrollIntoView({ block: "center" })); return; }
  if (!cur) return;
  const r = cur._data;
  if (e.code && e.code.startsWith("Digit")) {
    const d = +e.code.slice(5);
    if (e.shiftKey) { e.preventDefault(); if (d === 0) setPick(r.group, "current", cur); else if (r.variants.length > 3) setPick(r.group, "new-set", cur); else if (r.variants[d - 1]) setPick(r.group, r.variants[d - 1].id, cur); return; }
    e.preventDefault();
    if (d === 0) { const c = r.current[0]; c && play(c.file, r.loop); } else { const v = r.variants[d - 1]; v && play(v.file, v.loop); }
    return;
  }
  if (e.key.toLowerCase() === "x") { setPick(r.group, "skip", cur); return; }
  if (e.key.toLowerCase() === "a" && !e.target.matches("input")) { playAB(r); return; }
});
if (rowEls[0]) rowEls[0].tabIndex = 0;
</script></body></html>
"""

if __name__ == "__main__":
    assemble(sys.argv[1])
