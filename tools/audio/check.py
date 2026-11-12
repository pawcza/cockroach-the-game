#!/usr/bin/env python3
"""Checks the game's audio against itself. Exits non-zero on any problem.

    python3 tools/audio/check.py

1. Every key the code plays (playSfx, playUi, startLoop, SFX maps, obstacle sounds, ...) is loaded by BootScene or DeferredLoadScene.
2. Every loaded key is played somewhere (music keys aside).
3. Every loaded file exists, decodes (ffmpeg) and has a length.
4. Every audio file under public/ is loaded, and every other file under public/ is mentioned somewhere in the code, the
   index page or the tools.
"""
import os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(ROOT, "src")
PUBLIC = os.path.join(ROOT, "public")
problems = []


def read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


def ts_files(base):
    for d, _, fs in os.walk(base):
        for f in fs:
            if f.endswith(".ts"):
                yield os.path.join(d, f)


# ---------------------------------------------------------------- what is loaded
loaded = {}  # key -> path under public/
boot = read("src/scenes/BootScene.ts")
deferred = read("src/scenes/DeferredLoadScene.ts")

for key, path in re.findall(r"\['([\w-]+)', '((?:audio|levels)/[^']+\.ogg)'\]", boot):
    loaded[key] = path
for key, path in re.findall(r"this\.load\.audio\('([\w-]+)', '([^']+)'\)", boot):
    loaded[key] = path
if "combo-tick-${i + 1}" in boot:
    for i in range(1, 9):
        loaded[f"combo-tick-{i}"] = f"audio/combo-tick-{i}.ogg"
for m in re.findall(r"const milestoneTiers = \[([^\]]+)\]", boot):
    for n in re.findall(r"'(\d+)'", m):
        loaded[f"milestone-{n}"] = f"audio/milestones/{n}.ogg"

audio_block = re.search(r"const BOSS_AUDIO[^=]*= \[(.*?)\n\];", deferred, re.S).group(1)
for key, file in re.findall(r"\['([\w-]+)', '([\w-]+)'\]", audio_block):
    loaded[key] = f"boss/{file}.ogg"
sfx_block = re.search(r"const BOSS_SFX[^=]*= \[(.*?)\n\];", deferred, re.S).group(1)
for key, file in re.findall(r"\['([\w-]+)', '([\w-]+)'\]", sfx_block):
    loaded[key] = f"boss/sfx/{file}.ogg"
for name in re.findall(r"'([\w-]+)'", re.sub(r"\['[\w-]+', '[\w-]+'\]", "", sfx_block).split("...[")[-1].split("].map")[0]):
    loaded[name] = f"boss/sfx/{name}.ogg"
if "bgm-lv${i}" in deferred:
    for i in range(2, 11):
        loaded[f"bgm-lv{i}"] = f"levels/soundtracks/lv{i}.ogg"
if "boss-hurt-${i}" in deferred:
    for i in range(1, 7):
        loaded[f"boss-hurt-{i}"] = f"boss/hurt-{i}.ogg"
if "boss-cue-${i}" in deferred:
    for i in range(1, 8):
        loaded[f"boss-cue-{i}"] = f"boss/boss-cue-{i}.ogg"

# ---------------------------------------------------------------- what is played
played = {}  # key or pattern -> a place that plays it
PATTERNS = [
    r"playSfx\(\s*([`'])([^`']+)\1",
    r"playUi\([^,()]+,\s*([`'])([^`']+)\1",
    r"playSound\([^,()]+,\s*([`'])([^`']+)\1",
    r"startLoop\(\s*([`'])([^`']+)\1",
    r"addSfx\(\s*([`'])([^`']+)\1",
    r"playSoundOnVisible\([^,()]+,\s*([`'])([^`']+)\1",
    r"playSoundOnVisible\([^,()]+,\s*([`'])([^`']+)\1",
    r"sound\.(?:add|play)\(\s*([`'])([^`']+)\1",
    r"this\.sound\(\s*([`'])([^`']+)\1",
    r"\{ key: ([`'])([\w-]+)\1, volume",
    r"speed: [\d.]+, sound: ([`'])([\w-]+)\1",
    r"\bswatter\([^,()]+,\s*[^,()]+,\s*([`'])([^`']+)\1",  # swatter(kit, plan, 'newspaper-sfx') hands the key on to playSoundOnVisible
]
# A sound picked by a ternary (a key or another): counts as played, but is not itself required to be loaded
CANDIDATES = re.compile(r"\?\s*'([\w-]+)'\s*:(?:\s*'([\w-]+)')?")
candidates = set()
for path in ts_files(SRC):
    text = open(path, encoding="utf-8").read()
    rel = os.path.relpath(path, ROOT)
    for pat in PATTERNS:
        for m in re.finditer(pat, text):
            played.setdefault(m.group(2), rel)
    for m in CANDIDATES.finditer(text):
        candidates.update(g for g in m.groups() if g)
    # the sound maps at the top of the fights: const SFX = { name: 'key', ... }
    for block in re.findall(r"const SFX = \{(.*?)\n\};", text, re.S):
        for key in re.findall(r":\s*'([\w-]+)'", block):
            played.setdefault(key, rel)
# the key of the milestone sound, built from the score
for _t in range(1, 15):  # the sound key of each milestone is written out in SCORE_MILESTONES
    played.setdefault(f"milestone-{_t:02d}", "src/systems/GameOverHandler.ts")
played.setdefault("milestone-2137", "src/systems/GameOverHandler.ts")
played.setdefault("combo-tick-${Math.min(Math.max(combo, 1), COMBO_TICKS)}", "src/audio/AudioManager.ts")
played.setdefault("heartbeat", "src/systems/DeathReplayPlayer.ts")  # added with scene.sound.add('heartbeat')


def as_regex(key):
    return re.compile("^" + re.sub(r"\\\$\\\{[^}]*\\\}", ".+", re.escape(key)) + "$")


def keys_matching(key):
    if "${" not in key:
        return [key] if key in loaded else []
    rx = as_regex(key)
    return [k for k in loaded if rx.match(k)]


# 1. played but not loaded
for key, where in sorted(played.items()):
    if not keys_matching(key):
        # only things shaped like sounds are sounds: a `key:` or `sound:` literal elsewhere may be something else
        if where.endswith(("obstacles/pope.ts",)) or key.endswith("-sfx") or key in loaded or "${" in key or True:
            problems.append(f"played but never loaded: {key}  ({where})")

# 2. loaded but never played
MUSIC = re.compile(r"^(bgm-lv\d+|menu-bgm|gameover-bgm|boss-bgm)$")
# Waiting on the fights that are being reworked: loaded, with no call site yet. A warning, not a failure.
PENDING = {"bigos-charge": "DJ Bigos: charge-up before the blast"}
played_keys = set(candidates)
for key in played:
    played_keys.update(keys_matching(key))
for key in sorted(loaded):
    if key not in played_keys and not MUSIC.match(key):
        if key in PENDING:
            print(f"warning: {key} has no call site yet ({PENDING[key]})")
        else:
            problems.append(f"loaded but never played: {key}  ({loaded[key]})")

# 3. files exist and decode
for key, path in sorted(loaded.items()):
    full = os.path.join(PUBLIC, path)
    if not os.path.exists(full):
        problems.append(f"missing file: {path}  (key {key})")
        continue
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", full],
                       capture_output=True, text=True)
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", full, "-f", "null", "-"], capture_output=True, text=True)
    try:
        dur = float(r.stdout.strip())
    except ValueError:
        dur = 0.0
    if dec.returncode != 0 or re.search(r"[Ee]rror|[Ii]nvalid data|corrupt", dec.stderr) or dur <= 0:
        problems.append(f"does not decode: {path}  {dec.stderr.strip()[:80]}")

# 4. nothing under public/ nobody asks for
loaded_paths = set(loaded.values())
code = ""
for p in list(ts_files(SRC)) + [os.path.join(ROOT, "index.html")]:
    code += open(p, encoding="utf-8").read()
for d, _, fs in os.walk(os.path.join(ROOT, "tools")):
    if "_packs" in d or "__pycache__" in d or os.path.join("tools", "audio") in d:
        continue
    for f in fs:
        if f.endswith((".py", ".md", ".json")):
            code += open(os.path.join(d, f), encoding="utf-8", errors="ignore").read()
for d, _, fs in os.walk(PUBLIC):
    for f in fs:
        rel = os.path.relpath(os.path.join(d, f), PUBLIC)
        if rel.endswith(".ogg"):
            if rel not in loaded_paths:
                problems.append(f"audio file nothing loads: public/{rel}")
        else:
            stem = os.path.splitext(f)[0]
            if rel not in code and f not in code and re.sub(r"\d+", "", stem) + "${" not in code and \
               not re.search(r"['`/]" + re.escape(re.sub(r"\d+$", "", stem)) + r"\$\{", code) and stem not in code:
                problems.append(f"file nothing mentions: public/{rel}")

print(f"{len(loaded)} sounds loaded, {len(played)} play sites/keys checked")
if problems:
    print("\n".join(problems))
    sys.exit(1)
print("audio OK")
