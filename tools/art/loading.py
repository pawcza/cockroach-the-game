"""The art for the HTML loading screen in index.html, inlined as data URIs so the first paint already has it.

Reads the level 1 plates, the roach's run strip and the four boss portraits; writes small versions between the
`loading-art` markers in the <style> of index.html. Run again whenever bake.py rewrites roach-run.png, the level 1
plates change or a boss gets a new portrait:  python3 tools/art/loading.py   (needs Pillow; no GPU)
"""
import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
INDEX = ROOT / "index.html"
BEGIN, END = "/* loading-art:begin */", "/* loading-art:end */"

# In the order the loading screen reveals them (the order a run meets them)
BOSSES = ["lodzia", "bigos", "zlewiatan", "eksterminator"]
SILHOUETTE_ROWS = 120


def uri(img: Image.Image, **kw) -> tuple[str, int]:
    buf = io.BytesIO()
    fmt = kw.pop("fmt", "WEBP")
    img.save(buf, fmt, **kw)
    mime = "image/webp" if fmt == "WEBP" else "image/png"
    data = buf.getvalue()
    return f"url(data:{mime};base64,{base64.b64encode(data).decode()})", len(data)


def plate(name: str, rows: int, **kw) -> tuple[str, int]:
    """A level plate shrunk to `rows` rows, blurred a touch: the loading screen shows it dim and out of focus.
    Tiled three across before shrinking, so the wrap-around stays seamless."""
    src = Image.open(PUBLIC / "levels" / name / "lv1.webp").convert("RGBA")
    w, h = src.size
    wide = Image.new("RGBA", (w * 3, h))
    for i in range(3):
        wide.paste(src, (i * w, 0))
    small_w = round(w * rows / h)
    small = wide.resize((small_w * 3, rows), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.7))
    return uri(small.crop((small_w, 0, small_w * 2, rows)), **kw)


def silhouette(boss: str) -> tuple[str, int, float]:
    """An alpha mask of the portrait's outline, with its brightest parts (eyes, glints) cut out of it."""
    src = Image.open(PUBLIC / "boss" / "portraits" / f"{boss}.webp").convert("RGBA")
    # a margin, so the outline survives the shrink
    src = src.crop(src.getbbox())
    h = SILHOUETTE_ROWS
    w = round(src.width * h / src.height)
    small = src.resize((w, h), Image.LANCZOS)
    px = small.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            # hard-edged, like the rest of the game's art; the bright parts (eyes, glints, a lens) let the backdrop through
            t = min(1.0, max(0.0, (lum - 0.5) / 0.4))
            po[x, y] = (255, 255, 255, round(255 - 135 * t))
    packed = uri(out, lossless=True, method=6)
    return packed[0], packed[1], w / h


def main() -> int:
    total = 0
    css: list[str] = []

    def add(name: str, packed: tuple[str, int]) -> None:
        nonlocal total
        css.append(f"--ld-{name}:{packed[0]};")
        total += packed[1]
        print(f"  {name:14s}{packed[1]:7d} B")

    strip = Image.open(PUBLIC / "assets" / "roach-run.png").convert("RGBA")
    add("roach", uri(strip.quantize(64, method=Image.FASTOCTREE), fmt="PNG", optimize=True))
    add("far", plate("sky", 160, quality=55, method=6))
    add("mid", plate("mid", 192, quality=75, alpha_quality=75, method=6))
    add("near", plate("fg", 192, quality=75, alpha_quality=75, method=6))
    floor = Image.open(PUBLIC / "levels" / "floor" / "lv1.webp").convert("RGBA")
    add("ledge", uri(floor, quality=85, alpha_quality=85, method=6))
    for i, boss in enumerate(BOSSES, 1):
        data, size, ratio = silhouette(boss)
        add(f"boss{i}", (data, size))
        css.append(f"--ld-boss{i}-ar:{ratio:.3f};")
    print(f"  total         {total:7d} B (base64 adds a third)")

    block = BEGIN + "\n    :root{\n      " + "\n      ".join(css) + "\n    }\n    " + END
    html = INDEX.read_text()
    pattern = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.S)
    if not pattern.search(html):
        print("index.html has no loading-art markers", file=sys.stderr)
        return 1
    INDEX.write_text(pattern.sub(lambda _: block, html))
    return 0


if __name__ == "__main__":
    sys.exit(main())
