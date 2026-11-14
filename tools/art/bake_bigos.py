"""Bakes DJ Bigos's atlas, public/boss/bigos.webp + .json (Phaser JSON hash), the way bake_bosses.py bakes Lodzia's:
python3 tools/art/bake_bosses.py bigos (or run this file).

Four kinds of cell share it, frames named bigos-<anim>_<n>: his own (him with his booth, pivot on the floor under
painting x 64, trimmed), the beam's light on that same cell to lay over him (light-top / light-bottom), the speaker's
(pivot on the floor under the cabinet's middle), the shockwave ring's (pivot bottom left) and the beam strip's
(untrimmed so it tiles, pivot on its axis at the left), the record's and its shards' (pivot on its middle). Frame counts, speeds, beat frames and the landmarks the fight
places things by are in src/systems/boss/bigosConfig.ts and are checked against the rig here.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import bigos  # noqa: E402

OUT = Path("public/boss")
CONFIG = Path("src/systems/boss/bigosConfig.ts")
ATLAS_WIDTH = 2048


def _check_config(counts: dict[str, tuple[int, int, bool]], hits: dict[str, int], layout: dict) -> None:
    """The config must say what the rig bakes: every animation's frames, fps and loop, the beat frames, the landmarks."""
    text = CONFIG.read_text()
    problems = []
    for name, (frames, fps, loop) in counts.items():
        match = re.search(rf"'{name}':\s*{{\s*frames:\s*(\d+),\s*fps:\s*(\d+),\s*loop:\s*(true|false)", text)
        want = (frames, fps, "true" if loop else "false")
        got = (int(match[1]), int(match[2]), match[3]) if match else None
        if got != want:
            problems.append(f"{name} is {got}, the rig bakes {want}")
    block = re.search(r"BIGOS_HIT[^{]*{([^}]*)}", text)
    for name, frame in hits.items():
        match = block and re.search(rf"'{name}':\s*(\d+)", block[1])
        if not match or int(match[1]) != frame:
            problems.append(f"beat frame of {name} is {match[1] if match else None}, the rig has {frame}")
    block = re.search(r"BIGOS_LAYOUT[^{]*{([^}]*)}", text)
    for key, value in layout.items():
        match = block and re.search(rf"\b{key}:\s*(-?\d+)", block[1])
        if not match or int(match[1]) != value:
            problems.append(f"{key} is {match[1] if match else None}, the rig has {value}")
    if problems:
        raise SystemExit(f"{CONFIG} disagrees with the rig:\n" + "\n".join(problems))


def _check_hand(rendered) -> None:
    """Where the record he winds up sits: the near wrist in every frame the config lists."""
    text = CONFIG.read_text()
    block = re.search(r"BIGOS_HAND = {(.*?)} as const", text, re.S)
    problems = []
    for anim in ("groove", "point-top", "point-bottom"):
        row = re.search(rf"'{anim}': \[(.*?)\],\n", block[1] + "\n", re.S) if block else None
        got = [(int(x), int(y)) for x, y in re.findall(r"{ x: (-?\d+), y: (-?\d+) }", row[1])] if row else []
        want = [(round(float(d.extra["hands"][0][0]) - 64), round(float(d.extra["hands"][0][1]) - bigos.FLOOR)) for d in rendered[anim]]
        if got != want:
            problems.append(f"BIGOS_HAND {anim} is {got}, the rig has {want}")
    if problems:
        raise SystemExit(f"{CONFIG} disagrees with the rig:\n" + "\n".join(problems))


def _pack(entries) -> Image.Image:
    """entries: (key, cell image, pivot as fractions of the cell, trim). Shelf-packed into bigos.webp + .json."""
    placed, x, y, shelf = [], 0, 0, 0
    for key, cell, pivot, trim in entries:
        box = cell.getchannel("A").point(lambda a: 255 if a > 0 else 0).getbbox() if trim else None
        box = box or (0, 0, *cell.size)
        frame = cell.crop(box)
        if x + frame.width > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf, 0
        placed.append((key, frame, x, y, box, cell.size, pivot, trim))
        x += frame.width + 1
        shelf = max(shelf, frame.height + 1)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + shelf))
    meta = {}
    for key, frame, fx, fy, box, size, pivot, trim in placed:
        atlas.paste(frame, (fx, fy))
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": frame.width, "h": frame.height}, "rotated": False, "trimmed": trim,
            "spriteSourceSize": {"x": box[0], "y": box[1], "w": frame.width, "h": frame.height},
            "sourceSize": {"w": size[0], "h": size[1]},
            "pivot": {"x": round(pivot[0], 4), "y": round(pivot[1], 4)},
        }
    used = atlas.getbbox()
    atlas = atlas.crop((0, 0, ATLAS_WIDTH if used[2] > ATLAS_WIDTH // 2 else used[2], used[3]))
    atlas.save(OUT / "bigos.webp", lossless=True, quality=100, exact=True)
    (OUT / "bigos.json").write_text(json.dumps({"frames": meta, "meta": {"image": "bigos.webp", "scale": "1"}}))
    return atlas


def bake_bigos() -> None:
    rendered = {name: bigos.render_dj(name) for name in bigos.ANIMATIONS}
    problems = [f"{n}[{i}] {f}" for n, fr in rendered.items() for i, d in enumerate(fr) for f in d.failures]
    if problems:
        raise SystemExit("joints fail:\n" + "\n".join(problems))
    box = bigos._box([d.image for fr in rendered.values() for d in fr], bigos.FLOOR + bigos.OY)
    layout = bigos.layout(box)
    counts = {name: (len(rendered[name]), fps, loop) for name, (_, fps, loop, _) in bigos.ANIMATIONS.items()}
    hits = {name: hit for name, (_, _, loop, hit) in bigos.ANIMATIONS.items() if hit is not None and not loop}
    speakers = {name: [bigos.draw_speaker(p) for p in make()] for name, (make, _, _) in bigos.SPEAKER_ANIMS.items()}
    counts.update({name: (len(speakers[name]), fps, loop) for name, (_, fps, loop) in bigos.SPEAKER_ANIMS.items()})
    hits.update(bigos.SPEAKER_HIT)
    lights = {lane: [bigos.beam_overlay(d, box) for d in rendered[f"beam-{lane}-loop"]] for lane in ("top", "bottom")}
    counts.update({f"light-{lane}": (len(frames), bigos.ANIMATIONS[f"beam-{lane}-loop"][1], True)
                   for lane, frames in lights.items()})
    rings = [bigos.shockwave(k) for k in range(5)]
    rings_back = [bigos.ring_back(k) for k in range(5)]
    fronts = [bigos.front_cap(k) for k in range(4)]
    strips = [bigos.beam_strip(k) for k in range(4)]
    records = [bigos.record(k) for k in range(4)]
    shards = [bigos.record(0, k) for k in range(1, 5)]
    counts["ring"] = (len(rings), 12, True)
    counts["ring-back"] = (len(rings_back), 12, True)
    counts["front"] = (len(fronts), 8, True)
    counts["strip"] = (len(strips), 8, True)
    counts["record"] = (len(records), 16, True)
    counts["record-shatter"] = (len(shards), 16, False)
    _check_config(counts, hits, layout)
    _check_hand(rendered)

    cell_w, cell_h = box[2] - box[0], box[3] - box[1]
    dj_pivot = ((64 + bigos.OX - box[0]) / cell_w, (bigos.FLOOR + bigos.OY - box[1]) / cell_h)
    spk_pivot = ((bigos.SOX + bigos.SPK_W / 2) / bigos.SW, bigos.SPK_FLOOR / bigos.SH)
    entries = []
    for name, drawn in rendered.items():
        entries += [(f"bigos-{name}_{i}", d.image.crop(box), dj_pivot, True) for i, d in enumerate(drawn)]
    for lane, frames in lights.items():
        entries += [(f"bigos-light-{lane}_{i}", img, dj_pivot, True) for i, img in enumerate(frames)]
    for name, frames in speakers.items():
        entries += [(f"bigos-{name}_{i}", img, spk_pivot, True) for i, img in enumerate(frames)]
    entries += [(f"bigos-ring_{i}", img, (0, 1), True) for i, img in enumerate(rings)]
    entries += [(f"bigos-ring-back_{i}", img, (0, 1), True) for i, img in enumerate(rings_back)]
    front_pivot = ((bigos.FRONT_AHEAD) / (bigos.FRONT_AHEAD + bigos.FRONT_W), .5)
    entries += [(f"bigos-front_{i}", img, front_pivot, False) for i, img in enumerate(fronts)]
    # The ball's damage, two stages, over every frame it is fought through: bigos-ball<stage>-<anim>_<n> on his cell
    for stage in bigos.BALL_DAMAGE:
        for name in bigos.BALL_DAMAGE_ANIMS:
            for i, img in enumerate(bigos.ball_damage(name, stage, rendered[name])):
                entries.append((f"bigos-ball{stage}-{name}_{i}", img.crop(box), dj_pivot, True))
    entries += [(f"bigos-strip_{i}", img, (0, .5), False) for i, img in enumerate(strips)]
    entries += [(f"bigos-record_{i}", img, (.5, .5), True) for i, img in enumerate(records)]
    # the shards' canvas is the record's, 8 px wider each side and 4 over / 8 under: pivot on the record's middle
    shard_pivot = (((bigos.REC_W - 1) / 2 + 8 + .5) / (bigos.REC_W + 16), ((bigos.REC_H - 1) / 2 + 4 + .5) / (bigos.REC_H + 12))
    entries += [(f"bigos-record-shatter_{i}", img, shard_pivot, True) for i, img in enumerate(shards)]
    atlas = _pack(entries)
    print(f"bigos: {len(entries)} frames, DJ cell {cell_w}x{cell_h}, pivot {dj_pivot[0]:.4f},{dj_pivot[1]:.4f}, "
          f"atlas {atlas.size}, {(OUT / 'bigos.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    bake_bigos()
