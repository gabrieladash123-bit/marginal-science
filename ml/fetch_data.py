"""Fetch an immutable public research corpus. Raw papers stay outside Git."""
import hashlib
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
COMMIT = "99fa3644a68563081a14fcbda7842b20f358cb91"
URL = f"https://raw.githubusercontent.com/mithuGit/SciHRA-Detect/{COMMIT}/data/scihra_detect.csv.zip"
BLOB = "1100a9520ba51759906e799c4b7f282aadff7a27"


def fetch():
    folder = ROOT / "data"
    folder.mkdir(exist_ok=True)
    path = folder / "scihra_detect.csv.zip"
    if not path.exists():
        request = urllib.request.Request(URL, headers={"User-Agent": "Marginal-research-demo/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    raw = path.read_bytes()
    actual = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    if actual != BLOB:
        raise RuntimeError("Dataset content does not match the pinned Git blob")
    with zipfile.ZipFile(path) as archive:
        print({"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "files": archive.namelist()})
    return path


if __name__ == "__main__":
    fetch()
