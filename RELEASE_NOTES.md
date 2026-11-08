# Moli Linux 1.0.0

Moli Linux 1.0.0 is the first public desktop release of the project.

## Highlights

- Real Debian 13.7 KDE Plasma guest running locally through QEMU
- Dedicated Windows and macOS application windows
- Two disks by default: a persistent system disk and a 64 GiB sparse data disk
- Data disk automatically formatted, mounted at `/home/user/Data`, and linked
  from the guest desktop
- Hardware virtualization with automatic WHPX/HVF detection and TCG fallback
- No WSL installation required; TCG fallback works without enabling Hyper-V
- English and Simplified Chinese interface switching
- Host/guest shared folder
- Split-disk streaming for large Debian images
- Host Developer Tools support

## Download

### Windows x64

Download only `Moli-Linux-1.0.0-win-x64-Setup.exe`. When it is downloaded
directly from this GitHub Release, Setup downloads and verifies the four payload
volumes automatically. For offline installation, download every payload volume
beside the Setup executable. Do not rename the payload files.

### macOS

- `arm64`: Apple Silicon
- `x64`: Intel Mac

## Important notes

- Windows and macOS packages are unsigned. SmartScreen and Gatekeeper warnings
  are expected.
- The macOS packages were produced but have not been runtime-tested on physical
  Mac hardware for this release.
- Apple Silicon runs the x86-64 Linux guest through software emulation.
- Software emulation (TCG) works without hardware virtualization but is slow.
- The 64 GiB data disk is sparse and grows only as files are stored.
- Automatic installer downloads require about 18 GB of temporary free space and
  an internet connection.

Verify downloads using `SHA256SUMS.txt`.
