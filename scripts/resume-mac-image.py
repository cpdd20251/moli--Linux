#!/usr/bin/env python3
"""Finish an existing Moli Linux HFS image and build its DMG."""

import argparse
import importlib.util
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "outputs" / "moli-linux"
BUILD = ROOT / "work" / "moli-linux-build"
HFS_TOOL = BUILD / "libdmg-build" / "hfs" / "hfsplus.exe"
DMG_TOOL = BUILD / "libdmg-build" / "dmg" / "dmg.exe"


def run_hfs(image: Path, *arguments: str) -> str:
    result = subprocess.run(
        [str(HFS_TOOL), str(image), *arguments],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if result.returncode != 0:
        raise RuntimeError(f"hfsplus failed: {arguments}\n{result.stdout}")
    return result.stdout


def hfs_file_size(image: Path, directory: str, name: str) -> int | None:
    listing = run_hfs(image, "ls", directory)
    for line in listing.splitlines():
        fields = line.split()
        if len(fields) >= 6 and fields[-1] == name:
            return int(fields[3])
    return None


def load_assemble_module():
    path = PROJECT / "scripts" / "assemble-mac-dmg.py"
    spec = importlib.util.spec_from_file_location("assemble_mac_dmg", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", choices=("arm64", "x64"), required=True)
    parser.add_argument("--version", default="1.0.0")
    args = parser.parse_args()

    app_stage = BUILD / "mac-app-build" / args.arch / "Moli Linux.app"
    links_path = BUILD / "mac-app-build" / args.arch / "electron-links.json"
    executables_path = BUILD / "mac-app-build" / args.arch / "electron-executables.json"
    image = BUILD / "mac-hfs-build" / f"Moli-Linux-{args.version}-{args.arch}.img"
    output = PROJECT / "dist" / f"Moli-Linux-{args.version}-mac-{args.arch}.dmg"
    vm_dir = "/Moli Linux.app/Contents/Resources/vm"
    resources_dir = "/Moli Linux.app/Contents/Resources"
    app_prefix = "/Moli Linux.app/"
    app_asar = app_stage / "Contents" / "Resources" / "app.asar"
    data_template = PROJECT / "resources" / "vm" / "data-disk-template.qcow2"
    root_parts = sorted(
        (PROJECT / "resources" / "vm").glob("root-seed.qcow2.part[0-9][0-9][0-9]")
    )

    if not image.exists():
        raise FileNotFoundError(image)
    for required in (app_asar, data_template):
        if not required.exists():
            raise FileNotFoundError(required)

    # hfsplus can overwrite an existing file, but its rm path corrupts the
    # legacy catalog B-tree on this image. Always use add for replacements.
    run_hfs(image, "add", str(app_asar), resources_dir + "/app.asar")
    run_hfs(image, "add", str(data_template), vm_dir + "/" + data_template.name)

    run_hfs(image, "add", str(app_stage / "Contents/Resources/moli.icns"), "/.VolumeIcon.icns")
    run_hfs(
        image,
        "add",
        str(PROJECT / "installer/mac-background.tiff"),
        "/.background/dmg-background.tiff",
    )
    run_hfs(image, "add", str(PROJECT / "installer/DS_Store"), "/.DS_Store")

    for link in json.loads(links_path.read_text(encoding="utf-8")):
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

    missing_parts = []
    for part in root_parts:
        existing_size = hfs_file_size(image, vm_dir, part.name)
        if existing_size is None:
            missing_parts.append(part)
        elif existing_size != part.stat().st_size:
            raise RuntimeError(
                f"{part.name} has size {existing_size}, expected {part.stat().st_size}"
            )

    if missing_parts:
        assemble = load_assemble_module()
        assemble.align_next_allocation(
            image,
            sum(part.stat().st_size for part in missing_parts),
        )
        for part in missing_parts:
            print(f"Adding {part.name}...", flush=True)
            run_hfs(image, "add", str(part), vm_dir + "/" + part.name)

    print(run_hfs(image, "ls", vm_dir), flush=True)

    if output.exists():
        raise FileExistsError(output)
    subprocess.run([str(DMG_TOOL), "build", str(image), str(output)], check=True)
    print(f"DMG={output}")


if __name__ == "__main__":
    main()
