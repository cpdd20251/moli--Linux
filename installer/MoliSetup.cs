using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Moli Linux Setup")]
[assembly: AssemblyDescription("Installer for Moli Linux")]
[assembly: AssemblyProduct("Moli Linux")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace MoliSetup
{
    internal static class Program
    {
        internal const string UninstallKey =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MoliLinux";

        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (HasArgument(args, "--remove-dir"))
            {
                RemoveInstallDirectory(args);
                return;
            }

            if (HasArgument(args, "--uninstall"))
            {
                RunUninstaller(HasArgument(args, "--quiet"));
                return;
            }

            Application.Run(new SetupForm(args));
        }

        internal static bool HasArgument(string[] args, string expected)
        {
            for (int index = 0; index < args.Length; index++)
            {
                if (string.Equals(args[index], expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        internal static string ArgumentValue(string[] args, string name)
        {
            for (int index = 0; index + 1 < args.Length; index++)
            {
                if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                {
                    return args[index + 1];
                }
            }
            return null;
        }

        internal static string ReadInstallLocation()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
            {
                if (key == null)
                {
                    return null;
                }
                return key.GetValue("InstallLocation") as string;
            }
        }

        private static void RunUninstaller(bool quiet)
        {
            string installDirectory = ReadInstallLocation();
            if (string.IsNullOrWhiteSpace(installDirectory))
            {
                installDirectory = Path.GetDirectoryName(Application.ExecutablePath);
            }
            installDirectory = Path.GetFullPath(installDirectory);

            if (!quiet)
            {
                DialogResult answer = MessageBox.Show(
                    "Remove Moli Linux from this computer?\r\n\r\n"
                    + "Your Debian files remain in the Moli Linux application data folder.",
                    "Uninstall Moli Linux",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2);
                if (answer != DialogResult.Yes)
                {
                    return;
                }
            }

            try
            {
                StopInstalledApplication();
                DeleteShortcut(Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "Moli Linux.lnk"));
                DeleteShortcut(Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                    "Moli Linux.lnk"));
                Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);

                string temporaryDirectory = Path.Combine(
                    Path.GetTempPath(),
                    "MoliLinuxUninstall-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(temporaryDirectory);
                string copiedUninstaller = Path.Combine(temporaryDirectory, "MoliUninstall.exe");
                File.Copy(Application.ExecutablePath, copiedUninstaller, true);

                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = copiedUninstaller;
                startInfo.Arguments =
                    "--remove-dir \"" + installDirectory + "\" --wait-pid "
                    + Process.GetCurrentProcess().Id;
                startInfo.UseShellExecute = false;
                startInfo.CreateNoWindow = true;
                startInfo.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(startInfo);
            }
            catch (Exception error)
            {
                if (!quiet)
                {
                    MessageBox.Show(
                        "Moli Linux could not be removed.\r\n\r\n" + error.Message,
                        "Uninstall Moli Linux",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
            }
        }

        private static void StopInstalledApplication()
        {
            Process[] processes = Process.GetProcessesByName("Moli Linux");
            for (int index = 0; index < processes.Length; index++)
            {
                try
                {
                    processes[index].CloseMainWindow();
                    if (!processes[index].WaitForExit(5000))
                    {
                        processes[index].Kill();
                    }
                }
                catch
                {
                    // A process may exit between enumeration and shutdown.
                }
                finally
                {
                    processes[index].Dispose();
                }
            }
            Thread.Sleep(700);
        }

        private static void DeleteShortcut(string filename)
        {
            try
            {
                if (File.Exists(filename))
                {
                    File.Delete(filename);
                }
            }
            catch
            {
                // Shortcut cleanup is best effort.
            }
        }

        private static void RemoveInstallDirectory(string[] args)
        {
            int waitProcessId;
            if (int.TryParse(ArgumentValue(args, "--wait-pid"), out waitProcessId))
            {
                try
                {
                    Process parent = Process.GetProcessById(waitProcessId);
                    parent.WaitForExit(15000);
                    parent.Dispose();
                }
                catch
                {
                }
            }

            string target = ArgumentValue(args, "--remove-dir");
            if (string.IsNullOrWhiteSpace(target))
            {
                return;
            }

            target = Path.GetFullPath(target);
            for (int attempt = 0; attempt < 30; attempt++)
            {
                try
                {
                    if (Directory.Exists(target))
                    {
                        Directory.Delete(target, true);
                    }
                    break;
                }
                catch
                {
                    Thread.Sleep(500);
                }
            }

            string cleanupCommand =
                "/c ping 127.0.0.1 -n 3 >nul & del /f /q \""
                + Application.ExecutablePath + "\"";
            try
            {
                ProcessStartInfo cleanup = new ProcessStartInfo("cmd.exe", cleanupCommand);
                cleanup.UseShellExecute = false;
                cleanup.CreateNoWindow = true;
                cleanup.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(cleanup);
            }
            catch
            {
            }
        }
    }

    internal sealed class SetupForm : Form
    {
        private const string VersionTag = "1.0.0";
        private const int ExpectedPayloadPartCount = 4;
        private const long DownloadAndInstallSpace = 18L * 1024L * 1024L * 1024L;

        private readonly Color Background = Color.FromArgb(7, 23, 26);
        private readonly Color PanelColor = Color.FromArgb(15, 42, 47);
        private readonly Color Accent = Color.FromArgb(91, 214, 164);
        private readonly Color Muted = Color.FromArgb(168, 191, 190);

        private readonly TextBox pathBox;
        private readonly Label payloadLabel;
        private readonly Label statusLabel;
        private readonly ProgressBar progressBar;
        private readonly Button installButton;
        private readonly CheckBox launchCheckBox;
        private readonly string releaseBaseUrl;
        private string firstPayloadPart;
        private string[] payloadParts;
        private long payloadBytes;
        private bool payloadDownloaded;

        internal SetupForm(string[] args)
        {
            Text = "Moli Linux Setup";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            ClientSize = new Size(720, 440);
            BackColor = Background;
            ForeColor = Color.White;
            Font = new Font("Segoe UI", 9F);
            AutoScaleMode = AutoScaleMode.Dpi;

            try
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
            }

            releaseBaseUrl = FindReleaseBaseUrl();
            payloadParts = FindPayloadParts(out firstPayloadPart, out payloadBytes);
            if (payloadParts.Length > 0 && payloadParts.Length != ExpectedPayloadPartCount)
            {
                payloadParts = new string[0];
                firstPayloadPart = null;
                payloadBytes = 0;
            }

            Panel header = new Panel();
            header.Bounds = new Rectangle(0, 0, ClientSize.Width, 112);
            header.BackColor = PanelColor;
            Controls.Add(header);

            Label title = new Label();
            title.Text = "Moli Linux";
            title.Font = new Font("Segoe UI Semibold", 25F, FontStyle.Bold);
            title.ForeColor = Color.White;
            title.AutoSize = true;
            title.Location = new Point(34, 22);
            header.Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "Debian 13 · KDE Plasma · a real Linux workspace in a Windows application";
            subtitle.Font = new Font("Segoe UI", 10F);
            subtitle.ForeColor = Muted;
            subtitle.AutoSize = true;
            subtitle.Location = new Point(37, 70);
            header.Controls.Add(subtitle);

            Label locationLabel = new Label();
            locationLabel.Text = "Install location";
            locationLabel.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
            locationLabel.ForeColor = Color.White;
            locationLabel.AutoSize = true;
            locationLabel.Location = new Point(36, 142);
            Controls.Add(locationLabel);

            pathBox = new TextBox();
            string requestedDirectory = Program.ArgumentValue(args, "--install-dir");
            pathBox.Text = string.IsNullOrWhiteSpace(requestedDirectory)
                ? DefaultInstallDirectory()
                : requestedDirectory;
            pathBox.Bounds = new Rectangle(36, 168, 532, 30);
            pathBox.BackColor = Color.FromArgb(239, 246, 244);
            pathBox.ForeColor = Color.FromArgb(12, 38, 40);
            Controls.Add(pathBox);

            Button browseButton = new Button();
            browseButton.Text = "&Browse...";
            browseButton.Bounds = new Rectangle(580, 167, 104, 32);
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.FlatAppearance.BorderColor = Color.FromArgb(63, 103, 104);
            browseButton.BackColor = PanelColor;
            browseButton.ForeColor = Color.White;
            browseButton.Click += BrowseButtonClick;
            Controls.Add(browseButton);

            payloadLabel = new Label();
            payloadLabel.Text = PayloadDescription();
            payloadLabel.ForeColor = CanInstall() ? Muted : Color.FromArgb(255, 142, 135);
            payloadLabel.AutoSize = true;
            payloadLabel.Location = new Point(36, 214);
            Controls.Add(payloadLabel);

            Label details = new Label();
            details.Text =
                "The Linux desktop and development tools are installed locally. "
                + "No administrator password is required.\r\n"
                + "Disk use: about 7.5 GB. Persistent changes use a copy-on-write disk.";
            details.ForeColor = Muted;
            details.AutoSize = true;
            details.Location = new Point(36, 246);
            Controls.Add(details);

            progressBar = new ProgressBar();
            progressBar.Bounds = new Rectangle(36, 306, 648, 14);
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Style = ProgressBarStyle.Continuous;
            Controls.Add(progressBar);

            statusLabel = new Label();
            statusLabel.Text = payloadParts.Length > 0
                ? "Ready to install"
                : (!string.IsNullOrEmpty(releaseBaseUrl)
                    ? "Ready to download and install"
                    : "Place all payload parts beside this installer and run it again.");
            statusLabel.ForeColor = Color.White;
            statusLabel.AutoSize = true;
            statusLabel.Location = new Point(36, 330);
            Controls.Add(statusLabel);

            launchCheckBox = new CheckBox();
            launchCheckBox.Text = "&Launch Moli Linux after installation";
            launchCheckBox.Checked = !Program.HasArgument(args, "--no-launch");
            launchCheckBox.ForeColor = Muted;
            launchCheckBox.AutoSize = true;
            launchCheckBox.Location = new Point(36, 368);
            Controls.Add(launchCheckBox);

            Button cancelButton = new Button();
            cancelButton.Text = "&Cancel";
            cancelButton.Bounds = new Rectangle(476, 394, 96, 32);
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.FlatAppearance.BorderColor = Color.FromArgb(63, 103, 104);
            cancelButton.BackColor = PanelColor;
            cancelButton.ForeColor = Color.White;
            cancelButton.Click += delegate { Close(); };
            Controls.Add(cancelButton);

            installButton = new Button();
            installButton.Text = "&Install";
            installButton.Bounds = new Rectangle(580, 394, 104, 32);
            installButton.FlatStyle = FlatStyle.Flat;
            installButton.FlatAppearance.BorderColor = Accent;
            installButton.BackColor = Accent;
            installButton.ForeColor = Color.FromArgb(3, 35, 29);
            installButton.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
            installButton.Enabled = CanInstall();
            installButton.Click += InstallButtonClick;
            Controls.Add(installButton);
            AcceptButton = installButton;
            CancelButton = cancelButton;
            Shown += delegate
            {
                pathBox.Focus();
                pathBox.SelectAll();
            };
        }

        private static string DefaultInstallDirectory()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "Moli Linux");
        }

        private static string[] FindPayloadParts(out string firstPart, out long totalBytes)
        {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            string[] found = Directory.GetFiles(
                directory,
                "Moli-Linux-*-payload.7z.001",
                SearchOption.TopDirectoryOnly);
            if (found.Length == 0)
            {
                found = Directory.GetFiles(
                    directory,
                    "moli-linux-*-payload.7z.001",
                    SearchOption.TopDirectoryOnly);
            }

            if (found.Length == 0)
            {
                firstPart = null;
                totalBytes = 0;
                return new string[0];
            }

            Array.Sort(found, StringComparer.OrdinalIgnoreCase);
            firstPart = found[0];
            string prefix = firstPart.Substring(0, firstPart.Length - 3);
            System.Collections.Generic.List<string> parts =
                new System.Collections.Generic.List<string>();
            totalBytes = 0;
            for (int index = 1; index < 1000; index++)
            {
                string candidate = prefix + index.ToString("D3");
                if (!File.Exists(candidate))
                {
                    break;
                }
                parts.Add(candidate);
                totalBytes += new FileInfo(candidate).Length;
            }

            if (parts.Count == 0)
            {
                firstPart = null;
                return new string[0];
            }
            return parts.ToArray();
        }

        private bool CanInstall()
        {
            return payloadParts.Length == ExpectedPayloadPartCount
                || !string.IsNullOrEmpty(releaseBaseUrl);
        }

        private string PayloadDescription()
        {
            if (payloadParts.Length == ExpectedPayloadPartCount)
            {
                return "Installer payload: " + FormatBytes(payloadBytes) + " in "
                    + payloadParts.Length + " parts";
            }
            if (!string.IsNullOrEmpty(releaseBaseUrl))
            {
                return "The installer will download the required 4 payload parts";
            }
            return "Installer payload is missing";
        }

        private static string FindReleaseBaseUrl()
        {
            try
            {
                using (FileStream stream = new FileStream(
                    Application.ExecutablePath + ":Zone.Identifier",
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.ReadWrite))
                using (StreamReader reader = new StreamReader(stream))
                {
                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        if (!line.StartsWith("HostUrl=", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }
                        string value = line.Substring("HostUrl=".Length).Trim();
                        Uri uri;
                        if (!Uri.TryCreate(value, UriKind.Absolute, out uri)
                            || !string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)
                            || (!string.Equals(uri.Host, "github.com", StringComparison.OrdinalIgnoreCase)
                                && !string.Equals(uri.Host, "www.github.com", StringComparison.OrdinalIgnoreCase)))
                        {
                            return null;
                        }
                        string sourcePath = uri.GetLeftPart(UriPartial.Path);
                        int separator = sourcePath.LastIndexOf('/');
                        if (separator <= "https://github.com".Length)
                        {
                            return null;
                        }
                        return sourcePath.Substring(0, separator + 1);
                    }
                }
            }
            catch
            {
                // The browser download marker is optional.
            }
            return null;
        }

        private void BrowseButtonClick(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Choose the Moli Linux installation folder";
                dialog.SelectedPath = pathBox.Text;
                dialog.ShowNewFolderButton = true;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    pathBox.Text = Path.Combine(dialog.SelectedPath, "Moli Linux");
                }
            }
        }

        private async void InstallButtonClick(object sender, EventArgs e)
        {
            string target = pathBox.Text.Trim();
            if (target.Length == 0)
            {
                MessageBox.Show(this, "Choose an installation folder.", "Moli Linux Setup",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                target = Path.GetFullPath(target);
            }
            catch (Exception error)
            {
                MessageBox.Show(this, "The installation path is invalid.\r\n\r\n" + error.Message,
                    "Moli Linux Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!HasEnoughSpace(target))
            {
                MessageBox.Show(
                    this,
                    payloadParts.Length == ExpectedPayloadPartCount
                        ? "At least 8 GB of free disk space is required for installation."
                        : "At least 18 GB of free disk space is required while the installer "
                            + "downloads and extracts the Linux desktop.",
                    "Moli Linux Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            SetInstalling(true);
            string temporaryDirectory = null;
            try
            {
                Directory.CreateDirectory(target);
                SetStatus("Preparing the installer...", 3);
                temporaryDirectory = Path.Combine(
                    Path.GetTempPath(),
                    "MoliLinuxSetup-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(temporaryDirectory);

                if (payloadParts.Length != ExpectedPayloadPartCount)
                {
                    await DownloadReleasePayload(temporaryDirectory);
                }

                string sevenZip = Path.Combine(temporaryDirectory, "7za.exe");
                ExtractSevenZip(sevenZip);
                SetStatus("Installing the Linux application...", 7);
                await Task.Run(delegate { ExtractPayload(sevenZip, firstPayloadPart, target); });

                string application = Path.Combine(target, "Moli Linux.exe");
                string vmDirectory = Path.Combine(target, "resources", "vm");
                string overlayTemplate = Path.Combine(
                    vmDirectory,
                    "root-overlay-template.qcow2");
                string dataTemplate = Path.Combine(
                    vmDirectory,
                    "data-disk-template.qcow2");
                bool splitSeedComplete = true;
                for (int index = 1; index <= 4; index++)
                {
                    string part = Path.Combine(
                        vmDirectory,
                        "root-seed.qcow2.part" + index.ToString("D3"));
                    if (!File.Exists(part) || new FileInfo(part).Length == 0)
                    {
                        splitSeedComplete = false;
                        break;
                    }
                }
                if (!File.Exists(application)
                    || !splitSeedComplete
                    || !File.Exists(overlayTemplate)
                    || !File.Exists(dataTemplate))
                {
                    throw new InvalidDataException(
                        "The installed files are incomplete. Check the payload parts and try again.");
                }

                SetStatus("Creating shortcuts and uninstall information...", 92);
                string uninstaller = Path.Combine(target, "Uninstall.exe");
                File.Copy(Application.ExecutablePath, uninstaller, true);
                CreateShortcuts(target, application);
                WriteUninstallInformation(target, application, uninstaller);
                WriteInstallMarker(target);

                SetStatus("Moli Linux is ready.", 100);
                installButton.Text = "Installed";
                installButton.Enabled = false;
                if (launchCheckBox.Checked)
                {
                    Process.Start(new ProcessStartInfo(application)
                    {
                        WorkingDirectory = target,
                        UseShellExecute = true
                    });
                }
                MessageBox.Show(
                    this,
                    "Moli Linux has been installed successfully.\r\n\r\n"
                    + "The first desktop launch can take several minutes while the Linux VM starts.",
                    "Moli Linux Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                Close();
            }
            catch (Exception error)
            {
                SetStatus("Installation failed", 0);
                MessageBox.Show(
                    this,
                    "Moli Linux could not be installed.\r\n\r\n" + error.Message,
                    "Moli Linux Setup",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            finally
            {
                SetInstalling(false);
                if (!string.IsNullOrEmpty(temporaryDirectory)
                    && Directory.Exists(temporaryDirectory))
                {
                    try
                    {
                        Directory.Delete(temporaryDirectory, true);
                    }
                    catch
                    {
                        // Temporary files can be left behind if an antivirus scanner holds them.
                    }
                }
            }
        }

        private bool HasEnoughSpace(string target)
        {
            try
            {
                string root = Path.GetPathRoot(target);
                DriveInfo drive = new DriveInfo(root);
                long required = payloadParts.Length == ExpectedPayloadPartCount
                    ? payloadBytes + 1024L * 1024L * 1024L
                    : DownloadAndInstallSpace;
                return drive.AvailableFreeSpace >= required;
            }
            catch
            {
                return true;
            }
        }

        private async System.Threading.Tasks.Task DownloadReleasePayload(string temporaryDirectory)
        {
            if (string.IsNullOrEmpty(releaseBaseUrl))
            {
                throw new InvalidOperationException(
                    "The payload parts are missing. Download all payload files from the "
                    + "GitHub Release and place them beside this installer.");
            }

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            string manifestPath = Path.Combine(temporaryDirectory, "SHA256SUMS.txt");
            SetStatus("Downloading release checksums...", 4);
            await DownloadFileAsync(
                new Uri(releaseBaseUrl + "SHA256SUMS.txt"),
                manifestPath,
                null);

            string payloadName = "Moli-Linux-" + VersionTag + "-win-x64-payload.7z.";
            Dictionary<string, string> expectedHashes = new Dictionary<string, string>(
                StringComparer.OrdinalIgnoreCase);
            foreach (string line in File.ReadAllLines(manifestPath))
            {
                Match match = Regex.Match(
                    line.Trim(),
                    @"^([0-9a-fA-F]{64})\s{2,}(Moli-Linux-[0-9.]+-win-x64-payload\.7z\.\d{3})$");
                if (!match.Success || !match.Groups[2].Value.StartsWith(
                    payloadName,
                    StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                expectedHashes[match.Groups[2].Value] = match.Groups[1].Value.ToLowerInvariant();
            }
            if (expectedHashes.Count != ExpectedPayloadPartCount)
            {
                throw new InvalidDataException(
                    "The release checksum file does not list all four Windows payload parts.");
            }

            List<string> names = new List<string>(expectedHashes.Keys);
            names.Sort(StringComparer.OrdinalIgnoreCase);
            for (int index = 0; index < names.Count; index++)
            {
                string expectedName = payloadName + (index + 1).ToString("D3");
                if (!string.Equals(names[index], expectedName, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidDataException("The release payload parts are incomplete.");
                }
            }

            payloadParts = new string[names.Count];
            for (int index = 0; index < names.Count; index++)
            {
                string name = names[index];
                string destination = Path.Combine(temporaryDirectory, name);
                int partNumber = index + 1;
                SetStatus(
                    "Downloading payload part " + partNumber + " of " + names.Count + "...",
                    5);
                await DownloadFileAsync(
                    new Uri(releaseBaseUrl + name),
                    destination,
                    delegate(long received, long total)
                    {
                        double partProgress = total > 0 ? (double)received / total : 0;
                        int overall = 5 + (int)((partNumber - 1 + partProgress)
                            * 58 / names.Count);
                        SetStatus(
                            "Downloading payload part " + partNumber + " of " + names.Count
                                + " (" + FormatBytes(received) + " / " + FormatBytes(total) + ")",
                            overall);
                    });

                SetStatus("Verifying payload part " + partNumber + " of " + names.Count + "...", 64);
                string actualHash = ComputeSha256(destination);
                if (!string.Equals(
                    actualHash,
                    expectedHashes[name],
                    StringComparison.OrdinalIgnoreCase))
                {
                    File.Delete(destination);
                    throw new InvalidDataException(
                        "Payload part " + partNumber + " failed SHA-256 verification.");
                }
                payloadParts[index] = destination;
            }

            firstPayloadPart = payloadParts[0];
            payloadDownloaded = true;
            payloadBytes = 0;
            foreach (string part in payloadParts)
            {
                payloadBytes += new FileInfo(part).Length;
            }
        }

        private static System.Threading.Tasks.Task DownloadFileAsync(
            Uri source,
            string destination,
            Action<long, long> progress)
        {
            System.Threading.Tasks.TaskCompletionSource<bool> completion =
                new System.Threading.Tasks.TaskCompletionSource<bool>();
            WebClient client = new WebClient();
            client.Headers[HttpRequestHeader.UserAgent] = "Moli-Linux-Setup/" + VersionTag;
            client.DownloadProgressChanged += delegate(object sender, DownloadProgressChangedEventArgs args)
            {
                if (progress != null)
                {
                    progress(args.BytesReceived, args.TotalBytesToReceive);
                }
            };
            client.DownloadFileCompleted += delegate(object sender, System.ComponentModel.AsyncCompletedEventArgs args)
            {
                client.Dispose();
                if (args.Error != null)
                {
                    completion.TrySetException(args.Error);
                }
                else if (args.Cancelled)
                {
                    completion.TrySetCanceled();
                }
                else
                {
                    completion.TrySetResult(true);
                }
            };
            try
            {
                client.DownloadFileAsync(source, destination);
            }
            catch (Exception error)
            {
                client.Dispose();
                completion.TrySetException(error);
            }
            return completion.Task;
        }

        private static string ComputeSha256(string filename)
        {
            using (SHA256 algorithm = SHA256.Create())
            using (FileStream stream = File.OpenRead(filename))
            {
                byte[] hash = algorithm.ComputeHash(stream);
                StringBuilder text = new StringBuilder(hash.Length * 2);
                for (int index = 0; index < hash.Length; index++)
                {
                    text.Append(hash[index].ToString("x2"));
                }
                return text.ToString();
            }
        }

        private static void ExtractSevenZip(string destination)
        {
            using (Stream resource = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("MoliSetup.7za.exe"))
            {
                if (resource == null)
                {
                    throw new InvalidOperationException("The embedded extractor is missing.");
                }
                using (FileStream output = File.Create(destination))
                {
                    resource.CopyTo(output);
                }
            }
        }

        private void ExtractPayload(string sevenZip, string firstPart, string target)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = sevenZip;
            startInfo.Arguments =
                "x \"" + firstPart + "\" -o\"" + target + "\" -y -aoa -bsp1 -bso1 -bse1";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;

            using (Process process = new Process())
            {
                process.StartInfo = startInfo;
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
                {
                    UpdateExtractionProgress(eventArgs.Data);
                };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
                {
                    UpdateExtractionProgress(eventArgs.Data);
                };
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException(
                        "The payload extractor exited with code " + process.ExitCode + ".");
                }
            }
        }

        private void UpdateExtractionProgress(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return;
            }
            Match match = Regex.Match(line, @"(\d{1,3})%");
            if (!match.Success)
            {
                return;
            }
            int value;
            if (!int.TryParse(match.Groups[1].Value, out value))
            {
                return;
            }
            value = Math.Max(7, Math.Min(88, 7 + value * 81 / 100));
            if (payloadDownloaded)
            {
                value = Math.Max(64, Math.Min(90, 64 + value * 26 / 100));
            }
            SetStatus("Installing the Linux application... " + match.Groups[1].Value + "%", value);
        }

        private static void CreateShortcuts(string target, string application)
        {
            string desktop = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "Moli Linux.lnk");
            string startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                "Moli Linux.lnk");
            CreateShortcut(desktop, target, application);
            CreateShortcut(startMenu, target, application);
        }

        private static void CreateShortcut(string filename, string target, string application)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null)
            {
                return;
            }
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { filename });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember(
                "TargetPath",
                BindingFlags.SetProperty,
                null,
                shortcut,
                new object[] { application });
            shortcutType.InvokeMember(
                "WorkingDirectory",
                BindingFlags.SetProperty,
                null,
                shortcut,
                new object[] { target });
            shortcutType.InvokeMember(
                "IconLocation",
                BindingFlags.SetProperty,
                null,
                shortcut,
                new object[] { application + ",0" });
            shortcutType.InvokeMember(
                "Description",
                BindingFlags.SetProperty,
                null,
                shortcut,
                new object[] { "Moli Linux" });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }

        private static void WriteUninstallInformation(
            string target,
            string application,
            string uninstaller)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(Program.UninstallKey))
            {
                key.SetValue("DisplayName", "Moli Linux");
                key.SetValue("DisplayVersion", "1.0.0");
                key.SetValue("Publisher", "Moli Linux Project");
                key.SetValue("InstallLocation", target);
                key.SetValue("DisplayIcon", application + ",0");
                key.SetValue("UninstallString", "\"" + uninstaller + "\" --uninstall");
                key.SetValue("QuietUninstallString", "\"" + uninstaller + "\" --uninstall --quiet");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                key.SetValue("EstimatedSize", 7600000, RegistryValueKind.DWord);
            }
        }

        private static void WriteInstallMarker(string target)
        {
            string marker =
                "{\r\n"
                + "  \"product\": \"Moli Linux\",\r\n"
                + "  \"version\": \"1.0.0\",\r\n"
                + "  \"installedAt\": \"" + DateTime.UtcNow.ToString("o") + "\",\r\n"
                + "  \"installDirectory\": \""
                + target.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"\r\n"
                + "}\r\n";
            File.WriteAllText(Path.Combine(target, "install.json"), marker, Encoding.UTF8);
        }

        private void SetInstalling(bool installing)
        {
            pathBox.Enabled = !installing;
            launchCheckBox.Enabled = !installing;
            installButton.Enabled = !installing
                && CanInstall()
                && !string.Equals(installButton.Text, "Installed", StringComparison.Ordinal);
            if (installing)
            {
                installButton.Text = "Installing...";
            }
        }

        private void SetStatus(string message, int value)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string, int>(SetStatus), message, value);
                return;
            }
            statusLabel.Text = message;
            progressBar.Value = Math.Max(0, Math.Min(100, value));
        }

        private static string FormatBytes(long bytes)
        {
            double value = bytes;
            string[] units = new string[] { "B", "KB", "MB", "GB" };
            int unit = 0;
            while (value >= 1024 && unit < units.Length - 1)
            {
                value /= 1024;
                unit++;
            }
            return value.ToString(unit >= 2 ? "0.0" : "0") + " " + units[unit];
        }
    }
}
