const STORAGE_VERSION_KEY = 'ytDlpVersion';
const STORAGE_BINARY_PATH_KEY = 'ytDlpBinaryPath';

const VIDEO_QUALITY_OPTIONS = [
  { value: 'best', label: 'Best available' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' }
];

const AUDIO_QUALITY_OPTIONS = [
  { value: 'best', label: 'Best available' },
  { value: 'medium', label: 'Medium quality' },
  { value: 'low', label: 'Low quality' }
];

const DOWNLOAD_MODES = [
  { value: 'video-audio', label: 'Video + Audio' },
  { value: 'video-only', label: 'Video only' },
  { value: 'audio-only', label: 'Audio only' }
];

function getPlatformInfo() {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  const isWindows = userAgent.includes('windows') || platform.includes('win');
  const isMac = userAgent.includes('mac') || platform.includes('mac');
  const isLinux = userAgent.includes('linux') || platform.includes('linux');
  const isArm = userAgent.includes('arm') || userAgent.includes('aarch');

  return { isWindows, isMac, isLinux, isArm };
}

function getBinaryFilename(platformInfo) {
  return platformInfo.isWindows ? 'yt-dlp.exe' : 'yt-dlp';
}

function getBinaryAssetName(platformInfo) {
  if (platformInfo.isWindows) {
    return 'yt-dlp.exe';
  }

  if (platformInfo.isMac) {
    return 'yt-dlp_macos';
  }

  if (platformInfo.isLinux && platformInfo.isArm) {
    return 'yt-dlp_linux_aarch64';
  }

  return 'yt-dlp_linux';
}

async function getLatestReleaseInfo() {
  const response = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: {
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch yt-dlp release: ${response.status}`);
  }

  return response.json();
}

function getAssetDownloadUrl(releaseInfo, assetName) {
  const matchingAsset = (releaseInfo.assets || []).find(asset => asset.name === assetName);

  if (!matchingAsset) {
    throw new Error(`yt-dlp asset not found: ${assetName}`);
  }

  return matchingAsset.browser_download_url;
}

async function downloadBinaryWithProgress(downloadUrl, binaryPath, versionLabel) {
  const result = await sigma.ui.withProgress(
    {
      title: `Downloading yt-dlp ${versionLabel}`,
      location: 'notification',
      cancellable: true
    },
    async (progress, token) => {
      if (token.isCancellationRequested) {
        return { cancelled: true };
      }

      let progressValue = 0;
      const intervalId = setInterval(() => {
        if (progressValue < 90) {
          progressValue += 2;
          progress.report({
            message: 'Downloading...',
            increment: 2
          });
        }
      }, 250);

      try {
        await sigma.fs.downloadFile(downloadUrl, binaryPath);
      } finally {
        clearInterval(intervalId);
      }

      if (token.isCancellationRequested) {
        return { cancelled: true };
      }

      progress.report({
        message: 'Download complete',
        increment: 100 - progressValue
      });

      return { cancelled: false };
    }
  );

  if (result.cancelled) {
    throw new Error('Download cancelled');
  }
}

async function ensureBinaryInstalled(context, options) {
  const platformInfo = getPlatformInfo();
  const binaryFilename = getBinaryFilename(platformInfo);
  const binaryPath = `${context.extensionPath}/${binaryFilename}`;

  const isAutoUpdateEnabled = (await sigma.settings.get('autoUpdateBinary')) !== false;
  const shouldCheckUpdates = options?.checkUpdates && (options?.ignoreAutoUpdate ? true : isAutoUpdateEnabled);
  const currentVersion = await sigma.storage.get(STORAGE_VERSION_KEY);
  const exists = await sigma.fs.exists(binaryPath);

  if (!exists || shouldCheckUpdates || options?.forceDownload) {
    const latestRelease = await getLatestReleaseInfo();
    const latestVersion = latestRelease.tag_name || 'latest';

    if (options?.forceDownload || !exists || currentVersion !== latestVersion) {
      const assetName = getBinaryAssetName(platformInfo);
      const downloadUrl = getAssetDownloadUrl(latestRelease, assetName);
      await downloadBinaryWithProgress(downloadUrl, binaryPath, latestVersion);
      await sigma.storage.set(STORAGE_VERSION_KEY, latestVersion);
      await sigma.storage.set(STORAGE_BINARY_PATH_KEY, binaryPath);
    }
  }

  return binaryPath;
}

function buildFormatSelector(mode, videoQuality, audioQuality) {
  if (mode === 'audio-only') {
    if (audioQuality === 'low') return 'worstaudio';
    if (audioQuality === 'medium') return 'bestaudio[abr<=128]/bestaudio';
    return 'bestaudio';
  }

  if (mode === 'video-only') {
    if (videoQuality === 'best') return 'bestvideo';
    return `bestvideo[height<=${videoQuality}]`;
  }

  if (videoQuality === 'best') return 'bestvideo+bestaudio/best';
  return `bestvideo[height<=${videoQuality}]+bestaudio/best`;
}

function createDownloadModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#111827;color:#f9fafb;border-radius:12px;min-width:360px;max-width:520px;width:80%;padding:20px;box-shadow:0 20px 40px rgba(0,0,0,0.3);display:flex;flex-direction:column;gap:14px;';

    const title = document.createElement('div');
    title.textContent = 'Download video from URL';
    title.style.cssText = 'font-size:18px;font-weight:600;';

    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'Video URL';
    urlLabel.style.cssText = 'font-size:13px;opacity:0.8;';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://...';
    urlInput.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f9fafb;';

    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Download type';
    modeLabel.style.cssText = 'font-size:13px;opacity:0.8;';

    const modeSelect = document.createElement('select');
    modeSelect.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f9fafb;';

    for (const option of DOWNLOAD_MODES) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      modeSelect.appendChild(optionElement);
    }

    const videoLabel = document.createElement('label');
    videoLabel.textContent = 'Video quality';
    videoLabel.style.cssText = 'font-size:13px;opacity:0.8;';

    const videoSelect = document.createElement('select');
    videoSelect.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f9fafb;';

    for (const option of VIDEO_QUALITY_OPTIONS) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      videoSelect.appendChild(optionElement);
    }

    const audioLabel = document.createElement('label');
    audioLabel.textContent = 'Audio quality';
    audioLabel.style.cssText = 'font-size:13px;opacity:0.8;';

    const audioSelect = document.createElement('select');
    audioSelect.style.cssText = 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f9fafb;';

    for (const option of AUDIO_QUALITY_OPTIONS) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      audioSelect.appendChild(optionElement);
    }

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:8px;';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid #334155;background:transparent;color:#e2e8f0;';

    const submitButton = document.createElement('button');
    submitButton.textContent = 'Download';
    submitButton.style.cssText = 'padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;';

    buttons.appendChild(cancelButton);
    buttons.appendChild(submitButton);

    modal.appendChild(title);
    modal.appendChild(urlLabel);
    modal.appendChild(urlInput);
    modal.appendChild(modeLabel);
    modal.appendChild(modeSelect);
    modal.appendChild(videoLabel);
    modal.appendChild(videoSelect);
    modal.appendChild(audioLabel);
    modal.appendChild(audioSelect);
    modal.appendChild(buttons);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function cleanup() {
      overlay.remove();
    }

    function resolveModal(value) {
      cleanup();
      resolve(value);
    }

    cancelButton.addEventListener('click', () => resolveModal(null));

    submitButton.addEventListener('click', () => {
      resolveModal({
        url: urlInput.value.trim(),
        mode: modeSelect.value,
        videoQuality: videoSelect.value,
        audioQuality: audioSelect.value
      });
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        resolveModal(null);
      }
    });

    window.addEventListener('keydown', function handleEscape(event) {
      if (event.key === 'Escape') {
        window.removeEventListener('keydown', handleEscape);
        resolveModal(null);
      }
    });

    urlInput.focus();
  });
}

async function runYtDlp(binaryPath, options) {
  const formatSelector = buildFormatSelector(options.mode, options.videoQuality, options.audioQuality);
  const args = ['--no-playlist', '-f', formatSelector];

  if (options.mode === 'audio-only') {
    args.push('-x', '--audio-format', 'mp3');
  }

  if (options.outputPath) {
    args.push('-o', options.outputPath);
  }

  args.push(options.url);
  const result = await sigma.shell.run(binaryPath, args);

  if (result.code !== 0) {
    await sigma.ui.showDialog({
      title: 'Download failed',
      message: result.stderr || 'yt-dlp exited with an error.',
      type: 'error',
      confirmText: 'OK'
    });
  }
}

async function handleDownloadCommand(context) {
  const modalResult = await createDownloadModal();

  if (!modalResult || !modalResult.url) {
    return;
  }

  const outputPath = await sigma.dialog.saveFile({
    title: 'Select output file'
  });

  if (!outputPath) {
    return;
  }

  const binaryPath = await ensureBinaryInstalled(context, { checkUpdates: false });

  await runYtDlp(binaryPath, {
    url: modalResult.url,
    mode: modalResult.mode,
    videoQuality: modalResult.videoQuality,
    audioQuality: modalResult.audioQuality,
    outputPath
  });
}

async function handleStartupActivation(context) {
  const autoUpdate = (await sigma.settings.get('autoUpdateBinary')) !== false;

  if (!autoUpdate) return;

  try {
    await ensureBinaryInstalled(context, { checkUpdates: true });
  } catch (error) {
    sigma.ui.showNotification({
      title: 'Video Downloader',
      message: error.message || 'Failed to update yt-dlp binary',
      type: 'error'
    });
  }
}

async function handleInstallActivation(context) {
  try {
    await ensureBinaryInstalled(context, { checkUpdates: true, ignoreAutoUpdate: true, forceDownload: true });
    sigma.ui.showNotification({
      title: 'Video Downloader',
      message: 'yt-dlp was downloaded successfully',
      type: 'success'
    });
  } catch (error) {
    sigma.ui.showNotification({
      title: 'Video Downloader',
      message: error.message || 'Failed to download yt-dlp',
      type: 'error'
    });
  }
}

async function handleUninstallActivation() {
  await sigma.storage.remove(STORAGE_VERSION_KEY);
  await sigma.storage.remove(STORAGE_BINARY_PATH_KEY);
}

async function activate(context) {
  sigma.commands.registerCommand(
    { id: 'download-video', title: 'Download video from URL' },
    async () => handleDownloadCommand(context)
  );

  if (context.activationEvent === 'onInstall') {
    await handleInstallActivation(context);
  } else if (context.activationEvent === 'onUninstall') {
    await handleUninstallActivation();
  } else if (context.activationEvent === 'onStartup' || context.activationEvent === 'onUpdate' || context.activationEvent === 'onEnable') {
    await handleStartupActivation(context);
  }
}

async function deactivate() {
}

if (typeof module !== 'undefined') {
  module.exports = { activate, deactivate };
}
