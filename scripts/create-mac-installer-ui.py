#!/usr/bin/env python3
"""Generate the Finder background and .DS_Store for the Moli Linux DMG."""

from datetime import datetime
from pathlib import Path

import mac_alias
from ds_store import DSStore
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "outputs" / "moli-linux"
INSTALLER = PROJECT / "installer"
BACKGROUND = INSTALLER / "mac-background.tiff"
DS_STORE = INSTALLER / "DS_Store"

WIDTH = 660
HEIGHT = 620


def rounded_panel(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_background():
    image = Image.new("RGB", (WIDTH, HEIGHT), "#fbfaf6")
    draw = ImageDraw.Draw(image)

    for y in range(HEIGHT):
        shade = int(250 - y * 3 / HEIGHT)
        draw.line((0, y, WIDTH, y), fill=(shade, shade - 1, shade - 4))

    rounded_panel(draw, (235, 82, 425, 272), 28, "#f2f1ed", "#e9e7df", 2)
    rounded_panel(draw, (200, 378, 460, 555), 26, "#e9e6df")

    arrow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    arrow_draw = ImageDraw.Draw(arrow)
    arrow_draw.rounded_rectangle((311, 292, 349, 408), radius=18, fill=(255, 255, 250, 235))
    arrow_draw.polygon(
        [(270, 390), (390, 390), (330, 446)],
        fill=(255, 255, 250, 235),
    )
    arrow = arrow.filter(ImageFilter.GaussianBlur(0.6))
    image.paste(arrow, (0, 0), arrow)

    draw.rounded_rectangle(
        (241, 475, 419, 545),
        18,
        fill="#d8e7ee",
    )
    draw.rounded_rectangle(
        (241, 475, 419, 545),
        18,
        outline="#c4d8e2",
        width=2,
    )

    image.save(BACKGROUND, format="TIFF", compression="tiff_lzw")


def background_alias():
    creation = datetime(2026, 11, 8, 0, 0, 0, tzinfo=mac_alias.mac_epoch.tzinfo)
    volume = mac_alias.VolumeInfo(
        "Moli Linux",
        creation,
        b"H+",
        mac_alias.ALIAS_FIXED_DISK,
        0x100,
        b"\0\0",
        posix_path="/Volumes/Moli Linux",
    )
    target = mac_alias.TargetInfo(
        mac_alias.ALIAS_KIND_FILE,
        "dmg-background.tiff",
        2,
        2,
        creation,
        b"",
        b"",
        folder_name=".background",
        posix_path=".background/dmg-background.tiff",
    )
    return mac_alias.Alias(volume=volume, target=target).to_bytes()


def make_ds_store():
    if DS_STORE.exists():
        DS_STORE.unlink()
    with DSStore.open(str(DS_STORE), "w+") as store:
        store["."]["bwsp"] = {
            "WindowBounds": f"{{{{100, 100}}, {{{WIDTH}, {HEIGHT}}}}}",
            "ShowSidebar": False,
            "ShowStatusBar": False,
            "ShowPathbar": False,
            "ShowTabView": False,
            "ShowToolbar": False,
            "ContainerShowSidebar": False,
            "SidebarWidth": 0,
        }
        store["."]["icvp"] = {
            "arrangeBy": "none",
            "backgroundColorRed": 1.0,
            "backgroundColorGreen": 1.0,
            "backgroundColorBlue": 1.0,
            "backgroundImageAlias": background_alias(),
            "backgroundType": 2,
            "gridOffsetX": 0.0,
            "gridOffsetY": 0.0,
            "gridSpacing": 100.0,
            "iconSize": 112.0,
            "labelOnBottom": True,
            "showIconPreview": True,
            "showItemInfo": False,
            "textSize": 13.0,
            "viewOptionsVersion": 1,
        }
        store["Moli Linux.app"]["Iloc"] = (330, 178)
        store["Applications"]["Iloc"] = (330, 452)


def main():
    INSTALLER.mkdir(parents=True, exist_ok=True)
    make_background()
    make_ds_store()
    print(f"background={BACKGROUND}")
    print(f"ds_store={DS_STORE}")


if __name__ == "__main__":
    main()
