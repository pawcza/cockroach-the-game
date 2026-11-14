"""Bakes the Eksterminator's atlas, public/boss/eksterminator.webp + .json (Phaser JSON hash), the way bake_bosses.py
bakes Lodzia's: python3 tools/art/bake_bosses.py eksterminator (or run this file).

His frames are native pixels named eksterminator-<anim>_<n>, trimmed, all on one source cell with one pivot: the floor
under the middle of his feet. His own sprites ride in the same atlas, untrimmed, each with the pivot the fight places
it by: the stream's tile (right edge, middle row), the burst at the nozzle (right edge, middle row), the pour onto the
bottom lane (the nozzle's mouth), the splash (where the stream comes in), the canister (its middle) and the cloud (its
bottom middle). The animation table and the points the fight aims by (the nozzle in each spray, where the canister
leaves his hand, his tank) are in src/systems/boss/eksterminatorConfig.ts and are checked against the rig here.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import eksterminator as ek  # noqa: E402

OUT = Path("public/boss")
CONFIG = Path("src/systems/boss/eksterminatorConfig.ts")
ATLAS_WIDTH = 2048
BODY_X = 78                  # his middle, painting px: the pivot's x (the spin's axis too)


def _from_pivot(canvas_xy) -> tuple[int, int]:
    """Canvas px to native px from his pivot."""
    return round(float(canvas_xy[0]) - ek.OX - BODY_X), round(float(canvas_xy[1]) - ek.OY - ek.FLOOR)


def points(rendered) -> dict[str, tuple[int, int]]:
    """What the fight aims by, native px from his pivot."""
    rest = ek.draw(ek.REST)
    f = ek.Frame(ek.REST)
    tank = ek.CANVAS.point(f.g, ek._apply(f.tank_m, ek.TANK_C))
    return {
        "nozzleTop": _from_pivot(rendered["spray-top"][0].tip),
        "nozzleBottom": _from_pivot(rendered["spray-bottom"][0].tip),
        "release": _from_pivot(rendered["lob"][2].hand),
        "cocked": _from_pivot(rendered["lob"][1].hand),
        "whip": _from_pivot(rendered["lob"][2].hand),
        "tank": _from_pivot(tank),
        "rest": _from_pivot(rest.tip),
    }


def _check_config(rendered, pts, drop) -> None:
    """The game's tables must match what was baked: frame counts, fps, loops and the aiming points."""
    text = CONFIG.read_text()
    for name, drawn in rendered.items():
        _, fps, loop = ek.ANIMATIONS[name]
        match = re.search(rf"'{name}':\s*{{\s*frames:\s*(\d+),\s*fps:\s*(\d+),\s*loop:\s*(true|false)", text)
        if not match:
            raise SystemExit(f"{CONFIG} has no entry for {name}")
        want = (len(drawn), fps, "true" if loop else "false")
        got = (int(match[1]), int(match[2]), match[3])
        if want != got:
            raise SystemExit(f"{CONFIG}: {name} is {got}, the rig bakes {want}")
    for key, want in pts.items():
        match = re.search(rf"\b{key}:\s*{{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)", text)
        got = (int(match[1]), int(match[2])) if match else None
        if got != want:
            raise SystemExit(f"{CONFIG}: {key} is {got}, the rig has {want}")
    for key, want in (("DIVE_DROP", drop), ("BOTTOM_STREAM_Y", ek.JET_Y["bottom"] - ek.FLOOR)):
        match = re.search(rf"{key}\s*=\s*(-?\d+)", text)
        if not match or int(match[1]) != want:
            raise SystemExit(f"{CONFIG}: {key} is {match[1] if match else None}, the rig has {want}")


def sprites() -> dict[str, tuple[list, tuple[float, float]]]:
    """His own sprites, frame images and pivot (fractions of the frame)."""
    drop = ek.dive_drop()
    out = {}
    for name, (make, count, _) in ek.SPRITES.items():
        frames = [make(k, drop) if name == "jet-dive" else make(k) for k in range(count)]
        h, w = frames[0].shape[:2]
        pivot = {
            "jet": (1.0, (ek.JET_C + .5) / h),
            "jet-burst": (1.0, (ek.JET_C + .5) / h),
            "jet-dive": (1.0, 3.5 / h),
            "jet-splash": ((w - 4) / w, (ek.SPLASH_C + .5) / h),
            "canister": (.5, .5),
            "cloud": (.5, 1.0),
            "mine": (.5, 1.0),
            "grenade": (.5, .5),
            "chain": (ek.CHAIN_C[0] / ek.CHAIN_W, ek.CHAIN_C[1] / ek.CHAIN_H),
        }[name]
        out[name] = (frames, pivot)
    return out


def bake_eksterminator() -> None:
    rendered = {name: ek.render(name) for name in ek.ANIMATIONS}
    problems = [f"{n}[{i}] {f}" for n, fr in rendered.items() for i, d in enumerate(fr) for f in d.failures]
    if problems:
        raise SystemExit("joints fail:\n" + "\n".join(problems))
    ek.DIVE_DROP = drop = ek.dive_drop()
    pts = points(rendered)
    _check_config(rendered, pts, drop)
    box = ek.br.crop_box([d.image for fr in rendered.values() for d in fr], ek.FLOOR + ek.OY)
    cell_w, cell_h = box[2] - box[0], box[3] - box[1]
    pivot = ((BODY_X + ek.OX - box[0]) / cell_w, (ek.FLOOR + ek.OY - box[1]) / cell_h)

    items = []          # (key, cell image, trim box or None, source size, pivot)
    for name, drawn in rendered.items():
        for i, d in enumerate(drawn):
            cell = d.image.crop(box)
            trim = cell.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
            items.append((f"eksterminator-{name}_{i}", cell, trim, (cell_w, cell_h), pivot))
    for name, (frames, piv) in sprites().items():
        for i, arr in enumerate(frames):
            img = Image.fromarray(arr)
            items.append((f"eksterminator-{name}_{i}", img, None, img.size, piv))

    placed, x, y, shelf = [], 0, 0, 0
    for key, img, trim, size, piv in items:
        frame = img.crop(trim) if trim else img
        if x + frame.width > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf, 0
        placed.append((key, frame, x, y, trim or (0, 0, *img.size), size, piv))
        x += frame.width + 1
        shelf = max(shelf, frame.height + 1)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + shelf))
    meta = {}
    for key, frame, fx, fy, trim, size, piv in placed:
        atlas.paste(frame, (fx, fy))
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": frame.width, "h": frame.height}, "rotated": False,
            "trimmed": (frame.width, frame.height) != size,
            "spriteSourceSize": {"x": trim[0], "y": trim[1], "w": frame.width, "h": frame.height},
            "sourceSize": {"w": size[0], "h": size[1]},
            "pivot": {"x": round(piv[0], 4), "y": round(piv[1], 4)},
        }
    used = atlas.getbbox()
    atlas = atlas.crop((0, 0, ATLAS_WIDTH if used[2] > ATLAS_WIDTH // 2 else used[2], used[3]))
    atlas.save(OUT / "eksterminator.webp", lossless=True, quality=100, exact=True)
    (OUT / "eksterminator.json").write_text(
        json.dumps({"frames": meta, "meta": {"image": "eksterminator.webp", "scale": "1"}}))
    reach = {name: (min(d.image.getbbox()[0] for d in drawn) - ek.OX - BODY_X,
                    max(d.image.getbbox()[2] for d in drawn) - ek.OX - BODY_X) for name, drawn in rendered.items()}
    print("left and right of his middle, native px:", reach)
    print("points:", pts, "dive drop", drop)
    print(f"eksterminator: {len(placed)} frames, cell {cell_w}x{cell_h}, pivot {pivot[0]:.4f},{pivot[1]:.4f}, "
          f"atlas {atlas.size}, {(OUT / 'eksterminator.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    bake_eksterminator()
