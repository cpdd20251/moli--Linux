#!/usr/bin/env python3
import json
import stat
import sys
import zipfile
from pathlib import Path


MACHO_MAGICS = {
    b"\xca\xfe\xba\xbe",
    b"\xbe\xba\xfe\xca",
    b"\xcf\xfa\xed\xfe",
    b"\xfe\xed\xfa\xcf",
    b"\xce\xfa\xed\xfe",
    b"\xfe\xed\xfa\xce",
}


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: prepare-mac-electron.py <zip> <app> <links.json> <executables.json>"
        )
    zip_path = Path(sys.argv[1])
    app = Path(sys.argv[2])
    links_path = Path(sys.argv[3])
    executables_path = Path(sys.argv[4])

    links = []
    with zipfile.ZipFile(zip_path) as archive:
        for entry in archive.infolist():
            mode = entry.external_attr >> 16
            if not stat.S_ISLNK(mode):
                continue
            relative = Path(entry.filename)
            parts = relative.parts
            if not parts or parts[0] != "Electron.app":
                continue
            relative = Path(*parts[1:])
            target = archive.read(entry).decode("utf-8")
            placeholder = app / relative
            if placeholder.exists():
                placeholder.unlink()
            links.append({"path": relative.as_posix(), "target": target})

    executables = []
    for path in app.rglob("*"):
        if not path.is_file():
            continue
        try:
            with path.open("rb") as stream:
                magic = stream.read(4)
        except OSError:
            continue
        if magic in MACHO_MAGICS:
            executables.append(path.relative_to(app).as_posix())

    links_path.write_text(json.dumps(links, indent=2), encoding="utf-8")
    executables_path.write_text(
        json.dumps(sorted(executables), indent=2),
        encoding="utf-8",
    )
    print(f"links={len(links)} executables={len(executables)}")


if __name__ == "__main__":
    main()
