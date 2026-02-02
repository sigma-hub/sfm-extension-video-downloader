const YTDLP_BINARY_ID = 'yt-dlp';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function renamePartFilesToTs(directory) {
  try {
    console.log('[Video Downloader] Calling shell.renamePartFilesToTs for:', directory);
    const renamedCount = await sigma.shell.renamePartFilesToTs(directory);
    console.log('[Video Downloader] Renamed', renamedCount, 'files to .ts');
  } catch (err) {
    console.warn('[Video Downloader] Failed to rename .part files:', err);
  }
}

function parseDownloadInfo(line) {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const sizeMatch = line.match(/of\s+([\d.]+\s*\w+)/i);
  const speedMatch = line.match(/at\s+([\d.]+\s*\w+\/s)/i);
  const etaMatch = line.match(/ETA\s+(\S+)/i);

  const percent = percentMatch ? Number(percentMatch[1]) : null;
  const size = sizeMatch ? sizeMatch[1].replace(/\s+/g, ' ') : null;
  const speed = speedMatch ? speedMatch[1].replace(/\s+/g, ' ') : null;
  const rawEta = etaMatch ? etaMatch[1] : null;
  const eta = rawEta && /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawEta) ? rawEta : null;

  return { percent, size, speed, eta, type: 'download' };
}

function parseFfmpegProgress(line) {
  const sizeMatch = line.match(/Lsize=\s*([\d.]+\s*\w+)/i) || line.match(/size=\s*([\d.]+\s*\w+)/i);
  const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2}|\d{2}:\d{2}:\d{2})/i);
  const bitrateMatch = line.match(/bitrate=\s*([\d.]+\s*\w+\/s)/i);
  const speedMatch = line.match(/speed=\s*([\d.]+x)/i);
  const frameMatch = line.match(/frame=\s*(\d+)/i);

  if (!timeMatch && !sizeMatch && !frameMatch) {
    return null;
  }

  return {
    size: sizeMatch ? sizeMatch[1].trim() : null,
    time: timeMatch ? timeMatch[1] : null,
    bitrate: bitrateMatch ? bitrateMatch[1].trim() : null,
    speed: speedMatch ? speedMatch[1] : null,
    frame: frameMatch ? Number(frameMatch[1]) : null,
    type: 'ffmpeg'
  };
}

function formatCleanProgressMessage(info) {
  const parts = [];

  if (info.percent !== null && info.percent !== undefined) {
    parts.push(`${info.percent.toFixed(1)}%`);
  }

  if (info.size) {
    parts.push(info.size);
  }

  if (info.speed) {
    parts.push(info.speed);
  }

  if (info.eta) {
    parts.push(`ETA ${info.eta}`);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Downloading...';
}

function formatStreamProgressMessage(info) {
  const parts = [];

  if (info.time) {
    const cleanTime = info.time.split('.')[0];
    parts.push(`Recorded: ${cleanTime}`);
  }

  if (info.size) {
    parts.push(info.size);
  }

  if (info.bitrate) {
    parts.push(info.bitrate);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Recording stream...';
}

function formatStatusMessage(line) {
  const message = line.replace(/^\[[^\]]+\]\s*/, '').trim();
  const maxLength = 60;
  return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
}

const VIDEO_QUALITY_OPTIONS = [
  { value: 'best', label: 'Best available' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' }
];

const TWITCH_QUALITY_OPTIONS = [
  { value: 'best', label: 'Source (Best)' },
  { value: '1080p60', label: '1080p 60fps' },
  { value: '1080p', label: '1080p' },
  { value: '720p60', label: '720p 60fps' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
  { value: 'audio_only', label: 'Audio only' }
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

function detectPlatform(url) {
  if (!url) return 'generic';
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return 'youtube';
  }
  if (lowerUrl.includes('twitch.tv')) {
    if (lowerUrl.includes('/videos/') || lowerUrl.includes('/clip/')) {
      return 'twitch-vod';
    }
    return 'twitch-live';
  }
  return 'generic';
}

function getPlatformLabel(platform) {
  switch (platform) {
    case 'youtube': return 'YouTube';
    case 'twitch-live': return 'Twitch (Live Stream)';
    case 'twitch-vod': return 'Twitch (VOD/Clip)';
    default: return 'Video';
  }
}

function getYtDlpDownloadUrl(platform) {
  if (platform === 'windows') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  }
  if (platform === 'macos') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  }
  if (platform === 'linux' && sigma.platform.arch === 'arm64') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64';
  }
  return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
}

async function ensureBinaryInstalled() {
  const binaryPath = await sigma.binary.ensureInstalled(YTDLP_BINARY_ID, {
    name: 'yt-dlp',
    downloadUrl: getYtDlpDownloadUrl,
  });

  return { binaryPath };
}

function buildFormatSelector(options) {
  const { platform, mode, videoQuality, audioQuality, twitchQuality } = options;

  if (platform === 'twitch-live' || platform === 'twitch-vod') {
    if (twitchQuality === 'best') return 'best';
    if (twitchQuality === 'audio_only') return 'audio_only';
    return `${twitchQuality}/best`;
  }

  if (platform === 'generic') {
    if (videoQuality === 'best') return 'bestvideo+bestaudio/best';
    return `bestvideo[height<=${videoQuality}]+bestaudio/best[height<=${videoQuality}]/best`;
  }

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
    const modal = sigma.ui.createModal({
      title: 'Download from URL',
      width: 480,
      content: [
        sigma.ui.input({
          id: 'url',
          label: 'Website URL',
          placeholder: 'Paste URL here',
        }),
        sigma.ui.text('Supports YouTube, Twitch, and 1000+ other websites'),
        sigma.ui.separator(),
        sigma.ui.select({
          id: 'mode',
          label: 'Download type',
          options: DOWNLOAD_MODES,
          value: 'video-audio',
        }),
        sigma.ui.select({
          id: 'videoQuality',
          label: 'Video quality',
          options: VIDEO_QUALITY_OPTIONS,
          value: 'best',
        }),
        sigma.ui.select({
          id: 'audioQuality',
          label: 'Audio quality',
          options: AUDIO_QUALITY_OPTIONS,
          value: 'best',
        }),
        sigma.ui.checkbox({
          id: 'liveFromStart',
          label: 'Start from beginning (for live streams)',
          checked: false,
        }),
      ],
      buttons: [
        { id: 'cancel', label: 'Cancel', variant: 'secondary' },
        { id: 'download', label: 'Download', variant: 'primary' },
      ],
    });

    modal.onSubmit((values, buttonId) => {
      if (buttonId === 'cancel') {
        resolve(null);
        return;
      }

      const url = values.url;
      if (!url || !url.trim()) {
        resolve(null);
        return;
      }

      const platform = detectPlatform(url);

      resolve({
        url: url.trim(),
        platform,
        mode: values.mode,
        videoQuality: values.videoQuality,
        audioQuality: values.audioQuality,
        twitchQuality: values.videoQuality,
        liveFromStart: values.liveFromStart,
      });
    });

    modal.onClose(() => {
      resolve(null);
    });
  });
}

async function runYtDlp(binaryPath, options) {
  const formatSelector = buildFormatSelector(options);
  const args = ['--no-playlist', '--newline', '-f', formatSelector];

  if (options.platform === 'twitch-live' && options.liveFromStart) {
    args.push('--live-from-start');
  }

  if (options.platform === 'twitch-live' || options.platform === 'twitch-vod') {
    args.push('--concurrent-fragments', '4');
  }

  if (options.mode === 'audio-only') {
    args.push('-x', '--audio-format', 'mp3');
  }

  if (options.outputDir) {
    args.push('-P', options.outputDir);
    args.push('-o', '%(title)s.%(ext)s');
  }

  args.push(options.url);

  let lastPercent = 0;
  let lastUpdateTime = 0;
  let pendingUpdate = null;
  let isLiveStream = false;
  let streamDetected = false;
  let isCancelled = false;
  const UPDATE_INTERVAL = 200;

  function throttledUpdate(message, increment) {
    if (isCancelled) return;

    const now = Date.now();
    if (now - lastUpdateTime >= UPDATE_INTERVAL) {
      lastUpdateTime = now;
      if (options.onProgress) {
        options.onProgress({ message, increment });
      }
    } else {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate.timeout);
      }
      const timeout = setTimeout(() => {
        if (pendingUpdate && options.onProgress && !isCancelled) {
          options.onProgress({ message: pendingUpdate.message, increment: pendingUpdate.increment });
          pendingUpdate = null;
          lastUpdateTime = Date.now();
        }
      }, UPDATE_INTERVAL - (now - lastUpdateTime));
      pendingUpdate = { message, increment, timeout };
    }
  }

  function cancelUpdates() {
    isCancelled = true;
    if (pendingUpdate) {
      clearTimeout(pendingUpdate.timeout);
      pendingUpdate = null;
    }
  }

  const { result, cancel } = await sigma.shell.runWithProgress(
    binaryPath,
    args,
    (payload) => {
      const line = payload.line.trim();
      if (!line) return;

      if (!streamDetected && (line.includes('(live)') || line.includes('Duration: N/A'))) {
        isLiveStream = true;
        streamDetected = true;
        if (options.onStreamDetected) {
          options.onStreamDetected();
        }
      }

      if (line.includes('[download]')) {
        const info = parseDownloadInfo(line);

        if (info.percent !== null) {
          const increment = Math.max(0, info.percent - lastPercent);
          lastPercent = info.percent;
          throttledUpdate(formatCleanProgressMessage(info), increment);
          return;
        }

        throttledUpdate(formatStatusMessage(line), 0);
        return;
      }

      const ffmpegInfo = parseFfmpegProgress(line);
      if (ffmpegInfo) {
        const message = isLiveStream
          ? formatStreamProgressMessage(ffmpegInfo)
          : formatStreamProgressMessage(ffmpegInfo);
        throttledUpdate(message, 0);
        return;
      }

      if (
        line.includes('[Merger]')
        || line.includes('[ExtractAudio]')
        || line.includes('[FixupM3u8]')
      ) {
        throttledUpdate('Finalizing...', 0);
        return;
      }

      if (
        line.includes('[ffmpeg]')
        || line.includes('[info]')
        || line.includes('[youtube]')
        || line.includes('[twitch')
        || line.includes('[generic')
        || line.match(/^\[\w+\]/)
      ) {
        throttledUpdate(formatStatusMessage(line), 0);
      }
    }
  );

  if (options.onCancel) {
    options.onCancel(async () => {
      console.log('[Video Downloader] Cancel requested, calling cancelUpdates and cancel()');
      console.log('[Video Downloader] isLiveStream:', isLiveStream, 'outputDir:', options.outputDir);
      cancelUpdates();
      try {
        await cancel();
        console.log('[Video Downloader] cancel() completed successfully');
      } catch (err) {
        console.error('[Video Downloader] cancel() failed:', err);
      }
      
      if (options.outputDir) {
        console.log('[Video Downloader] Attempting to rename .part files...');
        await renamePartFilesToTs(options.outputDir);
      }
    });
  }

  const commandResult = await result;

  if (commandResult.code !== 0 && !isCancelled) {
    sigma.ui.showNotification({
      title: 'Download failed',
      message: commandResult.stderr || 'yt-dlp exited with an error.',
      type: 'error'
    });
  }
}

async function handleDownloadCommand() {
  const modalResult = await createDownloadModal();

  if (!modalResult || !modalResult.url) {
    return;
  }

  let outputDir = sigma.context.getCurrentPath();

  if (!outputDir) {
    try {
      outputDir = await sigma.context.getDownloadsDir();
    } catch (error) {
      sigma.ui.showNotification({
        title: 'Video Downloader',
        message: 'Could not determine download location.',
        type: 'error'
      });
      return;
    }
  }

  const installResult = await ensureBinaryInstalled();

  let isLiveStream = modalResult.platform === 'twitch-live';

  const progressTitle = isLiveStream ? 'Recording stream' : 'Downloading video';

  const progressResult = await sigma.ui.withProgress(
    {
      title: progressTitle,
      location: 'notification',
      cancellable: true
    },
    async (progress, token) => {
      let onCancelHandler = null;
      token.onCancellationRequested(() => {
        console.log('[Video Downloader] Cancellation requested, onCancelHandler set:', !!onCancelHandler);
        if (onCancelHandler) {
          onCancelHandler();
        } else {
          console.warn('[Video Downloader] onCancelHandler not set yet!');
        }
      });

      await runYtDlp(installResult.binaryPath, {
        url: modalResult.url,
        platform: modalResult.platform,
        mode: modalResult.mode,
        videoQuality: modalResult.videoQuality,
        audioQuality: modalResult.audioQuality,
        twitchQuality: modalResult.twitchQuality,
        liveFromStart: modalResult.liveFromStart,
        outputDir,
        onProgress: (value) => progress.report(value),
        onCancel: (handler) => {
          onCancelHandler = handler;
        },
        onStreamDetected: () => {
          isLiveStream = true;
        }
      });

      if (token.isCancellationRequested) {
        return { cancelled: true, isLiveStream };
      }

      progress.report({
        message: 'Download complete',
        increment: 100
      });

      await sleep(1500);
      return { cancelled: false, isLiveStream };
    }
  );

  if (progressResult.cancelled) {
    sigma.ui.showNotification({
      title: 'Video Downloader',
      message: isLiveStream
        ? 'Recording stopped. Video saved up to this point.'
        : 'Download stopped',
      type: 'info'
    });
  }
}

async function handleStartupActivation() {
  const autoUpdate = (await sigma.settings.get('autoUpdateBinary')) !== false;
  if (!autoUpdate) return;

  try {
    await ensureBinaryInstalled();
  } catch (error) {
    console.warn('[Video Downloader] Failed to ensure binary installed:', error);
  }
}

async function handleInstallActivation() {
  try {
    await ensureBinaryInstalled();
    sigma.ui.showNotification({
      title: 'Video Downloader',
      message: 'yt-dlp is ready',
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
  try {
    await sigma.binary.remove(YTDLP_BINARY_ID);
  } catch (error) {
    console.warn('[Video Downloader] Failed to remove binary:', error);
  }
}

async function activate(context) {
  sigma.commands.registerCommand(
    { id: 'download-video', title: 'Download video, playlist, audio, or stream from URL' },
    async () => handleDownloadCommand()
  );

  if (context.activationEvent === 'onInstall') {
    await handleInstallActivation();
  } else if (context.activationEvent === 'onUninstall') {
    await handleUninstallActivation();
  } else if (context.activationEvent === 'onStartup' || context.activationEvent === 'onUpdate' || context.activationEvent === 'onEnable') {
    await handleStartupActivation();
  }
}

async function deactivate() {
}

if (typeof module !== 'undefined') {
  module.exports = { activate, deactivate };
}
