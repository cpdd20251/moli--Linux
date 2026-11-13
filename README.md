# Moli Linux

![Moli Linux](resources/icon.png)

Moli Linux 在独立的 Windows 或 macOS 应用窗口中运行完整的 Debian 13 KDE
桌面。它是本地 Linux 工作环境，不是网页模拟：客户机系统通过 QEMU 真实启动，
拥有持久化存储，可以正常安装和运行 Debian 软件。

> 声明：此项目由 DeepSeek 开发而成

## 截图

| 启动界面 | Debian KDE 桌面 |
| --- | --- |
| ![Moli Linux 启动界面](docs/screenshots/01-launch.png) | ![Debian KDE 桌面](docs/screenshots/02-desktop.png) |

| 简体中文桌面 | 日语桌面 |
| --- | --- |
| ![简体中文桌面](docs/screenshots/03-simplified-chinese.png) | ![日语桌面](docs/screenshots/04-japanese.png) |

无需安装 WSL，也不必修改 Hyper-V 或 BIOS：有硬件虚拟化时 Moli Linux 使用
WHPX，不可用时自动回退到 QEMU TCG 软件模拟。

## 包含内容

- Debian 13.7 + KDE Plasma
- 原生 Electron 窗口，支持最大化、全屏和开发者工具
- QEMU 虚拟化：Windows 使用 WHPX，macOS 在可用时使用 HVF
- 硬件虚拟化不可用时自动回退软件模拟
- 持久化的写时复制系统盘
- 默认两块磁盘：Debian 系统盘 + 64 GiB 稀疏数据盘
- 数据盘挂载到 `/home/user/Data`，并在客户机桌面创建链接
- 主机与客户机共享文件夹：`Documents/MoliLinuxShare`
- 中英文界面切换
- 键盘、鼠标、音频、网络、显示一体化集成

64 GiB 数据盘是稀疏文件，不会立即占用 64 GiB 空间，只有实际写入数据时才会增长。

## Windows 安装

推荐只下载一个文件：

- `Moli-Linux-1.0.0-win-x64-Setup.exe`

只要安装包是**用浏览器直接从本 GitHub Release 下载的**，安装器就能识别发布
地址，自动下载 4 个 payload 分卷、逐个校验 SHA-256 后完成安装，并清理临时
下载文件。这种方式需要至少 18 GB 临时可用空间。

**无需手动下载 001~004 分卷。** 只有特殊情况——例如安装分卷损坏、或引导遭受
破坏需要重装时——才需要手动把 4 个分卷和 Setup 放在同一目录（原有损坏的分卷
可先删除），然后运行 Setup 离线安装。

注意：用迅雷、IDM 等第三方下载器下载的 Setup 会丢失浏览器的"下载来源"标记，
安装器将无法自动下载分卷；此时请改用上面的手动方式。任何情况下都不要重命名
分卷文件。

硬件虚拟化建议开启。Moli Linux 会优先尝试 WHPX，不可用时回退到 QEMU TCG。
TCG 不需要改 BIOS 或开启任何 Windows 功能，但启动和桌面性能会明显变慢。

## macOS 安装

按 Mac 的芯片选择安装包：

- Apple Silicon：`Moli-Linux-1.0.0-mac-arm64.dmg`
- Intel：`Moli-Linux-1.0.0-mac-x64.dmg`

打开 DMG，把 Moli Linux 拖入"应用程序"。DMG 体积小，是因为首次启动时会从
同一个 GitHub Release 下载 Debian 运行盘文件并校验 SHA-256，保存到用户应用
数据目录。请保持联网，预留约 8 GB 下载流量和至少 10 GB 磁盘空间。

本版本的 macOS 包未签名、未公证。macOS 可能会要求右键点击应用选择"打开"，
或在"系统设置 > 隐私与安全性"中放行。Apple Silicon 版本通过软件模拟运行
x86-64 客户机，速度会比 Intel 版本慢。

## 从源码构建

依赖：

- Node.js 20 或更新版本
- npm
- Windows 10/11 x64（构建 Windows 安装包时）
- `package.json` 中引用的运行时资源

```powershell
npm install
npm run build:ui
npm run smoke
npm run dist:win
```

QEMU 二进制和 Debian 磁盘镜像体积达数 GB，因此不放进常规 Git 历史。构建者
需要按文档把运行时文件放到 `resources/qemu`、`resources/boot` 和
`resources/vm`，或者结合 Release 源码包与 Release 附件使用。

主进程在 `main.js`，渲染器在 `src/`，分卷磁盘支持在 `lib/`，打包脚本在
`scripts/`。

## 已知限制

- Windows 安装包未签名，SmartScreen 可能提示"未知发布者"。
- macOS 安装包未签名、未公证。本版本使用跨平台 DMG 工具生成，尚未在实体
  Mac 硬件上验证运行。
- Apple Silicon 通过 TCG 软件模拟运行 x86-64 客户机。
- 冷启动虚拟机可能需要几分钟，尤其是没有硬件虚拟化时。
- 安装器和安装后的应用需要数 GB 磁盘空间。

## 校验

下载后用对应平台的命令校验文件。

Windows PowerShell：

```powershell
Get-FileHash .\Moli-Linux-1.0.0-win-x64-Setup.exe -Algorithm SHA256
```

macOS：

```sh
shasum -a 256 Moli-Linux-1.0.0-mac-arm64.dmg
shasum -a 256 Moli-Linux-1.0.0-mac-x64.dmg
```

将输出与 Release 中的 `SHA256SUMS.txt` 对照。

## 许可证

GPL-3.0-or-later，详见 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。
