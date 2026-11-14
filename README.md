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

- `Moli-Linux-1.0.0-win-x64-Setup.msi`（64 位 Windows 10/11；本版本不提供 32 位）

这是标准的 Windows Installer（.msi）安装向导。双击后，Windows 可能先弹一次
安全提醒。这是暂未购买商业代码签名证书的开源软件的常规流程，并不代表安装包
有问题，按下面的方法操作即可：

1. **"Windows 已保护你的电脑"（SmartScreen）**：点击提示框里的**"更多信息"**
   （蓝色小字），下方会出现**"仍要运行"**按钮，点击它；
2. 如果出现**"未知发布者 / 无法验证发布者"**的确认框：选择**"运行"**即可。

之后进入安装向导，全部是 Windows 自带的标准对话框：

1. **安装方式**：选择**"当前用户安装"**（推荐，不需要管理员权限）或
   **"全部用户安装"**（需要管理员权限，会再弹一次权限确认窗口，装到
   Program Files，本机所有用户都能使用）；
2. **安装位置**：默认位置已填好，可以直接输入路径，或点**"浏览..."**选择文件夹；
3. **安装选项**：勾选是否创建桌面快捷方式、开始菜单快捷方式，以及
   **"虚拟机工具（共享文件夹入口）"**（在"文档"里创建 MoliLinuxShare 共享目录
   并添加入口）。开发者工具已内置于程序中（按 F12 或打开"查看 → 开发者工具"），
   无需单独安装；
4. **进度**：安装器自动从本 Release 下载 4 个 payload 分卷（合计约 7.1 GB），
   逐个校验 SHA-256 后解压安装，并清理临时文件。需要至少 18 GB 可用磁盘空间，
   耗时取决于网速，请保持网络连接，不要关闭窗口；
5. **完成**：可勾选**"立即运行 Moli Linux"**。

**无需手动下载 001~004 分卷。** 任何情况下都不要重命名分卷文件。安装完成后
可在"设置 → 应用 → 安装的应用"里找到并卸载 Moli Linux。

如果 .msi 因系统策略无法运行，可以改用同一 Release 里的
`Moli-Linux-1.0.0-win-x64-Setup.exe`（传统安装器，安装过程相同）。

硬件虚拟化建议开启。Moli Linux 会优先尝试 WHPX，不可用时回退到 QEMU TCG。
TCG 不需要改 BIOS 或开启任何 Windows 功能，但启动和桌面性能会明显变慢。

## macOS 安装

按 Mac 的芯片选择安装包：

- Apple Silicon（M 系列芯片）：`Moli-Linux-1.0.0-mac-arm64.dmg`
- Intel 芯片：`Moli-Linux-1.0.0-mac-x64.dmg`

**下载和安装步骤：**

1. 在本 Release 页面点击对应文件下载（约 560 MB），等待下载完成；
2. 双击打开下载好的 DMG 文件，把 Moli Linux 拖进"应用程序"文件夹；
3. 在"应用程序"里双击启动 Moli Linux。

**首次启动会被 macOS 拦截一次，这是正常现象。** 本版本还没有 Apple 开发者
签名和公证，Gatekeeper 会提示"无法打开，因为 Apple 无法检查其是否包含恶意
软件"（偶尔措辞略有不同）。按下面步骤放行即可，之后每次启动都不再提示：

1. 看到拦截提示后，点"好"或"完成"关闭它；
2. 打开**系统设置 → 隐私与安全性**，向下滚动到"安全性"一栏；
3. 找到"已阻止使用 Moli Linux"的提示，点击**"仍要打开"**；
4. 输入登录密码，再点"打开"。

注意：macOS 15（Sequoia）起，苹果取消了"右键 → 打开"的快捷方式，必须按上面
第 3 步从系统设置放行；macOS 14 及更早版本也可以右键（或按住 Control 点击）
应用图标，选择"打开"来完成放行。

熟悉终端的用户也可以在安装后执行一次下面的命令，效果相同：

```sh
xattr -dr com.apple.quarantine "/Applications/Moli Linux.app"
```

DMG 体积小，是因为首次启动时会从同一个 GitHub Release 下载 Debian 运行盘
文件并校验 SHA-256，保存到用户应用数据目录。请保持联网，预留约 8 GB 下载
流量和至少 10 GB 磁盘空间。

Apple Silicon 版本通过软件模拟运行 x86-64 客户机，速度会比 Intel 版本慢。

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

`npm run dist:win` 会生成 `dist\Moli-Linux-<版本>-win-x64-Setup.exe` 和分卷。
如需生成标准 Windows Installer 安装包，先安装 WiX 5
（`dotnet tool install --global wix`），再运行：

```powershell
powershell -File scripts\build-win-msi.ps1 `
  -ReleaseBaseUrl https://github.com/cpdd20251/moli--Linux/releases/download/v1.0.0/
```

QEMU 二进制和 Debian 磁盘镜像体积达数 GB，因此不放进常规 Git 历史。构建者
需要按文档把运行时文件放到 `resources/qemu`、`resources/boot` 和
`resources/vm`，或者结合 Release 源码包与 Release 附件使用。

主进程在 `main.js`，渲染器在 `src/`，分卷磁盘支持在 `lib/`，打包脚本在
`scripts/`。

## 已知限制

- Windows 安装包暂未使用商业代码签名证书，下载或首次运行时可能出现 SmartScreen
  或"未知发布者"提示，属正常现象，按本 README 的步骤继续即可；安装过程本身
  不需要管理员权限。
- macOS 安装包暂未签名、未公证，首次启动需要在"系统设置 → 隐私与安全性"
  中放行一次。本版本使用跨平台 DMG 工具生成，尚未在实体 Mac 硬件上验证运行。
- Apple Silicon 通过 TCG 软件模拟运行 x86-64 客户机。
- 冷启动虚拟机可能需要几分钟，尤其是没有硬件虚拟化时。
- 安装器和安装后的应用需要数 GB 磁盘空间。

## 校验

下载后用对应平台的命令校验文件。

Windows PowerShell：

```powershell
Get-FileHash .\Moli-Linux-1.0.0-win-x64-Setup.msi -Algorithm SHA256
```

macOS：

```sh
shasum -a 256 Moli-Linux-1.0.0-mac-arm64.dmg
shasum -a 256 Moli-Linux-1.0.0-mac-x64.dmg
```

将输出与 Release 中的 `SHA256SUMS.txt` 对照。

## 许可证

GPL-3.0-or-later，详见 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。
