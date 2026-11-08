const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { NbdSplitServer } = require('./lib/nbd-split-server');

for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', () => {});
}

const ISO_FILE = 'debian-live-13.7.0-amd64-kde.iso';
const ISO_SHA256 = '37dedc921f50325665c75829597126b3eeb70ff5cd8c511a7230ace09ae939be';
const ISO_URL = 'https://mirrors.tuna.tsinghua.edu.cn/debian-cd/current-live/amd64/iso-hybrid/' + ISO_FILE;
const VM_MEMORY_MB = 3072;
const VM_CPUS = 4;

if (process.env.MOLI_SMOKE === '1' && process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu');
}

let mainWindow = null;
let qemuProcess = null;
let qemuAcceleration = null;
let shuttingDown = false;
let vmReady = false;
let guestDesktopReady = false;
let currentVncPort = null;
let currentQmpPort = null;
let currentQgaPort = null;
let qmpSocket = null;
let downloadRequest = null;
let desktopMonitorTimer = null;
let desktopMonitorBusy = false;
let desktopProbeStreak = 0;
let devToolsOpen = false;
let devToolsRetryTimer = null;
let nbdServer = null;
let dataDiskPrepared = false;

function appPaths() {
  const resources = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, 'resources');
  const dataRoot = app.getPath('userData');
  const qemuPlatform = process.platform === 'darwin' ? 'mac' : 'win';
  const qemuName = process.platform === 'darwin'
    ? 'qemu-system-x86_64'
    : 'qemu-system-x86_64.exe';
  const qemuDir = app.isPackaged
    ? path.join(resources, 'qemu')
    : path.join(resources, 'qemu', qemuPlatform);
  return {
    resources,
    dataRoot,
    isoDir: path.join(dataRoot, 'iso'),
    iso: path.join(dataRoot, 'iso', ISO_FILE),
    isoVerification: path.join(dataRoot, 'iso', ISO_FILE + '.verified.json'),
    vmDir: path.join(dataRoot, 'vm'),
    persistence: path.join(dataRoot, 'vm', 'persistence.qcow2'),
    persistenceSeed: path.join(resources, 'vm', 'persistence-seed.qcow2'),
    rootDisk: path.join(dataRoot, 'vm', 'root.qcow2'),
    rootSeed: path.join(resources, 'vm', 'root-seed.qcow2'),
    rootSeedParts: path.join(resources, 'vm'),
    rootOverlayTemplate: path.join(resources, 'vm', 'root-overlay-template.qcow2'),
    dataDisk: path.join(dataRoot, 'vm', 'data.qcow2'),
    dataDiskTemplate: path.join(resources, 'vm', 'data-disk-template.qcow2'),
    kernel: path.join(resources, 'boot', 'vmlinuz'),
    initrd: path.join(resources, 'boot', 'initrd.img'),
    qemu: path.join(qemuDir, qemuName),
    qemuData: path.join(qemuDir, 'share', 'qemu'),
    qemuPlatform,
    shareDir: path.join(app.getPath('documents'), 'MoliLinuxShare'),
    logDir: path.join(dataRoot, 'logs'),
    qemuLog: path.join(dataRoot, 'logs', 'qemu.log'),
    desktopProbe: path.join(dataRoot, 'logs', 'desktop-probe.ppm')
  };
}

function ensureDirectories(paths) {
  for (const directory of [
    paths.isoDir,
    paths.vmDir,
    paths.shareDir,
    paths.logDir
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#041012',
    title: 'Moli Linux',
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.MOLI_SMOKE === '1') {
    mainWindow.hide();
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        let result = null;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          result = await mainWindow.webContents.executeJavaScript(
            'window.__moliSmoke ? window.__moliSmoke() : '
              + '({ ok: false, error: "missing smoke hook", readyState: document.readyState })'
          );
          if (result?.ok || result?.error !== 'missing smoke hook') break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        console.log('MOLI_SMOKE=' + JSON.stringify(result));
        app.exit(result?.ok ? 0 : 1);
      } catch (error) {
        console.error('MOLI_SMOKE_ERROR=' + error.stack);
        app.exit(1);
      }
    });
  }

  if (process.env.MOLI_DEVTOOLS_SMOKE === '1') {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        mainWindow.show();
        mainWindow.focus();
        const requested = toggleDeveloperTools();
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const result = {
          ok: requested && mainWindow.webContents.isDevToolsOpened(),
          requested,
          open: mainWindow.webContents.isDevToolsOpened(),
          focused: mainWindow.webContents.isDevToolsFocused(),
          devtoolsContents: Boolean(mainWindow.webContents.devToolsWebContents)
        };
        console.log('MOLI_DEVTOOLS_SMOKE=' + JSON.stringify(result));
        app.exit(result.ok ? 0 : 1);
      } catch (error) {
        console.error('MOLI_DEVTOOLS_SMOKE_ERROR=' + error.stack);
        app.exit(1);
      }
    });
  }

  mainWindow.loadFile(
    path.join(__dirname, 'dist-ui', 'index.html'),
    process.env.MOLI_SMOKE === '1' || process.env.MOLI_DEVTOOLS_SMOKE === '1'
      ? { query: { smoke: '1' } }
      : {}
  );
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 3) {
      console.error('[renderer]', event.message, event.sourceId, event.lineNumber);
    }
  });
  mainWindow.webContents.on('devtools-opened', () => {
    if (devToolsRetryTimer) {
      clearTimeout(devToolsRetryTimer);
      devToolsRetryTimer = null;
    }
    devToolsOpen = true;
  });
  mainWindow.webContents.on('devtools-closed', () => {
    if (devToolsRetryTimer) {
      clearTimeout(devToolsRetryTimer);
      devToolsRetryTimer = null;
    }
    devToolsOpen = false;
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const key = String(input.key || '').toLowerCase();
    const commandKey = input.control || input.meta;
    const isDevToolsShortcut = key === 'f12'
      || (commandKey && input.shift && key === 'i');
    if (!isDevToolsShortcut) return;
    event.preventDefault();
    toggleDeveloperTools();
  });
  mainWindow.once('ready-to-show', () => {
    if (process.env.MOLI_SMOKE !== '1') {
      mainWindow.maximize();
      mainWindow.show();
    }
  });
  mainWindow.on('closed', () => {
    if (devToolsRetryTimer) {
      clearTimeout(devToolsRetryTimer);
      devToolsRetryTimer = null;
    }
    mainWindow = null;
    devToolsOpen = false;
  });
}

function installMenu() {
  const template = [
    {
      label: 'Moli Linux',
      submenu: [
        {
          label: 'Restart Linux',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => restartVm()
        },
        {
          label: 'Shared Folder',
          click: () => {
            const paths = appPaths();
            fs.mkdirSync(paths.shareDir, { recursive: true });
            require('electron').shell.openPath(paths.shareDir);
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Moli Linux' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Full Screen',
          accelerator: 'F11',
          click: () => {
            if (!mainWindow) return;
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        {
          label: 'Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => toggleDeveloperTools()
        },
        {
          label: 'Reload Window',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function toggleDeveloperTools() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const contents = mainWindow.webContents;
  if (devToolsOpen || contents.isDevToolsOpened()) {
    if (devToolsRetryTimer) {
      clearTimeout(devToolsRetryTimer);
      devToolsRetryTimer = null;
    }
    devToolsOpen = false;
    console.log('[devtools] closing');
    contents.closeDevTools();
  } else {
    devToolsOpen = true;
    console.log('[devtools] opening');
    openDevToolsWithRetry(contents);
  }
  return true;
}

function openDevToolsWithRetry(contents, attempt = 0) {
  if (!devToolsOpen || !mainWindow || mainWindow.isDestroyed()) return;
  if (contents.isDestroyed() || contents.isDevToolsOpened()) return;
  mainWindow.show();
  mainWindow.focus();
  try {
    contents.openDevTools({ mode: 'detach' });
  } catch (error) {
    console.error('[devtools] open attempt failed', error.message);
  }
  if (attempt >= 20 || contents.isDevToolsOpened()) return;
  devToolsRetryTimer = setTimeout(() => {
    devToolsRetryTimer = null;
    openDevToolsWithRetry(contents, attempt + 1);
  }, Math.min(1000, 150 + attempt * 75));
}

function status(stage, message, extra = {}) {
  console.log(`[vm:${stage}] ${message}`);
  send('vm:status', { stage, message, ...extra });
}

async function startVm() {
  if (qemuProcess && vmReady) {
    send('vm:ready', { port: currentVncPort });
    return { ok: true, port: currentVncPort };
  }

  const paths = appPaths();
  ensureDirectories(paths);
  shuttingDown = false;
  vmReady = false;
  guestDesktopReady = false;

  try {
    if (!fs.existsSync(paths.qemu)) {
      throw new Error(`Bundled QEMU was not found: ${paths.qemu}`);
    }
    if (!fs.existsSync(paths.kernel) || !fs.existsSync(paths.initrd)) {
      throw new Error('Linux boot files are missing. Please reinstall the application.');
    }

    const seedBacking = await prepareRootBacking(paths);
    await ensureRootDisk(paths, seedBacking);
    ensureDataDisk(paths);

    status('boot', 'Starting the Linux kernel...');
    await launchQemu(paths);
    vmReady = true;
    status('display', 'Display connected. Starting the Debian desktop...');
    send('vm:ready', {
      port: currentVncPort,
      acceleration: qemuAcceleration
    });
    startDesktopMonitor(paths);
    return { ok: true, port: currentVncPort, acceleration: qemuAcceleration };
  } catch (error) {
    status('error', error.message);
    send('vm:error', { message: error.message });
    return { ok: false, error: error.message };
  }
}

async function ensureIso(paths) {
  if (fs.existsSync(paths.iso)) {
    if (isIsoVerificationCached(paths)) return;
    status('verify', 'Verifying the Debian image...');
    const actual = await sha256File(paths.iso);
    if (actual === ISO_SHA256) {
      writeIsoVerificationCache(paths);
      return;
    }
    fs.rmSync(paths.isoVerification, { force: true });
    fs.unlinkSync(paths.iso);
  }

  const partial = paths.iso + '.part';
  const partialBytes = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  status(
    'download',
    partialBytes > 0
      ? `Resuming the Debian 13 KDE image (${formatBytes(partialBytes)} already downloaded)...`
      : 'First launch: downloading the Debian 13 KDE image...',
    { progress: 0 }
  );
  await downloadFile(ISO_URL, partial, (received, total) => {
    const progress = total > 0 ? received / total : 0;
    send('vm:download', {
      received,
      total,
      progress,
      message: `Downloading Linux ${formatBytes(received)} / ${formatBytes(total)}`
    });
  });
  status('verify', 'Download complete. Verifying SHA-256...', { progress: 1 });
  const actual = await sha256File(partial);
  if (actual !== ISO_SHA256) {
    fs.unlinkSync(partial);
    throw new Error('Debian image SHA-256 verification failed. Please try again.');
  }
  fs.renameSync(partial, paths.iso);
  writeIsoVerificationCache(paths);
}

function isIsoVerificationCached(paths) {
  try {
    const marker = JSON.parse(fs.readFileSync(paths.isoVerification, 'utf8'));
    const stat = fs.statSync(paths.iso);
    return marker.sha256 === ISO_SHA256
      && marker.size === stat.size
      && marker.mtimeMs === stat.mtimeMs;
  } catch {
    return false;
  }
}

function writeIsoVerificationCache(paths) {
  const stat = fs.statSync(paths.iso);
  fs.writeFileSync(paths.isoVerification, JSON.stringify({
    sha256: ISO_SHA256,
    size: stat.size,
    mtimeMs: stat.mtimeMs
  }));
}

async function ensurePersistence(paths) {
  if (fs.existsSync(paths.persistence)) return;
  if (!fs.existsSync(paths.persistenceSeed)) {
    throw new Error('The persistent disk template is missing. Please reinstall the application.');
  }
  status('disk', 'Creating the persistent Linux disk...');
  fs.copyFileSync(paths.persistenceSeed, paths.persistence);
}

async function ensureRootDisk(paths, seedBacking) {
  if (!seedBacking) {
    throw new Error('The installed Linux disk image is missing. Please reinstall the application.');
  }
  if (!fs.existsSync(paths.rootOverlayTemplate)) {
    throw new Error('The persistent disk template is missing. Please reinstall the application.');
  }
  if (fs.existsSync(paths.rootDisk)) {
    const backingPath = readQcow2BackingPath(paths.rootDisk);
    if (backingPath && sameFilePath(backingPath, seedBacking)) return;
    console.warn(
      `[vm:disk] Removing stale workspace overlay (backing: ${backingPath || 'missing'})`
    );
    fs.unlinkSync(paths.rootDisk);
  }
  status('disk', 'Creating the persistent Linux workspace...');
  createRootOverlay(paths.rootOverlayTemplate, seedBacking, paths.rootDisk);
}

function ensureDataDisk(paths) {
  if (fs.existsSync(paths.dataDisk)) {
    readQcow2BackingPath(paths.dataDisk);
    return;
  }
  if (!fs.existsSync(paths.dataDiskTemplate)) {
    throw new Error('The second Linux disk template is missing. Please reinstall the application.');
  }
  status('disk', 'Creating the second Linux data disk...');
  fs.copyFileSync(paths.dataDiskTemplate, paths.dataDisk, fs.constants.COPYFILE_EXCL);
}

async function prepareRootBacking(paths) {
  if (process.env.MOLI_PREFER_SPLIT_SEED !== '1' && fs.existsSync(paths.rootSeed)) {
    return paths.rootSeed;
  }
  const parts = findRootSeedParts(paths.rootSeedParts);
  if (parts.length === 0) {
    throw new Error('The installed Linux disk image is missing. Please reinstall the application.');
  }
  if (!nbdServer) {
    nbdServer = new NbdSplitServer(parts, 60464);
    await nbdServer.start();
  }
  return 'nbd://127.0.0.1:60464';
}

function findRootSeedParts(directory) {
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch {
    return [];
  }
  const matched = names
    .filter((name) => /^root-seed\.qcow2\.part\d{3}$/.test(name))
    .sort();
  for (let index = 0; index < matched.length; index += 1) {
    if (matched[index] !== `root-seed.qcow2.part${String(index + 1).padStart(3, '0')}`) {
      throw new Error('The split Linux disk image has missing or duplicate parts.');
    }
  }
  return matched.map((name) => path.join(directory, name));
}

function readQcow2BackingPath(imagePath) {
  const fd = fs.openSync(imagePath, 'r');
  try {
    const header = Buffer.alloc(528);
    const headerBytes = fs.readSync(fd, header, 0, header.length, 0);
    if (headerBytes < 24 || header.readUInt32BE(0) !== 0x514649fb) {
      throw new Error('The persistent disk is not a QCOW2 image.');
    }
    const offset = Number(header.readBigUInt64BE(8));
    const capacity = header.readUInt32BE(16);
    if (!capacity || !Number.isSafeInteger(offset)) return null;
    const backing = Buffer.alloc(capacity);
    const backingBytes = fs.readSync(fd, backing, 0, capacity, offset);
    return backing.subarray(0, backingBytes).toString('utf8').replace(/\0.*$/, '');
  } finally {
    fs.closeSync(fd);
  }
}

function sameFilePath(left, right) {
  if (left.startsWith('nbd://') || right.startsWith('nbd://')) {
    return left === right;
  }
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function createRootOverlay(templatePath, backingPath, outputPath) {
  const image = fs.readFileSync(templatePath);
  if (image.length < 528 || image.readUInt32BE(0) !== 0x514649fb) {
    throw new Error('The persistent disk template is invalid.');
  }
  const backingOffset = Number(image.readBigUInt64BE(8));
  const capacity = image.readUInt32BE(16);
  const backing = Buffer.from(backingPath, 'utf8');
  if (!capacity || backingOffset + capacity > image.length) {
    throw new Error('The persistent disk template has no backing-file slot.');
  }
  if (backing.length > capacity) {
    throw new Error('The installation path is too long for the persistent disk template.');
  }
  image.writeUInt32BE(backing.length, 16);
  image.fill(0, backingOffset, backingOffset + capacity);
  backing.copy(image, backingOffset);
  fs.writeFileSync(outputPath, image, { flag: 'wx' });
}

function qemuEnvironment(paths) {
  const environment = {
    ...process.env,
    PATH: `${path.dirname(paths.qemu)}${path.delimiter}${process.env.PATH || ''}`,
    QEMU_DATADIR: paths.qemuData
  };
  if (process.platform === 'darwin') {
    const frameworkDir = path.join(path.dirname(paths.qemu), 'Frameworks');
    environment.DYLD_FRAMEWORK_PATH = [
      frameworkDir,
      process.env.DYLD_FRAMEWORK_PATH
    ].filter(Boolean).join(path.delimiter);
  }
  return environment;
}

function qemuArgs(paths, acceleration) {
  const vncPort = currentVncPort;
  const qmpPort = currentQmpPort;
  const tcg = acceleration === 'tcg';
  const accel = tcg
    ? 'tcg,thread=multi,tb-size=1024'
    : acceleration === 'whpx' ? 'whpx' : 'hvf';
  const cpu = tcg ? 'qemu64' : 'host';
  const cpuCount = tcg ? 2 : VM_CPUS;
  const memoryMb = tcg ? 2048 : VM_MEMORY_MB;
  const append = [
    'root=/dev/vda',
    'rootfstype=ext4',
    'rw',
    'console=tty0',
    'quiet',
    'splash'
  ].join(' ');

  return [
    '-name', 'Moli Linux',
    '-L', paths.qemuData,
    '-machine', 'q35',
    '-accel', accel,
    '-cpu', cpu,
    '-smp', String(cpuCount),
    '-m', String(memoryMb),
    '-kernel', paths.kernel,
    '-initrd', paths.initrd,
    '-append', append,
    '-drive', `file=${paths.rootDisk},if=virtio,format=qcow2,discard=unmap,cache=writeback`,
    '-drive', `file=${paths.dataDisk},if=none,id=moli-data,format=qcow2,discard=unmap,cache=writeback`,
    '-device', 'virtio-blk-pci,drive=moli-data,serial=MOLI-DATA',
    '-audiodev', process.platform === 'darwin'
      ? 'coreaudio,id=moli-audio'
      : 'dsound,id=moli-audio',
    '-device', 'intel-hda',
    '-device', 'hda-duplex,audiodev=moli-audio',
    '-device', 'virtio-vga,xres=1600,yres=900',
    '-device', 'qemu-xhci',
    '-device', 'usb-tablet',
    '-nic', 'user,model=virtio-net-pci',
    '-chardev', `socket,id=qga0,host=127.0.0.1,port=${currentQgaPort},server=on,wait=off`,
    '-device', 'virtio-serial-pci,id=virtio-serial0',
    '-device', 'virtserialport,chardev=qga0,name=org.qemu.guest_agent.0',
    '-rtc', 'base=localtime',
    '-display', 'none',
    '-vnc', `127.0.0.1:0,websocket=${vncPort}`,
    '-qmp', `tcp:127.0.0.1:${qmpPort},server=on,wait=off`,
    '-D', paths.qemuLog
  ];
}

async function launchQemu(paths) {
  currentVncPort = await freePort(57000, 57999);
  currentQmpPort = await freePort(58000, 58999);
  currentQgaPort = await freePort(59000, 59999);

  const candidates = process.env.MOLI_FORCE_TCG === '1'
    ? ['tcg']
    : (process.platform === 'darwin'
      ? (process.arch === 'x64' ? ['hvf', 'tcg'] : ['tcg'])
      : ['whpx', 'tcg']);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      status('boot', `Starting QEMU (${candidate === 'tcg' ? 'software acceleration' : candidate.toUpperCase()})...`);
      await spawnQemu(paths, candidate);
      qemuAcceleration = candidate;
      return;
    } catch (error) {
      lastError = error;
      await killQemu();
    }
  }
  throw lastError || new Error('QEMU failed to start');
}

function spawnQemu(paths, acceleration) {
  return new Promise((resolve, reject) => {
    const args = qemuArgs(paths, acceleration);
    const environment = qemuEnvironment(paths);

    const child = spawn(paths.qemu, args, {
      cwd: path.dirname(paths.qemu),
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    qemuProcess = child;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.stdout.on('data', (chunk) => console.log(`[qemu] ${chunk}`));
    child.stderr.on('data', (chunk) => console.error(`[qemu] ${chunk}`));
    child.once('error', fail);
    child.once('exit', (code, signal) => {
      qemuProcess = null;
      vmReady = false;
      guestDesktopReady = false;
      if (!shuttingDown) {
        send('vm:exit', { code, signal });
      }
      fail(new Error(`QEMU exited (${code ?? signal})`));
    });

    waitForTcp(currentVncPort, 12000)
      .then(async () => {
        if (settled || child.exitCode !== null) return;
        await waitForTcp(currentQmpPort, 3000).catch(() => {});
        await waitForWebSocket(currentVncPort, 6000).catch(() => {});
        settled = true;
        resolve();
      })
      .catch((error) => {
        child.kill();
        fail(error);
      });
  });
}

async function restartVm() {
  status('restart', 'Restarting Linux...');
  await shutdownGuest(2500);
  await killQemu();
  vmReady = false;
  guestDesktopReady = false;
  return startVm();
}

async function shutdownGuest(timeoutMs = 5000) {
  if (!qemuProcess) return;
  try {
    const socket = connectQmp(currentQmpPort);
    qmpSocket = socket;
    await onceData(socket, 2000);
    socket.write(JSON.stringify({ execute: 'qmp_capabilities' }) + '\r\n');
    await onceData(socket, 1000).catch(() => null);
    socket.write(JSON.stringify({ execute: 'system_powerdown' }) + '\r\n');
    await waitForExit(timeoutMs);
  } catch {
    // The process is force-stopped below.
  }
}

async function killQemu() {
  stopDesktopMonitor();
  if (!qemuProcess) return;
  const child = qemuProcess;
  qemuProcess = null;
  try {
    child.kill();
  } catch {
    // Already stopped.
  }
  await waitForExit(2500).catch(() => {});
}

function waitForExit(timeoutMs) {
  return new Promise((resolve) => {
    if (!qemuProcess) return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    qemuProcess.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function connectQmp(port) {
  return net.createConnection({ host: '127.0.0.1', port });
}

function onceData(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('QMP timeout')), timeoutMs);
    socket.once('data', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForTcp(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error(`Port ${port} did not become ready`));
        else setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

function waitForWebSocket(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryUpgrade = () => {
      let settled = false;
      const request = http.request({
        host: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
          'Sec-WebSocket-Protocol': 'binary'
        }
      });
      const retry = () => {
        if (settled) return;
        settled = true;
        request.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`VNC WebSocket ${port} did not become ready`));
        } else {
          setTimeout(tryUpgrade, 200);
        }
      };
      request.once('upgrade', (_response, socket) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve();
      });
      request.once('response', retry);
      request.once('error', retry);
      request.setTimeout(1200, retry);
      request.end();
    };
    tryUpgrade();
  });
}

function freePort(start, end) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > end) return reject(new Error('No local port is available'));
      const server = net.createServer();
      server.unref();
      server.on('error', () => tryPort(port + 1));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
    };
    tryPort(start + Math.floor(Math.random() * Math.max(1, end - start)));
  });
}

function stopDesktopMonitor() {
  if (desktopMonitorTimer) {
    clearInterval(desktopMonitorTimer);
    desktopMonitorTimer = null;
  }
  desktopMonitorBusy = false;
  desktopProbeStreak = 0;
}

function startDesktopMonitor(paths) {
  stopDesktopMonitor();
  desktopMonitorTimer = setInterval(async () => {
    if (!qemuProcess || desktopMonitorBusy) return;
    desktopMonitorBusy = true;
    try {
      const ready = await probeGuestDesktop(paths);
      desktopProbeStreak = ready ? desktopProbeStreak + 1 : 0;
      if (desktopProbeStreak >= 2) {
        guestDesktopReady = true;
        stopDesktopMonitor();
        status('desktop', 'Linux desktop is ready');
        send('vm:desktop');
        if (!dataDiskPrepared) {
          prepareGuestDataDisk()
            .then(() => {
              dataDiskPrepared = true;
              console.log('[vm:disk] Second Linux disk mounted at /home/user/Data');
            })
            .catch((error) => {
              console.warn('[vm:disk] Could not mount the second Linux disk:', error.message);
            });
        }
      }
    } catch {
      desktopProbeStreak = 0;
    } finally {
      desktopMonitorBusy = false;
    }
  }, 1500);
}

async function prepareGuestDataDisk() {
  const command = [
    'set -eu',
    'dev=/dev/vdb',
    'for i in $(seq 1 20); do [ -b "$dev" ] && break; sleep 0.5; done',
    '[ -b "$dev" ] || { echo "Data disk device /dev/vdb is missing" >&2; exit 1; }',
    'fs=$(blkid -p -o value -s TYPE "$dev" 2>/dev/null || true)',
    'if [ -z "$fs" ]; then',
    '  mkfs.ext4 -F -L MoliData "$dev" >/dev/null',
    'fi',
    'mkdir -p /home/user/Data',
    'if ! mountpoint -q /home/user/Data; then mount "$dev" /home/user/Data; fi',
    'uuid=$(blkid -p -o value -s UUID "$dev")',
    'if [ -n "$uuid" ]; then',
    '  sed -i "/# Moli Linux data disk/d" /etc/fstab',
    '  printf "UUID=%s /home/user/Data auto defaults,nofail,x-systemd.device-timeout=10 0 2 # Moli Linux data disk\\n" "$uuid" >> /etc/fstab',
    'fi',
    'chown user:user /home/user/Data',
    'runuser -u user -- mkdir -p /home/user/Desktop',
    'ln -sfn /home/user/Data /home/user/Desktop/Data',
    'chown -h user:user /home/user/Desktop/Data'
  ].join('\n');
  await qgaRun(command, 45000);
}

async function probeGuestDesktop(paths) {
  try {
    await qgaRun('pgrep -x plasmashell >/dev/null', 2500);
  } catch {
    return false;
  }
  try {
    await qmpRequest(currentQmpPort, 'screendump', { filename: paths.desktopProbe }, 6000);
    const image = readPpm(paths.desktopProbe);
    if (!image) return false;
    const probes = [
      { x: .98, y: .08, color: [38, 69, 87], tolerance: 18 },
      { x: .98, y: .50, color: [39, 103, 140], tolerance: 24 },
      { x: .50, y: .985, color: [33, 46, 53], tolerance: 20 }
    ];
    return probes.every((probe) => {
      const x = Math.max(0, Math.min(image.width - 1, Math.round(probe.x * (image.width - 1))));
      const y = Math.max(0, Math.min(image.height - 1, Math.round(probe.y * (image.height - 1))));
      const offset = image.dataOffset + (y * image.width + x) * 3;
      return Math.abs(image.buffer[offset] - probe.color[0])
        + Math.abs(image.buffer[offset + 1] - probe.color[1])
        + Math.abs(image.buffer[offset + 2] - probe.color[2]) <= probe.tolerance;
    });
  } catch {
    return false;
  }
}

function readPpm(filename) {
  const buffer = fs.readFileSync(filename);
  const state = { pos: 0 };
  const magic = readPpmToken(buffer, state);
  if (magic !== 'P6') return null;
  const width = Number(readPpmToken(buffer, state));
  const height = Number(readPpmToken(buffer, state));
  const maxValue = Number(readPpmToken(buffer, state));
  if (!width || !height || maxValue !== 255) return null;
  if (buffer[state.pos] === 13 && buffer[state.pos + 1] === 10) state.pos += 2;
  else state.pos += 1;
  const expected = width * height * 3;
  if (buffer.length - state.pos < expected) return null;
  return { buffer, width, height, dataOffset: state.pos };
}

function readPpmToken(buffer, state) {
  while (state.pos < buffer.length) {
    if (buffer[state.pos] === 35) {
      while (state.pos < buffer.length && buffer[state.pos] !== 10) state.pos += 1;
      continue;
    }
    if ([9, 10, 13, 32].includes(buffer[state.pos])) {
      state.pos += 1;
      continue;
    }
    break;
  }
  const start = state.pos;
  while (state.pos < buffer.length && ![9, 10, 13, 32].includes(buffer[state.pos])) {
    state.pos += 1;
  }
  return buffer.toString('ascii', start, state.pos);
}

function qmpRequest(port, command, arguments, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = connectQmp(port);
    let buffer = '';
    let stage = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('QMP probe timed out')), timeoutMs);

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const write = (message) => socket.write(JSON.stringify(message) + '\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.event) continue;
        if (stage === 0) {
          stage = 1;
          write({ execute: 'qmp_capabilities' });
        } else if (stage === 1) {
          if (message.error) {
            finish(new Error(message.error.desc || 'QMP capabilities failed'));
            return;
          }
          stage = 2;
          write(arguments === undefined
            ? { execute: command }
            : { execute: command, arguments });
        } else if (message.error) {
          finish(new Error(message.error.desc || 'QMP command failed'));
          return;
        } else if (Object.hasOwn(message, 'return')) {
          finish(null, message.return);
          return;
        }
      }
    });
    socket.once('error', (error) => finish(error));
    socket.once('close', () => {
      if (!settled) finish(new Error('QMP probe connection closed'));
    });
  });
}

function qgaRequest(command, arguments, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!currentQgaPort) {
      reject(new Error('Guest agent is not configured'));
      return;
    }
    const socket = net.createConnection({ host: '127.0.0.1', port: currentQgaPort });
    let buffer = '';
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Guest agent timed out')), timeoutMs);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    socket.on('connect', () => {
      const payload = { execute: command };
      if (arguments !== undefined) payload.arguments = arguments;
      socket.write(JSON.stringify(payload) + '\n');
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.error) {
          finish(new Error(message.error.desc || 'Guest agent command failed'));
          return;
        }
        if (Object.hasOwn(message, 'return')) {
          finish(null, message.return);
          return;
        }
      }
    });
    socket.once('error', (error) => finish(error));
    socket.once('close', () => {
      if (!settled) finish(new Error('Guest agent connection closed'));
    });
  });
}

async function qgaRun(command, timeoutMs = 30000) {
  const result = await qgaRequest('guest-exec', {
    path: '/bin/sh',
    arg: ['-c', command],
    'capture-output': true
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await qgaRequest('guest-exec-status', { pid: result.pid });
    if (status.exited) {
      if (status.exitcode !== 0) {
        const detail = Buffer.from(status['err-data'] || '', 'base64').toString('utf8').trim();
        throw new Error(detail || `Guest command exited with ${status.exitcode}`);
      }
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Guest command timed out');
}

function downloadFile(url, destination, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error('Too many download redirects'));
      return;
    }
    const client = url.startsWith('https:') ? https : http;
    const offset = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
    const options = { timeout: 30000 };
    if (offset > 0) options.headers = { Range: `bytes=${offset}-` };

    downloadRequest = client.get(url, options, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        downloadRequest = null;
        downloadFile(response.headers.location, destination, onProgress, redirects + 1)
          .then(resolve, reject);
        return;
      }
      if (response.statusCode === 416) {
        response.resume();
        downloadRequest = null;
        resolve();
        return;
      }
      if (response.statusCode !== 200 && response.statusCode !== 206) {
        response.resume();
        downloadRequest = null;
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      const append = response.statusCode === 206 && offset > 0;
      let total = Number(response.headers['content-length'] || 0);
      let received = append ? offset : 0;
      const rangeMatch = String(response.headers['content-range'] || '').match(/^bytes \d+-\d+\/(\d+)$/);
      if (rangeMatch) total = Number(rangeMatch[1]);
      else if (append) total += offset;
      const output = fs.createWriteStream(destination, { flags: append ? 'a' : 'w' });
      response.on('data', (chunk) => {
        received += chunk.length;
        onProgress(received, total);
      });
      response.pipe(output);
      output.on('finish', () => {
        downloadRequest = null;
        output.close(resolve);
      });
      output.on('error', (error) => {
        downloadRequest = null;
        reject(error);
      });
      response.on('error', (error) => {
        downloadRequest = null;
        reject(error);
      });
    });
    downloadRequest.on('timeout', () => downloadRequest.destroy(new Error('Download timed out')));
    downloadRequest.on('error', (error) => {
      downloadRequest = null;
      reject(error);
    });
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(file);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
    input.on('error', reject);
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
}

ipcMain.handle('vm:boot', () => startVm());
ipcMain.handle('vm:restart', () => restartVm());
ipcMain.handle('vm:desktop-ready', () => {
  return { ok: guestDesktopReady };
});
ipcMain.handle('vm:devtools', () => {
  return { ok: toggleDeveloperTools(), open: devToolsOpen };
});
ipcMain.handle('vm:language', async (_event, language) => {
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(String(language || ''))) {
    return { ok: false, error: 'Invalid language' };
  }
  try {
    const command =
      `uid=$(id -u user); ` +
      `sudo -u user env HOME=/home/user XDG_RUNTIME_DIR=/run/user/$uid ` +
      `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus ` +
      `/home/user/.local/bin/moli-language ${language}`;
    console.log('[language] switching to ' + language);
    await qgaRun(command, 60000);
    console.log('[language] switched to ' + language);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('vm:stop', async () => {
  shuttingDown = true;
  await shutdownGuest();
  await killQemu();
  guestDesktopReady = false;
  return { ok: true };
});
ipcMain.handle('vm:info', () => {
  const paths = appPaths();
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    resources: paths.resources,
    dataRoot: paths.dataRoot,
    iso: paths.iso,
    persistence: paths.rootDisk,
    dataDisk: paths.dataDisk,
    shareDir: paths.shareDir,
    acceleration: qemuAcceleration
  };
});

app.whenReady().then(() => {
  installMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async (event) => {
  if (shuttingDown || (!qemuProcess && !nbdServer)) return;
  event.preventDefault();
  shuttingDown = true;
  if (downloadRequest) downloadRequest.destroy();
  if (qemuProcess) {
    await shutdownGuest(2500);
    await killQemu();
  }
  await stopNbdServer();
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function stopNbdServer() {
  if (!nbdServer) return;
  const server = nbdServer;
  nbdServer = null;
  await server.stop();
}

