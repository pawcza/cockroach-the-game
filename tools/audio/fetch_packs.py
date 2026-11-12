#!/usr/bin/env python3
"""Download the CC0 packs used by build.py into _packs/<name>/ (gitignored).

Plain anonymous HTTP GETs with a generic user agent. Every pack is recorded in
licenses/<name>.txt (page URL, author, licence line as shown on the page, SHA-256 of the
download) - those small files ARE committed, the audio is not.

Downloads are untrusted data: archives are unpacked with lib/unzip_safe.py (rejects paths that
escape the folder) and nothing inside them is ever executed.
Only packs whose page says CC0 are listed here. Re-run is idempotent.
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
from unzip_safe import safe_extract

UA = "Mozilla/5.0 (X11; Linux x86_64)"
PACKS = os.path.join(HERE, "_packs")
LIC = os.path.join(HERE, "licenses")

KENNEY = ["impact-sounds", "interface-sounds", "ui-audio", "digital-audio", "rpg-audio", "sci-fi-sounds", "casino-audio"]
# (folder name, opengameart slug)
OGA = [
    ("oga-512-retro", "512-sound-effects-8-bit-style"),
    ("oga-100-cc0-sfx", "100-cc0-sfx"),
    ("oga-100-cc0-sfx-2", "100-cc0-sfx-2"),
    ("oga-100-metal-wood", "100-cc0-metal-and-wood-sfx"),
    ("oga-75-breaking-hit", "75-cc0-breaking-falling-hit-sfx"),
    ("oga-80-creature", "80-cc0-creature-sfx"),
    ("oga-50-scifi", "50-cc0-sci-fi-sfx"),
    ("oga-25-bang", "25-cc0-bang-firework-sfx"),
    ("oga-50-retro-synth", "50-cc0-retro-synth-sfx"),
    ("oga-gunshots", "gunshots"),
    ("oga-rpg-sound-pack", "rpg-sound-pack"),
    ("oga-squish", "squish-sounds-effects"),
    ("oga-explosion", "explosion-0"),
    ("oga-dull-explosion", "dull-explosion"),
]

def get(url, out=None, referer=None, jar=None):
    cmd = ["curl", "-sS", "-L", "-m", "120", "-A", UA]
    if referer: cmd += ["-e", referer]
    if jar: cmd += ["-b", jar, "-c", jar]
    if out: cmd += ["-o", out, "-w", "%{http_code}"]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True)
    if out: return r.stdout.decode()
    return r.stdout.decode("utf-8", "ignore")

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

def unpack(path, dest):
    if path.lower().endswith(".zip"):
        safe_extract(path, dest)
    else:
        os.makedirs(dest, exist_ok=True)
        os.replace(path, os.path.join(dest, os.path.basename(path)))

def kenney(slug):
    name = "kenney-" + slug
    dest = os.path.join(PACKS, name)
    page = f"https://kenney.nl/assets/{slug}"
    if os.path.exists(os.path.join(dest, "License.txt")) and os.path.exists(os.path.join(LIC, name + ".txt")): return
    jar = os.path.join(PACKS, "_cookies.txt")
    html = get(page, jar=jar)
    if "CC0 licensed" not in html:
        print("SKIP (no CC0 statement)", slug); return
    hexid = ("assets/" + slug).encode().hex()
    z = os.path.join(PACKS, "_dl", slug + ".zip")
    if not os.path.exists(z):
        j = json.loads(get(f"https://kenney.nl/download-link/{hexid}", referer=page, jar=jar))
        if "url" not in j:
            print("FAILED", slug, j); return
        os.makedirs(os.path.join(PACKS, "_dl"), exist_ok=True)
        get(j["url"], out=z, referer=page)
    if not os.path.exists(os.path.join(dest, "License.txt")): unpack(z, dest)
    os.makedirs(LIC, exist_ok=True)
    lic = open(os.path.join(dest, "License.txt"), errors="ignore").read()
    with open(os.path.join(LIC, name + ".txt"), "w") as f:
        f.write(f"Pack: Kenney {slug}\nPage: {page}\nAuthor: Kenney (kenney.nl)\n"
                f"Licence evidence: page says 'CC0 licensed!'; License.txt in the zip says Creative Commons Zero (CC0), "
                f"http://creativecommons.org/publicdomain/zero/1.0/\nzip sha256: {sha(z)}\n\n--- License.txt ---\n{lic}")
    time.sleep(2)

def oga(name, slug):
    dest = os.path.join(PACKS, name)
    if os.path.isdir(dest) and os.listdir(dest): return
    page = f"https://opengameart.org/content/{slug}"
    h = get(page)
    m = re.search(r"License\(s\):.*?</div>\s*</div>", h, re.S)
    lic_ids = re.findall(r"license_images/([a-z0-9\-]+)\.png", m.group(0)) if m else []
    if lic_ids != ["cc0"]:
        print("SKIP (licence is not CC0 only)", slug, lic_ids); return
    au = re.search(r"field-name-author-submitter.*?class='username'><a[^>]*>([^<]*)</a>", h, re.S)
    author = au.group(1) if au else "unknown"
    files = re.findall(r'href="(https://opengameart.org/sites/default/files/[^"]*)"', h)
    files = [f for f in dict.fromkeys(files) if re.search(r"\.(zip|wav|flac|mp3|ogg)$", f, re.I) and "audio_preview" not in f and "DEMO" not in f and "prev" not in f.lower()]
    os.makedirs(os.path.join(PACKS, "_dl"), exist_ok=True)
    hashes = []
    for u in files:
        fn = urllib.parse.unquote(u.split("/")[-1])
        p = os.path.join(PACKS, "_dl", name + "__" + fn)
        code = get(u, out=p)
        if code != "200": print("FAILED", u, code); continue
        hashes.append((fn, sha(p)))
        unpack(p, dest)
        time.sleep(1)
    os.makedirs(LIC, exist_ok=True)
    with open(os.path.join(LIC, name + ".txt"), "w") as f:
        f.write(f"Pack: {slug}\nPage: {page}\nAuthor: {author} (OpenGameArt user)\n"
                f"Licence evidence: the page's License(s) field lists only 'CC0' "
                f"(http://creativecommons.org/publicdomain/zero/1.0/)\nFiles:\n")
        for fn, hx in hashes: f.write(f"  {fn}  sha256 {hx}\n")

if __name__ == "__main__":
    os.makedirs(PACKS, exist_ok=True)
    for s in KENNEY: kenney(s)
    for n, s in OGA: oga(n, s)
    print("done")
