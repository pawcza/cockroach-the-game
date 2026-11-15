"""Every frame of the baked atlases (public/assets/packs.json) as its RGBA pixels' sha1, for tests/packs.test.ts."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public/assets")
packs = json.loads((root / "packs.json").read_text())
paths = [packs["core"], *packs["enemies"].values(), *[p for sheets in packs["skins"].values() for p in sheets], *packs["roach"].values()]
out: dict[str, list[str]] = {}
for path in paths:
    image = np.asarray(Image.open(root / f"{path}.webp").convert("RGBA"))
    for name, meta in json.loads((root / f"{path}.json").read_text())["frames"].items():
        f = meta["frame"]
        pixels = np.ascontiguousarray(image[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]])
        out.setdefault(name, []).append(hashlib.sha1(pixels.tobytes()).hexdigest()[:16])
print(json.dumps(out))
