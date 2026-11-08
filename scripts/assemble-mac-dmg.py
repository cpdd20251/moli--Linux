#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "outputs" / "moli-linux"
BUILD = ROOT / "work" / "moli-linux-build"
HFS_TOOL = BUILD / "libdmg-build" / "hfs" / "hfsplus.exe"
DMG_TOOL = BUILD / "libdmg-build" / "dmg" / "dmg.exe"
TEMPLATE = BUILD / "UTM-extracted.img"
HFS_SIZE = 2 * 1024 * 1024 * 1024
DMG_BACKGROUND = PROJECT / "installer" / "mac-background.tiff"
DMG_DS_STORE = PROJECT / "installer" / "DS_Store"


def run_hfs(image: Path, *arguments: str) -> None:
    result = subprocess.run(
        [str(HFS_TOOL), str(image), *arguments],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        raise RuntimeError(f"hfsplus failed ({result.returncode}): {arguments}")
    if arguments[0] in {"add", "addall", "extractall", "rmall"}:
        tail = "\n".join(result.stdout.splitlines()[-3:])
        print(tail)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", choices=("arm64", "x64"), required=True)
    parser.add_argument("--version", default="1.0.0")
    args = parser.parse_args()

    app_stage = BUILD / "mac-app-build" / args.arch / "Moli Linux.app"
    links_path = BUILD / "mac-app-build" / args.arch / "electron-links.json"
    executables_path = BUILD / "mac-app-build" / args.arch / "electron-executables.json"
    icon_icns = app_stage / "Contents" / "Resources" / "moli.icns"
    image = BUILD / "mac-hfs-build" / f"Moli-Linux-{args.version}-{args.arch}.img"
    output = PROJECT / "dist" / f"Moli-Linux-{args.version}-mac-{args.arch}.dmg"

    for required in (
        HFS_TOOL,
        DMG_TOOL,
        TEMPLATE,
        app_stage,
        links_path,
        executables_path,
        DMG_BACKGROUND,
        DMG_DS_STORE,
        icon_icns,
    ):
        if not required.exists():
            raise FileNotFoundError(required)
    if image.exists():
        raise FileExistsError(image)
    if output.exists():
        raise FileExistsError(output)

    image.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(TEMPLATE, image)
    run_hfs(image, "grow", str(HFS_SIZE))
    # hfsplus updates the volume header but does not reliably extend the host
    # image. Without this truncate, dmg.exe can emit a truncated partition that
    # references the full VM disk but cannot read data beyond the template size.
    with image.open("r+b") as stream:
        stream.truncate(HFS_SIZE)
    run_hfs(image, "mkdir", "/Moli Linux.app")
    run_hfs(image, "mkdir", "/Moli Linux.app/Contents")
    run_hfs(image, "mkdir", "/Moli Linux.app/Contents/Resources")
    run_hfs(image, "mkdir", "/Moli Linux.app/Contents/Resources/qemu")
    run_hfs(image, "mkdir", "/Moli Linux.app/Contents/Resources/qemu/share")

    run_hfs(
        image,
        "mv",
        "/UTM.app/Contents/Frameworks",
        "/Moli Linux.app/Contents/Resources/qemu/Frameworks",
    )
    run_hfs(
        image,
        "mv",
        "/UTM.app/Contents/Resources/qemu",
        "/Moli Linux.app/Contents/Resources/qemu/share/qemu",
    )
    # libdmg-hfsplus cannot reliably delete the signed UTM.app catalog tree.
    # Keep its tiny remaining metadata shell hidden; the QEMU payload and share
    # directory above have already been moved into the Moli app.
    run_hfs(image, "mv", "/UTM.app", "/.MoliVendor")
    run_hfs(image, "addall", str(app_stage), "/Moli Linux.app")
    # hfsplus's overwrite path is reliable for existing files; removing root
    # dotfiles can corrupt the catalog tree in the legacy B-tree implementation.
    run_hfs(image, "add", str(icon_icns), "/.VolumeIcon.icns")
    run_hfs(image, "add", str(DMG_BACKGROUND), "/.background/dmg-background.tiff")
    run_hfs(image, "add", str(DMG_DS_STORE), "/.DS_Store")

    app_prefix = "/Moli Linux.app/"
    links = json.loads(links_path.read_text(encoding="utf-8"))
    for link in links:
        run_hfs(image, "symlink", app_prefix + link["path"], link["target"])

    qemu_link = app_prefix + "Contents/Resources/qemu/qemu-system-x86_64"
    qemu_target = (
        "Frameworks/qemu-x86_64-softmmu.framework/"
        "Versions/Current/qemu-x86_64-softmmu"
    )
    run_hfs(image, "symlink", qemu_link, qemu_target)
    run_hfs(image, "chmod", "755", qemu_link)

    for relative in json.loads(executables_path.read_text(encoding="utf-8")):
        run_hfs(image, "chmod", "755", app_prefix + relative)

    run_hfs(image, "ls", "/")
    subprocess.run([str(DMG_TOOL), "build", str(image), str(output)], check=True)
    print(f"DMG={output}")
    print(f"IMAGE={image}")


if __name__ == "__main__":
    main()
