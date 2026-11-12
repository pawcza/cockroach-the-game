"""Safe unzip: rejects paths that escape the target folder. Usage: unzip_safe.py zip dest"""
import sys, zipfile, os
def safe_extract(zpath, dest):
    dest = os.path.realpath(dest); os.makedirs(dest, exist_ok=True)
    n = 0
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            target = os.path.realpath(os.path.join(dest, info.filename))
            if not (target == dest or target.startswith(dest + os.sep)):
                print("REJECT", info.filename); continue
            if info.is_dir(): os.makedirs(target, exist_ok=True); continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(info) as src, open(target, "wb") as out: out.write(src.read())
            n += 1
    return n
if __name__ == "__main__":
    print(safe_extract(sys.argv[1], sys.argv[2]))
