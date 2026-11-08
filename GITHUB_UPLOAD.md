# GitHub upload checklist

## Repository description

Use this text for the GitHub "About" field:

> Run a real Debian 13 KDE desktop in a dedicated Windows or macOS application
> window. No WSL required.

Suggested topics:

`debian`, `kde`, `linux`, `qemu`, `electron`, `virtualization`,
`windows`, `macos`, `desktop-app`

## Repository

Upload the source files from this directory. Do not commit these generated or
large directories:

- `node_modules/`
- `dist/`
- `dist-ui/`
- `work/`
- `resources/qemu/`
- `resources/boot/`
- `resources/vm/`

`.gitignore` already excludes them.

## Release tag

Create tag `v1.0.0` and attach these files to the GitHub Release:

- `dist/Moli-Linux-1.0.0-win-x64-Setup.exe`
- all `dist/Moli-Linux-1.0.0-win-x64-payload.7z.*` volumes
- `dist/Moli-Linux-1.0.0-mac-arm64.dmg`
- `dist/Moli-Linux-1.0.0-mac-x64.dmg`
- `dist/Moli-Linux-1.0.0-source.zip`
- `dist/SHA256SUMS.txt`

Use the title `Moli Linux 1.0.0` and paste `RELEASE_NOTES.md` into the release
description.

## Important

- Keep every Windows payload volume below 2 GiB so it can be uploaded as a
  GitHub Release asset.
- Never upload only the Setup executable. The payload volumes are required.
- Test the downloaded release from a clean folder before making the repository
  public.
