#!/usr/bin/env python3
import struct
import sys
from pathlib import Path

from PIL import Image


ICNS_SIZES = (
    (16, b"icp4"),
    (32, b"icp5"),
    (64, b"icp6"),
    (128, b"ic07"),
    (256, b"ic08"),
    (512, b"ic09"),
    (1024, b"ic10"),
)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: make-icns.py <input.png> <output.icns>")

    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    image = Image.open(source).convert("RGBA")
    chunks = []
    for size, chunk_type in ICNS_SIZES:
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        temporary = destination.with_suffix(f".{size}.png")
        resized.save(temporary, format="PNG", optimize=True)
        data = temporary.read_bytes()
        temporary.unlink()
        chunks.append(chunk_type + struct.pack(">I", len(data) + 8) + data)

    payload = b"".join(chunks)
    destination.write_bytes(b"icns" + struct.pack(">I", len(payload) + 8) + payload)
    print(destination)


if __name__ == "__main__":
    main()
