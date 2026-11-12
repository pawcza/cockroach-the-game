"""Strips text and EXIF metadata from PNGs, losslessly: the tEXt, iTXt, zTXt and eXIf chunks are dropped and every other
chunk is copied byte for byte (no re-encoding, pixels unchanged).

ComfyUI writes its whole workflow into a PNG's text chunks, private file names included, so nothing that carries them
goes into the repo. tests/png-metadata.test.ts fails `npm test` on any PNG under art/ or public/ that still does.

    python3 tools/art/strip_meta.py FILE_OR_DIR...   strip in place (directories: every *.png under them)
    python3 tools/art/strip_meta.py --check          exit 1 if any PNG under art/ or public/ carries metadata
"""
import struct
import sys
from pathlib import Path

SIGNATURE = b"\x89PNG\r\n\x1a\n"
METADATA = {b"tEXt", b"iTXt", b"zTXt", b"eXIf"}
CHECKED = ("art", "public")


def chunks(data: bytes):
    """Each chunk as (type, its whole bytes: length, type, data and CRC)."""
    if not data.startswith(SIGNATURE):
        raise ValueError("not a PNG")
    at = len(SIGNATURE)
    while at < len(data):
        (length,) = struct.unpack(">I", data[at:at + 4])
        kind = data[at + 4:at + 8]
        end = at + 12 + length
        yield kind, data[at:end]
        at = end
        if kind == b"IEND":
            break


def metadata_of(path: Path) -> list[str]:
    return [kind.decode() for kind, _ in chunks(path.read_bytes()) if kind in METADATA]


def strip(path: Path) -> bool:
    """Drops the metadata chunks; True if the file changed."""
    data = path.read_bytes()
    kept = [whole for kind, whole in chunks(data) if kind not in METADATA]
    out = SIGNATURE + b"".join(kept)
    if out == data:
        return False
    path.write_bytes(out)
    return True


def pngs(paths: list[Path]) -> list[Path]:
    return [f for p in paths for f in (sorted(p.rglob("*.png")) if p.is_dir() else [p])]


def main(argv: list[str]) -> int:
    if argv[:1] == ["--check"]:
        root = Path(__file__).resolve().parents[2]
        dirty = [(f, metadata_of(f)) for f in pngs([root / d for d in CHECKED])]
        dirty = [(f, kinds) for f, kinds in dirty if kinds]
        for f, kinds in dirty:
            print(f"{f.relative_to(root)}: {', '.join(kinds)}")
        return 1 if dirty else 0
    changed = [f for f in pngs([Path(a) for a in argv]) if strip(f)]
    for f in changed:
        print(f"stripped {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
