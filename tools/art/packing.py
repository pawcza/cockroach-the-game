"""Packing frames into atlas sheets, and writing a bake's outputs so a failed bake never leaves them half-written.

Kept apart from bake.py (no rigs imported) so tests/bake-packing can drive it with a few made-up frames.
"""
import io
import json
import os
import shutil
from pathlib import Path

from PIL import Image

Frame = tuple[str, Image.Image, object]  # frame name (<anim>_<n>), image, pivot y or (x, y)


class TooBig(ValueError):
    """One animation alone is larger than a sheet may be."""


def _anim(key: str) -> str:
    return key.rsplit("_", 1)[0]


def _place(frames: list[Frame], cap: int, state: tuple[int, int, int, int]) -> tuple[list, tuple[int, int, int, int]]:
    """Rows left to right, `cap` wide, carrying on from `state` (x, y, shelf, width)."""
    x, y, shelf, width = state
    placed = []
    for key, frame, pivot in frames:
        if x + frame.width > cap:
            x, y, shelf = 0, y + shelf, 0
        placed.append((key, frame, x, y, pivot))
        x += frame.width
        width = max(width, x)
        shelf = max(shelf, frame.height)
    return placed, (x, y, shelf, width)


def split_sheets(frames: list[Frame], cap: int) -> list[list]:
    """The frames on as few sheets of at most `cap` px a side as rows allow, in order. An animation's frames never
    straddle two sheets (a sprite plays its animation within one texture). One sheet lays them exactly as a single atlas
    always did."""
    groups: dict[str, list[Frame]] = {}
    for frame in frames:
        groups.setdefault(_anim(frame[0]), []).append(frame)
    sheets: list[list] = []
    current: list = []
    state = (0, 0, 0, 0)
    for anim, group in groups.items():
        placed, after = _place(group, cap, state)
        if after[1] + after[2] > cap:
            if not current:
                raise TooBig(f"{anim} alone is past {cap} px")
            sheets.append(current)
            placed, after = _place(group, cap, (0, 0, 0, 0))
            if after[1] + after[2] > cap:
                raise TooBig(f"{anim} alone is past {cap} px")
            current = []
        current.extend(placed)
        state = after
    if current:
        sheets.append(current)
    return sheets


def render(placed: list) -> tuple[bytes, dict, tuple[int, int]]:
    """A sheet's lossless webp and its Phaser JSON hash frames."""
    width = max(fx + frame.width for _, frame, fx, _, _ in placed)
    height = max(fy + frame.height for _, frame, _, fy, _ in placed)
    atlas = Image.new("RGBA", (width, height))
    meta = {}
    for key, frame, fx, fy, pivot in placed:
        atlas.paste(frame, (fx, fy))
        w, h = frame.size
        px, py = pivot if isinstance(pivot, tuple) else (.5, pivot)
        meta[key] = {
            "frame": {"x": fx, "y": fy, "w": w, "h": h}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h},
            "pivot": {"x": round(px, 4), "y": round(py, 4)},
        }
    buffer = io.BytesIO()
    atlas.save(buffer, format="WEBP", lossless=True, quality=100, exact=True)
    return buffer.getvalue(), meta, atlas.size


def atlas_files(path: str, placed: list) -> dict[str, bytes]:
    image, meta, _ = render(placed)
    name = Path(path).name
    return {f"{path}.webp": image,
            f"{path}.json": json.dumps({"frames": meta, "meta": {"image": f"{name}.webp", "scale": "1"}}).encode()}


def publish(out: Path, files: dict[str, bytes], owned: list[str]) -> None:
    """Writes every file of a finished bake into `out`: all of them into a temporary folder first, then each moved into
    place, then files in the `owned` folders that this bake no longer makes are removed (a skin sheet whose skins are
    gone). Nothing in `out` changes until every file has been written."""
    out.mkdir(parents=True, exist_ok=True)
    tmp = out / ".bake-tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        for rel, data in files.items():
            target = tmp / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        for rel in files:
            (out / rel).parent.mkdir(parents=True, exist_ok=True)
            os.replace(tmp / rel, out / rel)
        for folder in owned:
            for old in (out / folder).glob("*") if (out / folder).exists() else []:
                if old.is_file() and f"{folder}/{old.name}" not in files:
                    old.unlink()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
