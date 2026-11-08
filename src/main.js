import RFB from '@novnc/novnc';

const screen = document.getElementById('screen');
const loading = document.getElementById('loading');
const statusText = document.getElementById('statusText');
const detailText = document.getElementById('detailText');
const progressBar = document.getElementById('progressBar');
const errorPanel = document.getElementById('errorPanel');
const errorText = document.getElementById('errorText');
const retryButton = document.getElementById('retryButton');
const connectionBadge = document.getElementById('connectionBadge');
const infoDialog = document.getElementById('infoDialog');
const infoList = document.getElementById('infoList');
const closeInfoButton = document.getElementById('closeInfoButton');
const restartButton = document.getElementById('restartButton');
const stopButton = document.getElementById('stopButton');
const languageSelect = document.getElementById('languageSelect');
const languagePicker = languageSelect.closest('.language-picker');
const errorTitle = document.getElementById('errorTitle');
const downloadHint = document.getElementById('downloadHint');
const dialogSubtitle = document.getElementById('dialogSubtitle');

const COPY = {
  en: {
    preparing: 'Preparing the Linux environment...',
    connecting: 'Connecting to the Linux desktop...',
    failedStart: 'Linux environment failed to start',
    failedEnd: 'Could not start Linux',
    disconnected: 'Linux desktop connection closed',
    connected: 'Connected · Details',
    firstDownload: 'Offline Debian image included · about 7.5 GB installed',
    tryAgain: 'Try again',
    detailsSubtitle: 'A real Debian virtual machine in a native window',
    restart: 'Restart Linux',
    shutdown: 'Shut down',
    downloading: 'Downloading the Debian 13 KDE image',
    verifying: 'Verifying the Debian image...',
    creatingDisk: 'Creating the persistent Linux disk...',
    booting: 'Starting the Linux kernel...',
    startingDesktop: 'Starting the Debian desktop...',
    ready: 'Linux desktop connected',
    restarting: 'Restarting Linux...',
    errorTitle: 'Linux environment failed to start',
    qemuExit: 'QEMU exited with code',
    version: 'Version',
    linux: 'Linux',
    host: 'Host system',
    virtualization: 'Virtualization',
    installDir: 'Application directory',
    dataDir: 'Data directory',
    disk: 'Persistent disk',
    shared: 'Shared folder',
    accelerationPending: 'Not started'
  },
  'zh-CN': {
    preparing: '正在准备 Linux 环境…',
    connecting: '正在连接 Linux 桌面…',
    failedStart: 'Linux 环境启动失败',
    failedEnd: 'Linux 未能启动',
    disconnected: 'Linux 桌面连接已断开',
    connected: '已连接 · 详情',
    firstDownload: '已内置离线 Debian 镜像 · 安装后约 7.5 GB',
    tryAgain: '重试',
    detailsSubtitle: '在原生窗口中运行的真实 Debian 虚拟机',
    restart: '重启 Linux',
    shutdown: '关闭 Linux',
    downloading: '正在下载 Debian 13 KDE 镜像',
    verifying: '正在校验 Debian 镜像…',
    creatingDisk: '正在创建 Linux 持久化磁盘…',
    booting: '正在启动 Linux 内核…',
    startingDesktop: '正在启动 Debian 桌面…',
    ready: 'Linux 桌面已连接',
    restarting: '正在重启 Linux…',
    errorTitle: 'Linux 环境启动失败',
    qemuExit: 'QEMU 已退出，代码',
    version: '版本',
    linux: 'Linux',
    host: '宿主系统',
    virtualization: '虚拟化',
    installDir: '安装目录',
    dataDir: '数据目录',
    disk: '持久化磁盘',
    shared: '共享文件夹',
    accelerationPending: '未启动'
  }
};

Object.assign(COPY, {
  ja: {
    preparing: 'Linux 環境を準備しています...',
    connecting: 'Linux デスクトップに接続しています...',
    connected: '接続済み · 詳細',
    tryAgain: '再試行',
    detailsSubtitle: 'ネイティブウィンドウで動作する実際の Debian 仮想マシン',
    restart: 'Linux を再起動',
    shutdown: 'シャットダウン',
    version: 'バージョン',
    host: 'ホストシステム',
    virtualization: '仮想化',
    installDir: 'アプリケーションディレクトリ',
    dataDir: 'データディレクトリ',
    disk: '永続ディスク',
    shared: '共有フォルダー',
    accelerationPending: '未起動'
  },
  ko: {
    preparing: 'Linux 환경을 준비하는 중...',
    connecting: 'Linux 데스크톱에 연결하는 중...',
    connected: '연결됨 · 세부 정보',
    tryAgain: '다시 시도',
    detailsSubtitle: '네이티브 창에서 실행되는 실제 Debian 가상 머신',
    restart: 'Linux 다시 시작',
    shutdown: '종료',
    version: '버전',
    host: '호스트 시스템',
    virtualization: '가상화',
    installDir: '애플리케이션 디렉터리',
    dataDir: '데이터 디렉터리',
    disk: '영구 디스크',
    shared: '공유 폴더',
    accelerationPending: '시작되지 않음'
  },
  es: {
    preparing: 'Preparando el entorno Linux...',
    connecting: 'Conectando con el escritorio Linux...',
    connected: 'Conectado · Detalles',
    tryAgain: 'Reintentar',
    detailsSubtitle: 'Una máquina virtual Debian real en una ventana nativa',
    restart: 'Reiniciar Linux',
    shutdown: 'Apagar',
    version: 'Versión',
    host: 'Sistema anfitrión',
    virtualization: 'Virtualización',
    installDir: 'Directorio de la aplicación',
    dataDir: 'Directorio de datos',
    disk: 'Disco persistente',
    shared: 'Carpeta compartida',
    accelerationPending: 'No iniciado'
  },
  fr: {
    preparing: 'Préparation de l’environnement Linux...',
    connecting: 'Connexion au bureau Linux...',
    connected: 'Connecté · Détails',
    tryAgain: 'Réessayer',
    detailsSubtitle: 'Une véritable machine virtuelle Debian dans une fenêtre native',
    restart: 'Redémarrer Linux',
    shutdown: 'Arrêter',
    version: 'Version',
    host: 'Système hôte',
    virtualization: 'Virtualisation',
    installDir: 'Dossier de l’application',
    dataDir: 'Dossier des données',
    disk: 'Disque persistant',
    shared: 'Dossier partagé',
    accelerationPending: 'Non démarré'
  },
  de: {
    preparing: 'Linux-Umgebung wird vorbereitet...',
    connecting: 'Verbindung zum Linux-Desktop...',
    connected: 'Verbunden · Details',
    tryAgain: 'Erneut versuchen',
    detailsSubtitle: 'Eine echte Debian-VM in einem nativen Fenster',
    restart: 'Linux neu starten',
    shutdown: 'Herunterfahren',
    version: 'Version',
    host: 'Hostsystem',
    virtualization: 'Virtualisierung',
    installDir: 'Anwendungsverzeichnis',
    dataDir: 'Datenverzeichnis',
    disk: 'Persistente Festplatte',
    shared: 'Freigegebener Ordner',
    accelerationPending: 'Nicht gestartet'
  },
  'pt-BR': {
    preparing: 'Preparando o ambiente Linux...',
    connecting: 'Conectando à área de trabalho Linux...',
    connected: 'Conectado · Detalhes',
    tryAgain: 'Tentar novamente',
    detailsSubtitle: 'Uma máquina virtual Debian real em uma janela nativa',
    restart: 'Reiniciar o Linux',
    shutdown: 'Desligar',
    version: 'Versão',
    host: 'Sistema hospedeiro',
    virtualization: 'Virtualização',
    installDir: 'Diretório do aplicativo',
    dataDir: 'Diretório de dados',
    disk: 'Disco persistente',
    shared: 'Pasta compartilhada',
    accelerationPending: 'Não iniciado'
  },
  ru: {
    preparing: 'Подготовка среды Linux...',
    connecting: 'Подключение к рабочему столу Linux...',
    connected: 'Подключено · Сведения',
    tryAgain: 'Повторить',
    detailsSubtitle: 'Настоящая виртуальная машина Debian в отдельном окне',
    restart: 'Перезапустить Linux',
    shutdown: 'Завершить работу',
    version: 'Версия',
    host: 'Хост-система',
    virtualization: 'Виртуализация',
    installDir: 'Каталог приложения',
    dataDir: 'Каталог данных',
    disk: 'Постоянный диск',
    shared: 'Общая папка',
    accelerationPending: 'Не запущено'
  },
  ar: {
    preparing: 'جارٍ تجهيز بيئة Linux...',
    connecting: 'جارٍ الاتصال بسطح مكتب Linux...',
    connected: 'متصل · التفاصيل',
    tryAgain: 'إعادة المحاولة',
    detailsSubtitle: 'آلة Debian افتراضية حقيقية داخل نافذة أصلية',
    restart: 'إعادة تشغيل Linux',
    shutdown: 'إيقاف التشغيل',
    version: 'الإصدار',
    host: 'نظام المضيف',
    virtualization: 'المحاكاة الافتراضية',
    installDir: 'دليل التطبيق',
    dataDir: 'دليل البيانات',
    disk: 'القرص الدائم',
    shared: 'المجلد المشترك',
    accelerationPending: 'لم يبدأ'
  },
  hi: {
    preparing: 'Linux वातावरण तैयार किया जा रहा है...',
    connecting: 'Linux डेस्कटॉप से कनेक्ट किया जा रहा है...',
    connected: 'कनेक्टेड · विवरण',
    tryAgain: 'फिर प्रयास करें',
    detailsSubtitle: 'नेटिव विंडो में असली Debian वर्चुअल मशीन',
    restart: 'Linux पुनः प्रारंभ करें',
    shutdown: 'शट डाउन',
    version: 'संस्करण',
    host: 'होस्ट सिस्टम',
    virtualization: 'वर्चुअलाइज़ेशन',
    installDir: 'एप्लिकेशन निर्देशिका',
    dataDir: 'डेटा निर्देशिका',
    disk: 'स्थायी डिस्क',
    shared: 'साझा फ़ोल्डर',
    accelerationPending: 'प्रारंभ नहीं हुआ'
  },
  tr: {
    preparing: 'Linux ortamı hazırlanıyor...',
    connecting: 'Linux masaüstüne bağlanılıyor...',
    connected: 'Bağlandı · Ayrıntılar',
    tryAgain: 'Tekrar dene',
    detailsSubtitle: 'Yerel pencerede çalışan gerçek bir Debian sanal makinesi',
    restart: 'Linux’u yeniden başlat',
    shutdown: 'Kapat',
    version: 'Sürüm',
    host: 'Ana sistem',
    virtualization: 'Sanallaştırma',
    installDir: 'Uygulama dizini',
    dataDir: 'Veri dizini',
    disk: 'Kalıcı disk',
    shared: 'Paylaşılan klasör',
    accelerationPending: 'Başlatılmadı'
  },
  id: {
    preparing: 'Menyiapkan lingkungan Linux...',
    connecting: 'Menghubungkan ke desktop Linux...',
    connected: 'Terhubung · Detail',
    tryAgain: 'Coba lagi',
    detailsSubtitle: 'Mesin virtual Debian asli dalam jendela native',
    restart: 'Mulai ulang Linux',
    shutdown: 'Matikan',
    version: 'Versi',
    host: 'Sistem host',
    virtualization: 'Virtualisasi',
    installDir: 'Direktori aplikasi',
    dataDir: 'Direktori data',
    disk: 'Disk persisten',
    shared: 'Folder bersama',
    accelerationPending: 'Belum dimulai'
  },
  vi: {
    preparing: 'Đang chuẩn bị môi trường Linux...',
    connecting: 'Đang kết nối tới màn hình Linux...',
    connected: 'Đã kết nối · Chi tiết',
    tryAgain: 'Thử lại',
    detailsSubtitle: 'Máy ảo Debian thật trong một cửa sổ gốc',
    restart: 'Khởi động lại Linux',
    shutdown: 'Tắt máy',
    version: 'Phiên bản',
    host: 'Hệ thống máy chủ',
    virtualization: 'Ảo hóa',
    installDir: 'Thư mục ứng dụng',
    dataDir: 'Thư mục dữ liệu',
    disk: 'Đĩa lưu trữ',
    shared: 'Thư mục chia sẻ',
    accelerationPending: 'Chưa khởi động'
  },
  th: {
    preparing: 'กำลังเตรียมสภาพแวดล้อม Linux...',
    connecting: 'กำลังเชื่อมต่อเดสก์ท็อป Linux...',
    connected: 'เชื่อมต่อแล้ว · รายละเอียด',
    tryAgain: 'ลองอีกครั้ง',
    detailsSubtitle: 'เครื่องเสมือน Debian จริงในหน้าต่างเนทีฟ',
    restart: 'รีสตาร์ท Linux',
    shutdown: 'ปิดเครื่อง',
    version: 'เวอร์ชัน',
    host: 'ระบบโฮสต์',
    virtualization: 'การจำลองเสมือน',
    installDir: 'ไดเรกทอรีแอป',
    dataDir: 'ไดเรกทอรีข้อมูล',
    disk: 'ดิสก์แบบถาวร',
    shared: 'โฟลเดอร์ที่แชร์',
    accelerationPending: 'ยังไม่เริ่ม'
  },
  it: {
    preparing: 'Preparazione dell’ambiente Linux...',
    connecting: 'Connessione al desktop Linux...',
    connected: 'Connesso · Dettagli',
    tryAgain: 'Riprova',
    detailsSubtitle: 'Una vera macchina virtuale Debian in una finestra nativa',
    restart: 'Riavvia Linux',
    shutdown: 'Spegni',
    version: 'Versione',
    host: 'Sistema host',
    virtualization: 'Virtualizzazione',
    installDir: 'Directory dell’applicazione',
    dataDir: 'Directory dei dati',
    disk: 'Disco persistente',
    shared: 'Cartella condivisa',
    accelerationPending: 'Non avviato'
  },
  nl: {
    preparing: 'Linux-omgeving voorbereiden...',
    connecting: 'Verbinden met Linux-bureaublad...',
    connected: 'Verbonden · Details',
    tryAgain: 'Opnieuw proberen',
    detailsSubtitle: 'Een echte Debian-virtuele machine in een native venster',
    restart: 'Linux opnieuw starten',
    shutdown: 'Afsluiten',
    version: 'Versie',
    host: 'Hostsysteem',
    virtualization: 'Virtualisatie',
    installDir: 'Toepassingsmap',
    dataDir: 'Gegevensmap',
    disk: 'Permanente schijf',
    shared: 'Gedeelde map',
    accelerationPending: 'Niet gestart'
  },
  pl: {
    preparing: 'Przygotowywanie środowiska Linux...',
    connecting: 'Łączenie z pulpitem Linux...',
    connected: 'Połączono · Szczegóły',
    tryAgain: 'Spróbuj ponownie',
    detailsSubtitle: 'Prawdziwa maszyna wirtualna Debian w natywnym oknie',
    restart: 'Uruchom ponownie Linux',
    shutdown: 'Wyłącz',
    version: 'Wersja',
    host: 'System hosta',
    virtualization: 'Wirtualizacja',
    installDir: 'Katalog aplikacji',
    dataDir: 'Katalog danych',
    disk: 'Dysk trwały',
    shared: 'Folder udostępniony',
    accelerationPending: 'Nie uruchomiono'
  },
  uk: {
    preparing: 'Підготовка середовища Linux...',
    connecting: 'Підключення до робочого столу Linux...',
    connected: 'Підключено · Деталі',
    tryAgain: 'Повторити',
    detailsSubtitle: 'Справжня віртуальна машина Debian у власному вікні',
    restart: 'Перезапустити Linux',
    shutdown: 'Завершити роботу',
    version: 'Версія',
    host: 'Система хоста',
    virtualization: 'Віртуалізація',
    installDir: 'Каталог програми',
    dataDir: 'Каталог даних',
    disk: 'Постійний диск',
    shared: 'Спільна папка',
    accelerationPending: 'Не запущено'
  },
  fa: {
    preparing: 'در حال آماده‌سازی محیط Linux...',
    connecting: 'در حال اتصال به میزکار Linux...',
    connected: 'متصل · جزئیات',
    tryAgain: 'تلاش دوباره',
    detailsSubtitle: 'یک ماشین مجازی واقعی Debian در پنجره بومی',
    restart: 'راه‌اندازی مجدد Linux',
    shutdown: 'خاموش کردن',
    version: 'نسخه',
    host: 'سیستم میزبان',
    virtualization: 'مجازی‌سازی',
    installDir: 'پوشه برنامه',
    dataDir: 'پوشه داده',
    disk: 'دیسک ماندگار',
    shared: 'پوشه اشتراکی',
    accelerationPending: 'شروع نشده'
  }
});

const LANGUAGE_CODES = [
  'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt-BR',
  'ru', 'ar', 'hi', 'bn', 'fa', 'tr', 'nl', 'pl', 'uk', 'vi', 'th', 'id',
  'ms', 'sv', 'no', 'da', 'fi', 'cs', 'sk', 'hu', 'ro', 'el', 'he', 'sw',
  'fil',
  ...`aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca
  ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr
  fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it
  iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt
  lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj
  om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so
  sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz
  ve vi vo wa wo xh yi yo za zh zu`.split(/\s+/)
].filter((code, index, codes) => code && codes.indexOf(code) === index);

let language = localStorage.getItem('moli-language') || 'en';
if (!LANGUAGE_CODES.includes(language)) language = 'en';
let lastStatus = null;
let lastDownload = null;

const bridge = window.moli || {
  boot: async () => ({ ok: false, error: 'The Electron bridge is unavailable in this preview.' }),
  desktopReady: async () => ({ ok: true }),
  setLanguage: async () => ({ ok: false }),
  restart: async () => {},
  stop: async () => {},
  info: async () => ({
    appVersion: '1.0.0',
    platform: 'preview',
    arch: 'x64',
    acceleration: 'preview',
    resources: 'resources',
    dataRoot: 'userData',
    persistence: 'persistence.qcow2',
    dataDisk: 'data.qcow2',
    shareDir: 'MoliLinuxShare'
  }),
  onStatus: () => {},
  onDownload: () => {},
  onReady: () => {},
  onDesktopReady: () => {},
  onError: () => {},
  onExit: () => {}
};

let rfb = null;
let connected = false;
let desktopReadyTimer = null;
let desktopSignalReceived = false;
let desktopReadyShown = false;
let displayPort = null;
let displayRetryTimer = null;
let displayRetryCount = 0;

function t(key) {
  return COPY[language]?.[key] || COPY.en[key] || key;
}

function languageName(code) {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

function populateLanguageOptions() {
  const options = LANGUAGE_CODES.map((code) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = languageName(code);
    return option;
  });
  languageSelect.replaceChildren(...options);
}

function showLanguagePicker() {
  languagePicker.classList.add('is-visible');
  connectionBadge.hidden = false;
}

function hideLanguagePicker() {
  languagePicker.classList.remove('is-visible');
}

function stopDisplayRetry() {
  if (!displayRetryTimer) return;
  clearTimeout(displayRetryTimer);
  displayRetryTimer = null;
}

function stopDesktopReadyMonitor() {
  if (desktopReadyTimer) {
    clearInterval(desktopReadyTimer);
    desktopReadyTimer = null;
  }
}

function startDesktopReadyPoll() {
  stopDesktopReadyMonitor();
  desktopReadyTimer = setInterval(async () => {
    if (!connected || desktopReadyShown) {
      stopDesktopReadyMonitor();
      return;
    }
    try {
      const result = await bridge.desktopReady?.();
      if (result?.ok) {
        desktopSignalReceived = true;
        finishDesktopReady();
      }
    } catch {
      // The guest agent can briefly disappear while the desktop starts.
    }
  }, 1000);
}

function finishDesktopReady() {
  if (desktopReadyShown) return;
  desktopReadyShown = true;
  stopDesktopReadyMonitor();
  setProgress(1);
  statusText.textContent = t('ready');
  hideLoading();
  showLanguagePicker();
  bridge.desktopReady?.();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
}

function renderStatus(payload) {
  if (!payload) return;
  lastStatus = payload;
  if (language === 'zh-CN') {
    const localized = {
      verify: t('verifying'),
      disk: t('creatingDisk'),
      boot: t('booting'),
      display: t('startingDesktop'),
      ready: t('ready'),
      restart: t('restarting')
    }[payload.stage];
    statusText.textContent = localized || payload.message;
  } else {
    statusText.textContent = payload.message;
  }
  if (payload.stage === 'desktop') {
    desktopSignalReceived = true;
    if (connected) finishDesktopReady();
  }
}

function renderDownload(payload) {
  if (!payload) return;
  lastDownload = payload;
  const progressText = payload.total > 0
    ? `${formatBytes(payload.received)} / ${formatBytes(payload.total)}`
    : formatBytes(payload.received);
  statusText.textContent = `${t('downloading')} · ${progressText}`;
  if (payload.progress > 0) setProgress(.08 + payload.progress * .7);
}

function applyLanguage() {
  document.documentElement.lang = language;
  languageSelect.value = language;
  errorTitle.textContent = t('errorTitle');
  downloadHint.textContent = t('firstDownload');
  retryButton.textContent = t('tryAgain');
  connectionBadge.textContent = t('connected');
  dialogSubtitle.textContent = t('detailsSubtitle');
  restartButton.textContent = t('restart');
  stopButton.textContent = t('shutdown');
  if (lastDownload) renderDownload(lastDownload);
  else if (lastStatus) renderStatus(lastStatus);
  else statusText.textContent = t('preparing');
  if (desktopReadyShown) statusText.textContent = t('ready');
}

function setProgress(progress) {
  const percent = Math.max(3, Math.min(100, Math.round(progress * 100)));
  progressBar.style.width = `${percent}%`;
}

function showError(message) {
  errorPanel.hidden = false;
  errorText.textContent = message;
  statusText.textContent = t('failedEnd');
}

function hideLoading() {
  loading.classList.add('is-hidden');
}

function connectDisplay(port) {
  displayPort = port;
  displayRetryCount = 0;
  stopDisplayRetry();
  openDisplay();
}

function openDisplay() {
  const port = displayPort;
  if (!port) return;
  if (rfb) {
    const previous = rfb;
    rfb = null;
    previous.disconnect();
  }
  stopDesktopReadyMonitor();
  hideLanguagePicker();
  connected = false;
  desktopReadyShown = false;
  statusText.textContent = t('connecting');
  setProgress(.96);
  const connection = new RFB(screen, `ws://127.0.0.1:${port}`, {
    credentials: { password: '' }
  });
  rfb = connection;
  connection.scaleViewport = true;
  connection.qualityLevel = 9;
  connection.compressionLevel = 2;
  // QEMU does not always re-layout the guest desktop after SetDesktopSize.
  // Keep the guest resolution fixed and scale the framebuffer locally instead.
  connection.resizeSession = false;
  connection.focusOnClick = true;
  connection.clipViewport = false;

  connection.addEventListener('connect', () => {
    if (rfb !== connection) return;
    connected = true;
    setProgress(.96);
    statusText.textContent = t('startingDesktop');
    if (desktopSignalReceived) finishDesktopReady();
    else startDesktopReadyPoll();
  });
  connection.addEventListener('disconnect', () => {
    if (rfb !== connection) return;
    const wasReady = desktopReadyShown;
    connected = false;
    desktopReadyShown = false;
    stopDesktopReadyMonitor();
    if (!wasReady && displayPort && displayRetryCount < 12) {
      displayRetryCount += 1;
      statusText.textContent = t('connecting');
      setProgress(.96);
      displayRetryTimer = setTimeout(openDisplay, 1000);
      return;
    }
    hideLanguagePicker();
    connectionBadge.hidden = true;
    if (!loading.classList.contains('is-hidden')) return;
    loading.classList.remove('is-hidden');
    statusText.textContent = t('disconnected');
    setProgress(.1);
  });
  connection.addEventListener('securityfailure', (event) => {
    if (rfb !== connection) return;
    displayPort = null;
    stopDisplayRetry();
    showError(event.detail?.reason || 'VNC authentication failed');
  });
}

async function boot() {
  errorPanel.hidden = true;
  stopDesktopReadyMonitor();
  stopDisplayRetry();
  hideLanguagePicker();
  desktopSignalReceived = false;
  desktopReadyShown = false;
  loading.classList.remove('is-hidden');
  connectionBadge.hidden = true;
  setProgress(.04);
  statusText.textContent = t('preparing');
  detailText.textContent = '';
  const result = await bridge.boot();
  if (!result?.ok) {
    showError(result?.error || 'Unknown error');
  }
}

async function openInfo() {
  const info = await bridge.info();
  const rows = [
    [t('version'), info.appVersion],
    [t('linux'), 'Debian 13 KDE'],
    [t('host'), `${info.platform} ${info.arch}`],
    [t('virtualization'), info.acceleration || t('accelerationPending')],
    [t('installDir'), info.resources],
    [t('dataDir'), info.dataRoot],
    [t('disk'), `${info.persistence}\n${info.dataDisk}`],
    [t('shared'), info.shareDir]
  ];
  infoList.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    infoList.append(dt, dd);
  }
  infoDialog.showModal();
}

bridge.onStatus((payload) => {
  renderStatus(payload);
  if (payload.stage === 'download' && typeof payload.progress === 'number') {
    setProgress(.08 + payload.progress * .7);
  } else if (payload.stage === 'verify') {
    setProgress(.82);
  } else if (payload.stage === 'disk') {
    setProgress(.86);
  } else if (payload.stage === 'boot') {
    setProgress(.9);
  } else if (payload.stage === 'display') {
    setProgress(.94);
  } else if (payload.stage === 'ready') {
    setProgress(1);
  }
});

bridge.onDownload((payload) => {
  renderDownload(payload);
});

bridge.onReady((payload) => {
  const label = language === 'zh-CN' ? '虚拟化' : 'Virtualization';
  detailText.textContent = payload.acceleration
    ? `${label}: ${payload.acceleration.toUpperCase()}`
    : '';
  connectDisplay(payload.port);
});

bridge.onDesktopReady(() => {
  desktopSignalReceived = true;
  if (connected) finishDesktopReady();
});

bridge.onError((payload) => {
  showError(payload.message);
});

bridge.onExit((payload) => {
  if (connected) return;
  showError(`${t('qemuExit')} ${payload.code ?? payload.signal ?? 'unknown'}`);
});

retryButton.addEventListener('click', boot);
connectionBadge.addEventListener('click', openInfo);
closeInfoButton.addEventListener('click', () => infoDialog.close());
restartButton.addEventListener('click', async () => {
  infoDialog.close();
  loading.classList.remove('is-hidden');
  setProgress(.12);
  statusText.textContent = t('restarting');
  await bridge.restart();
});
stopButton.addEventListener('click', async () => {
  infoDialog.close();
  await bridge.stop();
  window.close();
});

populateLanguageOptions();

languageSelect.addEventListener('change', async () => {
  language = LANGUAGE_CODES.includes(languageSelect.value) ? languageSelect.value : 'en';
  localStorage.setItem('moli-language', language);
  applyLanguage();
  const result = await bridge.setLanguage?.(language);
  if (result && !result.ok) {
    console.error('[language] switch failed', result.error);
  }
});

applyLanguage();

window.__moliSmoke = () => ({
  ok: Boolean(
    document.title === 'Moli Linux'
    && screen
    && loading
    && progressBar
    && bridge
    && languageSelect.options.length >= 180
    && !languagePicker.classList.contains('is-visible')
  ),
  title: document.title,
  loadingVisible: !loading.classList.contains('is-hidden'),
  bootBridge: typeof bridge?.boot === 'function',
  languageCount: languageSelect.options.length,
  languagePickerHidden: !languagePicker.classList.contains('is-visible')
});

if (new URLSearchParams(location.search).get('smoke') !== '1') {
  boot();
}

