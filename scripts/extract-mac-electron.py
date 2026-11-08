#!/usr/bin/env python3
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


def safe_target(root: Path, name: str) -> Path:
    parts = PurePosixPath(name).parts
    if not parts or name.startswith("/") or ".." in parts:
        raise RuntimeError(f"Unsafe ZIP entry: {name}")
    return root.joinpath(*parts)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-mac-electron.py <zip> <destination>")

    zip_path = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    destination.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as archive:
        for entry in archive.infolist():
            target = safe_target(destination, entry.filename)
            mode = entry.external_attr >> 16
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            # Symlink entries are written as small placeholder files. The
            # prepare pass reads them from the ZIP and records the real targets.
            with archive.open(entry) as source, target.open("wb") as output:
                output.write(source.read())
            if not stat.S_ISLNK(mode) and mode:
                target.chmod(mode & 0o777)

    print(f"Extracted {zip_path} to {destination}")


if __name__ == "__main__":
    main()
