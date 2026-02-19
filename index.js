// @ts-check
const YTDLP_BINARY_ID = 'yt-dlp';
const DENO_BINARY_ID = 'deno';
const FFMPEG_BINARY_ID = 'ffmpeg';
let cachedDenoBinaryPath = null;
let cachedFfmpegBinaryPath = null;
let cachedFfprobeBinaryPath = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDenoDownloadUrl(platform) {
  const arch = sigma.platform.arch;
  if (platform === 'windows') {
    return 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip';
  }
  if (platform === 'macos') {
    if (arch === 'arm64') {
      return 'https://github.com/denoland/deno/releases/latest/download/deno-aarch64-apple-darwin.zip';
    }
    return 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-apple-darwin.zip';
  }
  if (arch === 'arm64') {
    return 'https://github.com/denoland/deno/releases/latest/download/deno-aarch64-unknown-linux-gnu.zip';
  }
  return 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip';
}

function getFfmpegDownloadUrl(platform) {
  const arch = sigma.platform.arch;
  if (platform !== 'windows') {
    return null;
  }
  if (arch === 'arm64') {
    return 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-winarm64-gpl.zip';
  }
  if (arch === 'x86') {
    return 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win32-gpl.zip';
  }
  return 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';
}

function getFfmpegExecutable() {
  if (sigma.platform.isWindows) {
    return 'bin/ffmpeg.exe';
  }
  return 'ffmpeg';
}

function getFfprobeExecutable() {
  if (sigma.platform.isWindows) {
    return 'bin/ffprobe.exe';
  }
  return 'ffprobe';
}

function getDirectoryFromPath(binaryPath) {
  if (!binaryPath) return null;
  const separator = sigma.platform.pathSeparator;
  const lastSeparatorIndex = binaryPath.lastIndexOf(separator);
  if (lastSeparatorIndex === -1) return null;
  return binaryPath.substring(0, lastSeparatorIndex);
}

function normalizePathForComparison(pathValue) {
  if (!pathValue) return '';
  const normalized = pathValue.replace(/[\\/]+/g, sigma.platform.pathSeparator);
  return sigma.platform.isWindows ? normalized.toLowerCase() : normalized;
}

function isPathWithinPath(pathValue, rootPath) {
  if (!pathValue || !rootPath) return false;
  const normalizedPath = normalizePathForComparison(pathValue);
  const normalizedRoot = normalizePathForComparison(rootPath);
  return normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}${sigma.platform.pathSeparator}`);
}

function getDenoDirectory() {
  if (!cachedDenoBinaryPath) return null;
  const separator = sigma.platform.pathSeparator;
  const lastSep = cachedDenoBinaryPath.lastIndexOf(separator);
  if (lastSep === -1) return null;
  return cachedDenoBinaryPath.substring(0, lastSep);
}

async function ensureDenoInstalled() {
  if (cachedDenoBinaryPath) return cachedDenoBinaryPath;

  try {
    const denoPath = await sigma.binary.ensureInstalled(DENO_BINARY_ID, {
      name: 'deno',
      downloadUrl: getDenoDownloadUrl,
    });
    cachedDenoBinaryPath = denoPath;
    console.log('[Video Downloader] Deno available at:', denoPath);
    return denoPath;
  } catch (error) {
    console.error('[Video Downloader] Failed to ensure Deno installed:', error);
    return null;
  }
}

async function ensureFfmpegInstalled() {
  if (cachedFfmpegBinaryPath) return cachedFfmpegBinaryPath;

  const ffmpegDownloadUrl = getFfmpegDownloadUrl(sigma.platform.os);
  if (!ffmpegDownloadUrl) {
    return null;
  }

  try {
    const ffmpegPath = await sigma.binary.ensureInstalled(FFMPEG_BINARY_ID, {
      name: 'ffmpeg',
      executable: getFfmpegExecutable(),
      downloadUrl: ffmpegDownloadUrl,
    });
    cachedFfmpegBinaryPath = ffmpegPath;
    cachedFfprobeBinaryPath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, `ffprobe${sigma.platform.isWindows ? '.exe' : ''}`);
    console.log('[Video Downloader] ffmpeg available at:', ffmpegPath);
    if (cachedFfprobeBinaryPath) {
      console.log('[Video Downloader] ffprobe expected at:', cachedFfprobeBinaryPath);
    }
    return ffmpegPath;
  } catch (error) {
    console.error('[Video Downloader] Failed to ensure ffmpeg installed:', error);
    return null;
  }
}

async function ensureToolchainReady() {
  const denoPath = await ensureDenoInstalled();
  if (!denoPath) {
    throw new Error('Failed to install Deno runtime');
  }

  const ffmpegPath = await ensureFfmpegInstalled();
  if (sigma.platform.isWindows && !ffmpegPath) {
    throw new Error('Failed to install ffmpeg binary');
  }

  if (sigma.platform.isWindows) {
    const ffprobePath = cachedFfprobeBinaryPath
      || (ffmpegPath ? ffmpegPath.replace(/ffmpeg(\.exe)?$/i, `ffprobe${sigma.platform.isWindows ? '.exe' : ''}`) : null);
    if (!ffprobePath) {
      throw new Error('ffprobe path could not be resolved');
    }

    const ffprobeExists = await sigma.fs.exists(ffprobePath);
    if (!ffprobeExists) {
      throw new Error('ffprobe binary is missing from the ffmpeg package');
    }
  }
}

async function renamePartFilesToTs(directory) {
  try {
    console.log('[Video Downloader] Calling shell.renamePartFilesToTs for:', directory);
    const renamedCount = await sigma.shell['renamePartFilesToTs'](directory);
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

const YTDLP_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function getYtDlpDownloadUrl(platform) {
  if (platform === 'windows') {
    return 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe';
  }
  if (platform === 'macos') {
    return 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_macos';
  }
  if (platform === 'linux' && sigma.platform.arch === 'arm64') {
    return 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_linux_aarch64';
  }
  return 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_linux';
}

async function ensureBinaryInstalled() {
  try {
    const binaryInfo = await sigma.binary.getInfo(YTDLP_BINARY_ID);
    const currentChannel = await sigma.storage.get('ytdlp-channel');
    const needsChannelSwitch = binaryInfo && currentChannel !== 'nightly';
    const isStale = binaryInfo && (Date.now() - binaryInfo.installedAt) > YTDLP_MAX_AGE_MS;

    if (needsChannelSwitch || isStale) {
      const reason = needsChannelSwitch ? 'switching to nightly channel' : 'older than 3 days';
      console.log(`[Video Downloader] Removing yt-dlp (${reason})`);
      await sigma.binary.remove(YTDLP_BINARY_ID);
    }
  } catch (error) {
    console.warn('[Video Downloader] Failed to check/remove old yt-dlp:', error);
  }

  const binaryPath = await sigma.binary.ensureInstalled(YTDLP_BINARY_ID, {
    name: 'yt-dlp',
    downloadUrl: getYtDlpDownloadUrl,
  });

  await sigma.storage.set('ytdlp-channel', 'nightly');

  return { binaryPath };
}

function extractErrorFromStderr(stderr) {
  if (!stderr) return '';
  const lines = stderr.split('\n').filter(line => line.trim());
  const errorLines = lines.filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith('WARNING:') && !trimmed.startsWith('NOTE:');
  });
  return errorLines.join('\n');
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

function buildYtDlpArgs(options, formatSelector, extraArgs = []) {
  const args = [
    '--no-playlist',
    '--newline',
    '--remote-components',
    'ejs:npm',
    '--remote-components',
    'ejs:github',
    '-f',
    formatSelector,
  ];

  if (options.liveFromStart && (options.platform === 'twitch-live' || options.platform === 'youtube')) {
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

  if (options.ffmpegPath) {
    args.push('--ffmpeg-location', options.ffmpegPath);
  } else if (options.ffmpegDir) {
    args.push('--ffmpeg-location', options.ffmpegDir);
  }

  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  args.push(options.url);
  return args;
}

function shouldRetryWithBrowserCookies(options, outputText) {
  if (options.platform !== 'youtube') return false;
  const lowerOutput = outputText.toLowerCase();
  return (
    lowerOutput.includes('no title found in player responses')
    || lowerOutput.includes('login_required')
    || lowerOutput.includes('sign in to confirm')
  );
}

function isChromeCookieCopyFailure(outputText) {
  const lowerOutput = outputText.toLowerCase();
  return (
    lowerOutput.includes('could not copy chrome cookie database')
    || lowerOutput.includes('could not copy edge cookie database')
    || lowerOutput.includes('could not copy chromium cookie database')
  );
}

function getCookieBrowserCandidates() {
  if (sigma.platform.isWindows) {
    return ['firefox', 'edge', 'chrome'];
  }
  if (sigma.platform.isMacos) {
    return ['chrome', 'safari', 'firefox'];
  }
  return ['chrome', 'chromium', 'firefox'];
}

function getPluginDirFromBinaryPath(binaryPath) {
  const separator = sigma.platform.pathSeparator;
  const marker = `${separator}bin${separator}${YTDLP_BINARY_ID}${separator}`;
  const markerIndex = binaryPath.lastIndexOf(marker);
  if (markerIndex === -1) return null;
  return binaryPath.substring(0, markerIndex);
}

function isChromiumBrowserName(browserName) {
  return browserName === 'chrome' || browserName === 'edge' || browserName === 'chromium';
}

function createDownloadModal(prefilledUrl) {
  return new Promise((resolve) => {
    const modal = sigma.ui.createModal({
      title: 'Download from URL',
      width: 480,
      content: [
        sigma.ui.input({
          id: 'url',
          label: 'Website URL',
          placeholder: 'Paste URL here',
          value: prefilledUrl || '',
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
          label: 'Record live stream from beginning (YouTube/Twitch only, experimental)',
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

      const url = typeof values.url === 'string' ? values.url : '';
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
  await ensureToolchainReady();
  const ffmpegPath = await ensureFfmpegInstalled();
  const ffmpegDir = getDirectoryFromPath(ffmpegPath);
  console.log('[Video Downloader] Using ffmpeg path:', ffmpegPath);
  const ytDlpOptions = {
    ...options,
    ffmpegPath,
    ffmpegDir,
  };
  const defaultArgs = buildYtDlpArgs(ytDlpOptions, formatSelector);

  console.log('[Video Downloader] Running yt-dlp with args:', JSON.stringify(defaultArgs));

  let lastPercent = 0;
  let lastUpdateTime = 0;
  let pendingUpdate = null;
  let isLiveStream = false;
  let streamDetected = false;
  let isCancelled = false;
  let activeCancelCommand = null;
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

  const handleProgressLine = (payload) => {
      const line = String(payload.line || '').trim();
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
  };

  async function runYtDlpAttempt(attemptArgs, attemptLabel) {
    console.log('[Video Downloader] Running yt-dlp attempt:', attemptLabel, JSON.stringify(attemptArgs));
    const commandTask = await sigma.shell.runWithProgress(
      binaryPath,
      attemptArgs,
      handleProgressLine
    );
    activeCancelCommand = commandTask.cancel;
    return commandTask.result;
  }

  if (options.onCancel) {
    options.onCancel(async () => {
      console.log('[Video Downloader] Cancel requested, calling cancelUpdates and cancel()');
      console.log('[Video Downloader] isLiveStream:', isLiveStream, 'outputDir:', options.outputDir);
      cancelUpdates();
      try {
        if (activeCancelCommand) {
          await activeCancelCommand();
          console.log('[Video Downloader] cancel() completed successfully');
        } else {
          console.warn('[Video Downloader] cancel() skipped, no active command');
        }
      } catch (cancelError) {
        console.error('[Video Downloader] cancel() failed:', cancelError);
      }
      
      if (options.outputDir) {
        console.log('[Video Downloader] Attempting to rename .part files...');
        await renamePartFilesToTs(options.outputDir);
      }
    });
  }

  let commandResult = await runYtDlpAttempt(defaultArgs, 'default');

  if (commandResult.code !== 0 && !isCancelled) {
    const fullOutput = (commandResult.stderr || '') + '\n' + (commandResult.stdout || '');
    if (shouldRetryWithBrowserCookies(options, fullOutput)) {
      const extractorRetryArgs = buildYtDlpArgs(ytDlpOptions, formatSelector, [
        '--extractor-args',
        'youtube:player_client=tv,ios,web',
      ]);
      throttledUpdate('Retrying with alternate YouTube clients...', 0);
      const extractorRetryResult = await runYtDlpAttempt(extractorRetryArgs, 'youtube-client-fallback');
      commandResult = extractorRetryResult;

      if (extractorRetryResult.code === 0) {
        return;
      }

      const browserCandidates = getCookieBrowserCandidates();
      let lastNonCookieCopyErrorResult = commandResult;
      for (const browserName of browserCandidates) {
        if (isCancelled) break;
        throttledUpdate(`Retrying with ${browserName} cookies...`, 0);
        const retryExtraArgs = [
          '--cookies-from-browser',
          browserName,
        ];

        if (sigma.platform.isWindows && isChromiumBrowserName(browserName)) {
          const pluginDir = getPluginDirFromBinaryPath(binaryPath);
          if (pluginDir) {
            retryExtraArgs.unshift('--plugin-dirs', pluginDir);
          }
        }

        const retryArgs = buildYtDlpArgs(ytDlpOptions, formatSelector, retryExtraArgs);
        const retryResult = await runYtDlpAttempt(retryArgs, `cookies:${browserName}`);
        commandResult = retryResult;
        const retryOutputText = (retryResult.stderr || '') + '\n' + (retryResult.stdout || '');
        if (!isChromeCookieCopyFailure(retryOutputText)) {
          lastNonCookieCopyErrorResult = retryResult;
        }
        if (retryResult.code === 0) {
          break;
        }
      }

      if (commandResult.code !== 0) {
        const finalOutputText = (commandResult.stderr || '') + '\n' + (commandResult.stdout || '');
        if (isChromeCookieCopyFailure(finalOutputText) && lastNonCookieCopyErrorResult) {
          commandResult = lastNonCookieCopyErrorResult;
        }
      }
    }
  }

  if (commandResult.code !== 0 && !isCancelled) {
    const stderrText = commandResult.stderr || '';
    const stdoutText = commandResult.stdout || '';
    const fullOutput = stderrText + '\n' + stdoutText;
    const needsJsRuntime = fullOutput.includes('No supported JavaScript runtime');
    const needsLogin = fullOutput.includes('LOGIN_REQUIRED') || fullOutput.includes('Sign in to confirm');
    const errorMessage = extractErrorFromStderr(stderrText);

    console.error('[Video Downloader] yt-dlp failed with code:', commandResult.code);
    console.error('[Video Downloader] stderr:', stderrText);
    console.error('[Video Downloader] stdout:', stdoutText);

    if (needsLogin) {
      sigma.ui.showNotification({
        title: 'Download failed',
        message: 'This video requires YouTube login. Try a different video, or use yt-dlp with --cookies-from-browser option from the terminal.',
        type: 'error'
      });
    } else if (isChromeCookieCopyFailure(fullOutput)) {
      sigma.ui.showNotification({
        title: 'Download failed',
        message: 'Could not access Chromium cookies. Close Chrome/Edge and retry, or use Firefox cookies.',
        type: 'error'
      });
    } else if (needsJsRuntime) {
      sigma.ui.showNotification({
        title: 'Download failed',
        message: 'YouTube requires a JavaScript runtime (Deno). Try reinstalling the extension.',
        type: 'error'
      });
    } else {
      sigma.ui.showNotification({
        title: 'Download failed',
        message: errorMessage || 'yt-dlp exited with an error. Try updating yt-dlp by reinstalling the extension.',
        type: 'error'
      });
    }
  }
}

async function handleDownloadCommand(prefilledUrl) {
  const modalResult = await createDownloadModal(prefilledUrl);

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
  await ensureToolchainReady();

  const ytDlpBinaryDir = getDirectoryFromPath(installResult.binaryPath);
  if (outputDir && ytDlpBinaryDir && isPathWithinPath(outputDir, ytDlpBinaryDir)) {
    try {
      outputDir = await sigma.context.getDownloadsDir();
      sigma.ui.showNotification({
        title: 'Video Downloader',
        message: 'Download location was reset to Downloads to avoid writing into extension binaries.',
        type: 'info',
      });
    } catch (error) {
      sigma.ui.showNotification({
        title: 'Video Downloader',
        message: 'Could not resolve a safe download location. Please choose a folder in the file browser and retry.',
        type: 'error'
      });
      return;
    }
  }

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

let startupActivationPromise = null;

async function handleStartupActivation() {
  if (startupActivationPromise) return startupActivationPromise;
  startupActivationPromise = performStartupActivation();
  return startupActivationPromise;
}

async function performStartupActivation() {
  const autoUpdate = (await sigma.settings.get('autoUpdateBinary')) !== false;
  if (!autoUpdate) return;

  try {
    await ensureBinaryInstalled();
  } catch (error) {
    console.warn('[Video Downloader] Failed to ensure yt-dlp installed:', error);
  }

  try {
    await ensureDenoInstalled();
  } catch (error) {
    console.warn('[Video Downloader] Failed to ensure Deno installed:', error);
  }

  try {
    await ensureFfmpegInstalled();
  } catch (error) {
    console.warn('[Video Downloader] Failed to ensure ffmpeg installed:', error);
  }
}

async function handleInstallActivation() {
  try {
    await ensureBinaryInstalled();
    await ensureToolchainReady();
  } catch (error) {
    sigma.ui.showNotification({
      title: 'Video Downloader',
      message: error.message || 'Failed to set up Video Downloader',
      type: 'error'
    });
  }
}

async function handleUninstallActivation() {
  try {
    await sigma.binary.remove(YTDLP_BINARY_ID);
  } catch (error) {
    console.warn('[Video Downloader] Failed to remove yt-dlp:', error);
  }

  try {
    await sigma.binary.remove(DENO_BINARY_ID);
  } catch (error) {
    console.warn('[Video Downloader] Failed to remove Deno:', error);
  }

  try {
    await sigma.binary.remove(FFMPEG_BINARY_ID);
  } catch (error) {
    console.warn('[Video Downloader] Failed to remove ffmpeg:', error);
  }

  cachedDenoBinaryPath = null;
  cachedFfmpegBinaryPath = null;
  cachedFfprobeBinaryPath = null;
}

async function activate(context) {
  sigma.commands.registerCommand(
    {
      id: 'download-video',
      title: 'Download video, playlist, audio, or stream from URL',
      arguments: [
        {
          name: 'url',
          type: 'text',
          placeholder: 'Paste URL here (YouTube, Twitch, etc.)',
          required: true,
        },
      ],
    },
    async (args) => {
      const providedArgs = args && typeof args === 'object' ? args : {};
      const urlFromArgs = typeof providedArgs.url === 'string' ? providedArgs.url.trim() : '';
      return handleDownloadCommand(urlFromArgs || undefined);
    }
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
