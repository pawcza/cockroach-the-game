"""Bakes each boss's frames into its own atlas, public/boss/<boss>.webp + <boss>.json (Phaser JSON hash), so they load
with the other boss assets after boot instead of growing the main atlas.

Run from the repo root after changing a boss rig: python3 tools/art/bake_bosses.py
Frames are native pixels, named <boss>-<anim>_<n>, trimmed, every frame of a boss on one source cell with one pivot.
Lodzia's pivot is on the floor under the middle of her body. Where her slipper lands in each slam (native px from the
pivot), the animations' frame counts and their speeds are in src/systems/boss/lodziaConfig.ts and are checked against
the rig here.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import lodzia  # noqa: E402

OUT = Path("public/boss")
CONFIG = Path("src/systems/boss/lodziaConfig.ts")
ATLAS_WIDTH = 2048
# Her middle, in painting px: the pivot's x
BODY_X = 64
IMPACT_FRAME = 1


def _check_config(frames: dict[str, list]) -> None:
    """The game's animation table must match what was baked: frame counts and fps."""
    text = CONFIG.read_text()
    for name, drawn in frames.items():
        _, fps, loop = lodzia.ANIMATIONS[name]
        match = re.search(rf"'{name}':\s*{{\s*frames:\s*(\d+),\s*fps:\s*(\d+),\s*loop:\s*(true|false)", text)
        if not match:
            raise SystemExit(f"{CONFIG} has no entry for {name}")
        want = (len(drawn), fps, "true" if loop else "false")
        got = (int(match[1]), int(match[2]), match[3])
        if want != got:
            raise SystemExit(f"{CONFIG}: {name} is {got}, the rig bakes {want}")


def _landing(drawn) -> tuple[int, int]:
    """Where the slipper lands at the slam's impact frame: the middle of its lowest row, native px from the pivot."""
    import numpy as np
    ys, xs = np.nonzero(drawn[IMPACT_FRAME].masks["slipper"])
    low = ys.max()
    x = xs[ys >= low - 1].mean() - lodzia.OX - BODY_X
    return round(float(x)), int(low + 1 - lodzia.OY - lodzia.FLOOR)


def _check_landing(rendered) -> None:
    text = CONFIG.read_text()
    for lane in ("top", "bottom"):
        want = _landing(rendered[f"slam-{lane}"])
        match = re.search(rf"{lane}:\s*{{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)", text)
        got = (int(match[1]), int(match[2])) if match else None
        if got != want:
            raise SystemExit(f"{CONFIG}: the {lane} slam lands at {got}, the rig at {want}")


def _check_release(rendered) -> None:
    """Where what she throws leaves her: the far wrist on a throw's release frame, the near fist on the tantrum's."""
    text = CONFIG.read_text()
    for anim, frame, point in (("throw-top", lodzia.THROW_RELEASE, "wrist"), ("throw-bottom", lodzia.THROW_RELEASE, "wrist"),
                               ("boomerang", lodzia.BOOMERANG_RELEASE, "wrist"),
                               ("tantrum", lodzia.TANTRUM_RELEASES[0], "fist")):
        x, y = rendered[anim][frame].points[point]
        want = (round(x - BODY_X), round(y - lodzia.FLOOR))
        match = re.search(rf"'{anim}':\s*{{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)", text)
        got = (int(match[1]), int(match[2])) if match else None
        if got != want:
            raise SystemExit(f"{CONFIG}: {anim} lets go at {got}, the rig at {want}")


def _check_held(rendered) -> None:
    """Where the glint of each wind-up sits: the slipper's middle (the near fist for the tantrum) in every frame up to the
    last one the table lists."""
    import numpy as np
    text = CONFIG.read_text()
    block = re.search(r"LODZIA_HELD = {(.*?)} as const", text, re.S)
    for anim in ("throw-top", "throw-bottom", "boomerang", "tantrum"):
        row = re.search(rf"'{anim}': \[(.*?)\],\n", block[1] + "\n", re.S) if block else None
        listed = re.findall(r"null|{ x: (-?\d+), y: (-?\d+) }", row[1]) if row else []
        got = [(int(x), int(y)) if x else None for x, y in listed]
        want = []
        for d in rendered[anim][:len(got)]:
            if anim == "tantrum":
                x, y = d.points["fist"]
                want.append((round(x - BODY_X), round(y - lodzia.FLOOR)))
                continue
            mask = d.masks.get("slipper")
            if mask is None or not mask.any():
                mask = d.masks.get("free")
            if mask is None or not mask.any():
                want.append(None)
                continue
            ys, xs = np.nonzero(mask)
            want.append((round(float(xs.mean()) + .5 - lodzia.OX - BODY_X), round(float(ys.mean()) + .5 - lodzia.OY - lodzia.FLOOR)))
        if got != want:
            raise SystemExit(f"{CONFIG}: LODZIA_HELD {anim} is {got}, the rig has {want}")


def bake_lodzia() -> None:
    rendered = {name: lodzia.render(name) for name in lodzia.ANIMATIONS}
    problems = [f"{n}[{i}] {f}" for n, fr in rendered.items() for i, d in enumerate(fr) for f in d.failures]
    if problems:
        raise SystemExit("joints fail:\n" + "\n".join(problems))
    _check_config(rendered)
    _check_landing(rendered)
    _check_release(rendered)
    _check_held(rendered)
    box = lodzia._crop_box([d for fr in rendered.values() for d in fr])
    cell_w, cell_h = box[2] - box[0], box[3] - box[1]
    pivot = ((BODY_X + lodzia.OX - box[0]) / cell_w, (lodzia.FLOOR + lodzia.OY - box[1]) / cell_h)

    placed, x, y, shelf = [], 0, 0, 0
    for name, drawn in rendered.items():
        for i, d in enumerate(drawn):
            cell = d.image.crop(box)
            alpha = cell.getchannel("A").point(lambda a: 255 if a > 128 else 0)
            trim = alpha.getbbox()
            frame = cell.crop(trim)
            if x + frame.width > ATLAS_WIDTH:
                x, y, shelf = 0, y + shelf, 0
            placed.append((f"lodzia-{name}_{i}", frame, x, y, trim, (cell_w, cell_h), pivot))
            x += frame.width + 1
            shelf = max(shelf, frame.height + 1)
    # What she throws: each on its own square cell, its middle the pivot
    for name, frames in lodzia.projectiles().items():
        for i, cell in enumerate(frames):
            trim = cell.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
            frame = cell.crop(trim)
            if x + frame.width > ATLAS_WIDTH:
                x, y, shelf = 0, y + shelf, 0
            placed.append((f"lodzia-{name}_{i}", frame, x, y, trim, cell.size, (.5, .5)))
            x += frame.width + 1
            shelf = max(shelf, frame.height + 1)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + shelf))
    meta = {}
    for key, frame, fx, fy, trim, (src_w, src_h), (px, py) in placed:
        atlas.paste(frame, (fx, fy))
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": frame.width, "h": frame.height}, "rotated": False, "trimmed": True,
            "spriteSourceSize": {"x": trim[0], "y": trim[1], "w": frame.width, "h": frame.height},
            "sourceSize": {"w": src_w, "h": src_h},
            "pivot": {"x": round(px, 4), "y": round(py, 4)},
        }
    used = atlas.getbbox()
    atlas = atlas.crop((0, 0, ATLAS_WIDTH if used[2] > ATLAS_WIDTH // 2 else used[2], used[3]))
    atlas.save(OUT / "lodzia.webp", lossless=True, quality=100, exact=True)
    (OUT / "lodzia.json").write_text(json.dumps({"frames": meta, "meta": {"image": "lodzia.webp", "scale": "1"}}))
    reach = {name: max(d.image.getbbox()[2] for d in drawn) - lodzia.OX - BODY_X for name, drawn in rendered.items()}
    print("right of her middle, native px:", reach)
    print(f"lodzia: {len(placed)} frames, cell {cell_w}x{cell_h}, pivot {pivot[0]:.4f},{pivot[1]:.4f}, "
          f"atlas {atlas.size}, {(OUT / 'lodzia.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    if "bigos" in sys.argv[1:]:
        from bake_bigos import bake_bigos  # his own script: python3 tools/art/bake_bosses.py bigos
        bake_bigos()
        sys.exit()
    if "zlewiatan" in sys.argv[1:]:
        from bake_zlewiatan import bake_zlewiatan  # its own script: python3 tools/art/bake_bosses.py zlewiatan
        bake_zlewiatan()
        sys.exit()
    if "eksterminator" in sys.argv[1:]:
        from bake_eksterminator import bake_eksterminator  # his own script: python3 tools/art/bake_bosses.py eksterminator
        bake_eksterminator()
        sys.exit()
    bake_lodzia()
