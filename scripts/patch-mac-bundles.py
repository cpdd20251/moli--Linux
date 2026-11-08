#!/usr/bin/env python3
import plistlib
import sys
from pathlib import Path


def update_main_bundle(app: Path, version: str) -> None:
    plist_path = app / "Contents" / "Info.plist"
    with plist_path.open("rb") as stream:
        info = plistlib.load(stream)

    info.update(
        {
            "CFBundleDisplayName": "Moli Linux",
            "CFBundleExecutable": "Moli Linux",
            "CFBundleIconFile": "moli.icns",
            "CFBundleIdentifier": "com.moli.linux",
            "CFBundleName": "Moli Linux",
            "CFBundleShortVersionString": version,
            "CFBundleVersion": version,
            "LSApplicationCategoryType": "public.app-category.developer-tools",
            "LSMinimumSystemVersion": "13.0",
            "NSHighResolutionCapable": True,
        }
    )
    info.pop("ElectronAsarIntegrity", None)

    with plist_path.open("wb") as stream:
        plistlib.dump(info, stream, fmt=plistlib.FMT_XML, sort_keys=False)


def update_helper_bundles(app: Path) -> None:
    frameworks = app / "Contents" / "Frameworks"
    for helper in frameworks.glob("Moli Linux Helper*.app"):
        plist_path = helper / "Contents" / "Info.plist"
        with plist_path.open("rb") as stream:
            info = plistlib.load(stream)

        suffix = helper.name.removeprefix("Moli Linux Helper").removesuffix(".app")
        identifier_suffix = {
            "": "helper",
            " (GPU)": "helper.GPU",
            " (Plugin)": "helper.Plugin",
            " (Renderer)": "helper.Renderer",
        }.get(suffix, "helper")
        info["CFBundleName"] = f"Moli Linux Helper{suffix}"
        info["CFBundleDisplayName"] = f"Moli Linux Helper{suffix}"
        info["CFBundleExecutable"] = f"Moli Linux Helper{suffix}"
        info["CFBundleIdentifier"] = f"com.moli.linux.{identifier_suffix}"

        with plist_path.open("wb") as stream:
            plistlib.dump(info, stream, fmt=plistlib.FMT_XML, sort_keys=False)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch-mac-bundles.py <app> <version>")
    app = Path(sys.argv[1])
    update_main_bundle(app, sys.argv[2])
    update_helper_bundles(app)


if __name__ == "__main__":
    main()
