"""Drives tools/art/packing.py with made-up frames under a tiny size cap, for tests/packs.test.ts: prints what it saw."""
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "art"))
import packing  # noqa: E402

frames = [(f"{anim}_{i}", Image.new("RGBA", (20, 20), (i * 40, 0, 0, 255)), .8) for anim in ("a", "b", "c") for i in range(3)]
sheets = packing.split_sheets(frames, 50)
report = {
    "sheets": [[key for key, *_ in sheet] for sheet in sheets],
    "single": [[key, x, y] for key, _, x, y, _ in packing.split_sheets(frames, 4096)[0]],
}
try:
    packing.split_sheets([("huge_0", Image.new("RGBA", (100, 100)), .5)], 64)
    report["tooBig"] = False
except packing.TooBig:
    report["tooBig"] = True

with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp)
    (out / "skins").mkdir()
    (out / "skins" / "lv2.webp").write_bytes(b"old")
    (out / "keep.json").write_bytes(b"old")
    # A bake failing while its files are written (here, one that isn't bytes) leaves `out` as it was
    try:
        packing.publish(out, {**packing.atlas_files("skins/lv3", sheets[0]), "skins/lv3-2.webp": None}, owned=["skins"])
    except Exception:
        pass
    report["untouched"] = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file())
    # A finished one replaces the old files and drops the skin sheets it no longer makes
    files = {}
    for i, sheet in enumerate(sheets):
        files.update(packing.atlas_files("skins/lv3" if i == 0 else f"skins/lv3-{i + 1}", sheet))
    packing.publish(out, files, owned=["skins"])
    report["published"] = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file())
print(json.dumps(report))
