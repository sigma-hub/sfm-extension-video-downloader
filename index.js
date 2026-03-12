// @ts-check

/**
 * @typedef {import('@sigma-file-manager/api').ExtensionActivationContext} ExtensionActivationContext
 */

function getT() {
  return (key, params) => sigma?.i18n?.extensionT?.(key, params) ?? key;
}

const YTDLP_BINARY_ID = 'yt-dlp';
const DENO_BINARY_ID = 'deno';
const FFMPEG_BINARY_ID = 'ffmpeg';
const COOKIES_FILE_PATH_STORAGE_KEY = 'cookies-file-path';
const MANAGED_COOKIES_RELATIVE_PATH = 'secrets/youtube-cookies.txt';
let cachedDenoBinaryPath = null;
let cachedFfmpegBinaryPath = null;
let cachedFfprobeBinaryPath = null;
let cachedPluginDirPath = null;
let cachedExtensionStoragePath = null;

const CHROME_COOKIE_UNLOCK_PLUGIN_SOURCE = `import sys

import yt_dlp.cookies

original_func = yt_dlp.cookies._open_database_copy


def unlock_chrome(database_path, tmpdir):
    try:
        return original_func(database_path, tmpdir)
    except PermissionError:
        print('Attempting to unlock cookies', file=sys.stderr)
        unlock_cookies(database_path)
        return original_func(database_path, tmpdir)


yt_dlp.cookies._open_database_copy = unlock_chrome


from ctypes import windll, byref, create_unicode_buffer, pointer, WINFUNCTYPE
from ctypes.wintypes import DWORD, WCHAR, UINT

ERROR_SUCCESS = 0
ERROR_MORE_DATA = 234
RmForceShutdown = 1


@WINFUNCTYPE(None, UINT)
def callback(percent_complete: UINT) -> None:
    pass


rstrtmgr = windll.LoadLibrary("Rstrtmgr")


def unlock_cookies(cookies_path):
    session_handle = DWORD(0)
    session_flags = DWORD(0)
    session_key = (WCHAR * 256)()

    result = DWORD(rstrtmgr.RmStartSession(byref(session_handle), session_flags, session_key)).value

    if result != ERROR_SUCCESS:
        raise RuntimeError(f"RmStartSession returned non-zero result: {result}")

    try:
        result = DWORD(rstrtmgr.RmRegisterResources(session_handle, 1, byref(pointer(create_unicode_buffer(cookies_path))), 0, None, 0, None)).value

        if result != ERROR_SUCCESS:
            raise RuntimeError(f"RmRegisterResources returned non-zero result: {result}")

        proc_info_needed = DWORD(0)
        proc_info = DWORD(0)
        reboot_reasons = DWORD(0)

        result = DWORD(rstrtmgr.RmGetList(session_handle, byref(proc_info_needed), byref(proc_info), None, byref(reboot_reasons))).value

        if result not in (ERROR_SUCCESS, ERROR_MORE_DATA):
            raise RuntimeError(f"RmGetList returned non-successful result: {result}")

        if proc_info_needed.value:
            result = DWORD(rstrtmgr.RmShutdown(session_handle, RmForceShutdown, callback)).value

            if result != ERROR_SUCCESS:
                raise RuntimeError(f"RmShutdown returned non-successful result: {result}")
        else:
            print("File is not locked")
    finally:
        result = DWORD(rstrtmgr.RmEndSession(session_handle)).value

        if result != ERROR_SUCCESS:
            raise RuntimeError(f"RmEndSession returned non-zero result: {result}")
`;

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

async function getManagedCookiesFilePath() {
  return sigma.fs.storage.resolvePath(MANAGED_COOKIES_RELATIVE_PATH);
}

async function importCookiesFile(sourcePath) {
  const importedPath = await sigma.fs.storage.importFile(sourcePath, MANAGED_COOKIES_RELATIVE_PATH);
  await sigma.storage.set(COOKIES_FILE_PATH_STORAGE_KEY, importedPath);
  return importedPath;
}

async function clearStoredCookies() {
  await sigma.storage.remove(COOKIES_FILE_PATH_STORAGE_KEY);
  try {
    await sigma.fs.storage.deleteFile(MANAGED_COOKIES_RELATIVE_PATH);
  } catch (error) {
    console.warn('[Video Downloader] Failed to delete managed cookies file:', error);
  }
}

async function getSavedCookiesPath() {
  const storedPath = await sigma.storage.get(COOKIES_FILE_PATH_STORAGE_KEY);
  const managedPath = await getManagedCookiesFilePath();
  const hasManagedCookies = await sigma.fs.storage.exists(MANAGED_COOKIES_RELATIVE_PATH);

  if (hasManagedCookies) {
    if (storedPath !== managedPath) {
      await sigma.storage.set(COOKIES_FILE_PATH_STORAGE_KEY, managedPath);
    }
    return managedPath;
  }

  if (!storedPath) {
    return null;
  }

  if (cachedExtensionStoragePath && isPathWithinPath(storedPath, cachedExtensionStoragePath)) {
    await sigma.storage.remove(COOKIES_FILE_PATH_STORAGE_KEY);
    return null;
  }

  try {
    return await importCookiesFile(storedPath);
  } catch (error) {
    console.warn('[Video Downloader] Failed to migrate saved cookies into managed storage:', error);
    await sigma.storage.remove(COOKIES_FILE_PATH_STORAGE_KEY);
    return null;
  }
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
    const renamedCount = await sigma.shell.renamePartFilesToTs(directory);
    console.log('[Video Downloader] Renamed', renamedCount, 'files to .ts');
  } catch (err) {
    console.warn('[Video Downloader] Failed to rename .part files:', err);
  }
}

function parseDownloadInfo(line) {
  const delim = '\t';
  if (line.startsWith(`PROG${delim}`)) {
    const parts = line.split(delim);
    if (parts.length >= 5) {
      const percentStr = (parts[1] || '').trim();
      const percent = percentStr && !/^N\/A%?$/i.test(percentStr) ? parseFloat(percentStr) : null;
      const size = parts[2] && !/^N\/A$/i.test((parts[2] || '').trim()) ? String(parts[2]).replace(/\s+/g, ' ').trim() : null;
      const speed = parts[3] && !/^Unknown\s*B\/s$/i.test((parts[3] || '').trim()) ? String(parts[3]).replace(/\s+/g, ' ').trim() : null;
      const rawEta = (parts[4] || '').trim();
      const eta = rawEta && !/^Unknown$/i.test(rawEta) && /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawEta) ? rawEta : null;
      return { percent: Number.isFinite(percent) ? percent : null, size, speed, eta, type: 'download' };
    }
  }

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

function formatDownloadStats(info) {
  const parts = [];

  if (info.size) {
    parts.push(info.size);
  }

  if (info.speed) {
    parts.push(info.speed);
  }

  if (info.eta) {
    parts.push(`ETA ${info.eta}`);
  }

  return parts.length > 0 ? parts.join(' • ') : '';
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

  return parts.length > 0 ? parts.join(' • ') : (getT()('recordingStream') || 'Recording stream...');
}

function formatStatusMessage(line) {
  const message = line.replace(/^\[[^\]]+\]\s*/, '').trim();
  const maxLength = 60;
  return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
}

function normalizePreviewErrorMessage(rawError) {
  if (!rawError) return '';
  return String(rawError)
    .replace(/\s+/g, ' ')
    .replace(/^error:\s*/i, '')
    .trim();
}

function isYouTubePreviewAuthError(rawError) {
  const lowerError = normalizePreviewErrorMessage(rawError).toLowerCase();
  return lowerError.includes('sign in to confirm')
    || lowerError.includes('confirm you\'re not a bot')
    || lowerError.includes('login_required')
    || lowerError.includes('cookies')
    || lowerError.includes('members-only')
    || lowerError.includes('private video')
    || lowerError.includes('age-restricted')
    || lowerError.includes('use --cookies-from-browser')
    || lowerError.includes('no title found in player responses');
}

function buildPreviewNoticeElements(options) {
  return [
    sigma.ui.alert({
      title: options.title,
      description: [options.description, options.detail].filter(Boolean).join(' '),
      tone: options.tone || 'error',
    }),
  ];
}

function getPreviewErrorState(url, rawError, hasSavedCookies) {
  const platform = detectPlatform(url);
  const normalizedError = normalizePreviewErrorMessage(rawError);

  const t = getT();
  if (platform === 'youtube' && isYouTubePreviewAuthError(normalizedError)) {
    return {
      statusElements: buildPreviewNoticeElements({
        title: t('previewUnavailable'),
        description: hasSavedCookies
          ? t('savedCookiesDidNotUnlock')
          : t('youtubeNeedsCookies'),
        detail: hasSavedCookies
          ? t('replaceCookiesAndRetry')
          : t('setupYoutubeCookiesButton'),
      }),
      needsCookieSetup: true,
      cookieButtonLabel: hasSavedCookies ? t('replaceYoutubeCookies') : t('setupYoutubeCookiesLabel'),
    };
  }

  const isYoutube = platform === 'youtube';
  return {
    statusElements: buildPreviewNoticeElements({
      title: t('couldNotLoadPreview'),
      description: t('urlInvalidOrUnavailable'),
      detail: normalizedError ? t('tryDifferentUrlOrRetry') : '',
    }),
    needsCookieSetup: isYoutube,
    cookieButtonLabel: hasSavedCookies ? t('replaceYoutubeCookies') : t('setupYoutubeCookiesLabel'),
  };
}

function getVideoQualityOptions(t) {
  return [
    { value: 'best', label: t('bestAvailable') },
    { value: '1080', label: t('quality1080') },
    { value: '720', label: t('quality720') },
    { value: '480', label: t('quality480') },
    { value: '360', label: t('quality360') }
  ];
}

function getTwitchQualityOptions(t) {
  return [
    { value: 'best', label: t('sourceBest') },
    { value: '1080p60', label: t('quality1080p60') },
    { value: '1080p', label: t('quality1080p') },
    { value: '720p60', label: t('quality720p60') },
    { value: '720p', label: t('quality720p') },
    { value: '480p', label: t('quality480p') },
    { value: '360p', label: t('quality360p') },
    { value: 'audio_only', label: t('audioOnly') }
  ];
}

function getAudioQualityOptions(t) {
  return [
    { value: 'best', label: t('bestAvailable') },
    { value: 'medium', label: t('mediumQuality') },
    { value: 'low', label: t('lowQuality') }
  ];
}

function getDownloadModes(t) {
  return [
    { value: 'video-audio', label: t('videoAndAudio') },
    { value: 'video-only', label: t('videoOnly') },
    { value: 'audio-only', label: t('audioOnly') }
  ];
}

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

  if (videoQuality === 'best') return null;
  return `bestvideo[height<=${videoQuality}]+bestaudio/best`;
}

function buildYtDlpArgs(options, formatSelector, extraArgs = []) {
  const PROGRESS_DELIM = '\t';
  const progressTemplate = `download:PROG${PROGRESS_DELIM}%(progress._percent_str)s${PROGRESS_DELIM}%(progress._total_bytes_str)s${PROGRESS_DELIM}%(progress._speed_str)s${PROGRESS_DELIM}%(progress._eta_str)s`;

  const args = [
    '--no-playlist',
    '--newline',
    '--restrict-filenames',
    '--progress-template',
    progressTemplate,
    '--remote-components',
    'ejs:npm',
    '--remote-components',
    'ejs:github',
  ];

  if (formatSelector) {
    args.push('-f', formatSelector);
  }

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

  if (options.denoPath) {
    args.push('--js-runtimes', 'deno');
  }

  if (options.pluginDir) {
    args.push('--plugin-dirs', options.pluginDir);
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

function isDpapiDecryptionFailure(outputText) {
  return outputText.includes('Failed to decrypt with DPAPI');
}

function isBrowserCookieNotFound(outputText) {
  const lowerOutput = outputText.toLowerCase();
  return lowerOutput.includes('could not find') && lowerOutput.includes('cookies database');
}

function isCookieInfraFailure(outputText) {
  return isChromeCookieCopyFailure(outputText)
    || isDpapiDecryptionFailure(outputText)
    || isBrowserCookieNotFound(outputText);
}

function isChromiumBrowser(name) {
  return name === 'chrome' || name === 'edge' || name === 'chromium';
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

async function ensureCookieUnlockPlugin() {
  if (!sigma.platform.isWindows) return null;
  if (cachedPluginDirPath) return cachedPluginDirPath;

  try {
    const pluginFileRelPath = 'plugins/yt-dlp-ChromeCookieUnlock/yt_dlp_plugins/postprocessor/chrome_cookie_unlock.py';
    const pluginExists = await sigma.fs.private.exists(pluginFileRelPath);

    if (!pluginExists) {
      const pluginDirAbsPath = await sigma.fs.private.resolvePath(
        'plugins/yt-dlp-ChromeCookieUnlock/yt_dlp_plugins/postprocessor'
      );
      await sigma.shell.run('cmd', ['/c', `mkdir "${pluginDirAbsPath}" 2>nul`]);

      const encoder = new TextEncoder();
      await sigma.fs.private.writeFile(pluginFileRelPath, encoder.encode(CHROME_COOKIE_UNLOCK_PLUGIN_SOURCE));
      console.log('[Video Downloader] Installed ChromeCookieUnlock plugin');
    }

    cachedPluginDirPath = await sigma.fs.private.resolvePath('plugins');
    console.log('[Video Downloader] Plugin directory:', cachedPluginDirPath);
    return cachedPluginDirPath;
  } catch (error) {
    console.error('[Video Downloader] Failed to install cookie unlock plugin:', error);
    return null;
  }
}

async function showCookieSetupModal() {
  const t = getT();
  const existingCookiesPath = await getSavedCookiesPath();
  const hasSavedCookies = Boolean(existingCookiesPath);

  return new Promise((resolve) => {
    const modal = sigma.ui.createModal({
      title: hasSavedCookies ? t('cookiesDialogTitleManage') : t('cookiesDialogTitleSetup'),
      width: 520,
      content: [
        sigma.ui.text(t('cookiesDialogIntro')),
        sigma.ui.text(t('cookiesDialogExportInstructions')),
        sigma.ui.separator(),
        sigma.ui.text(t('cookiesDialogWarning')),
        sigma.ui.separator(),
        sigma.ui.text(t('cookiesDialogHowToExport')),
        sigma.ui.text(t('cookiesDialogStep1')),
        sigma.ui.text('https://github.com/kairi003/Get-cookies.txt-Locally'),
        sigma.ui.text(t('cookiesDialogStep2')),
        sigma.ui.text(t('cookiesDialogStep3')),
        sigma.ui.text(t('cookiesDialogStep4')),
        sigma.ui.text(t('cookiesDialogStep5')),
        sigma.ui.text(t('cookiesDialogStep6')),
        sigma.ui.text(t('cookiesDialogStep7')),
        sigma.ui.text(t('cookiesDialogStep8')),
      ],
      buttons: [
        {
          id: 'select',
          label: hasSavedCookies ? t('replaceYoutubeCookies') : t('importCookiesFile'),
          variant: 'primary',
          shortcut: { key: 'Enter' }
        },
        ...(hasSavedCookies ? [{ id: 'clear', label: t('clearStoredCookies'), variant: 'danger' }] : []),
      ],
    });

    modal.onSubmit(async (_values, buttonId) => {
      if (buttonId === 'select') {
        const selectedFile = await sigma.dialog.openFile({
          title: t('selectCookiesFile'),
          filters: [{ name: t('cookieFilesFilter'), extensions: ['txt'] }],
        });
        const filePath = Array.isArray(selectedFile) ? selectedFile[0] : selectedFile;
        if (!filePath) {
          resolve(null);
          return;
        }

        try {
          const managedPath = await importCookiesFile(filePath);
          sigma.ui.showNotification({
            title: t('extensionTitle'),
            subtitle: t('cookiesImportedNotification'),
            type: 'success',
          });
          resolve({ action: 'imported', path: managedPath });
        } catch (error) {
          sigma.ui.showNotification({
            title: t('extensionTitle'),
            subtitle: error?.message || t('failedToImportCookies'),
            type: 'error',
          });
          resolve(null);
        }
        return;
      }

      if (buttonId === 'clear') {
        await clearStoredCookies();
        sigma.ui.showNotification({
          title: t('extensionTitle'),
          subtitle: t('cookiesClearedNotification'),
          type: 'info',
        });
        resolve({ action: 'cleared' });
      }
    });

    modal.onClose(() => {
      resolve(null);
    });
  });
}

function buildPreviewContent(url, videoInfo, previewState) {
  const t = getT();
  const baseContent = [
    sigma.ui.input({
      id: 'url',
      label: t('websiteUrl'),
      placeholder: t('pasteUrlHere'),
      value: url || '',
    }),
  ];

  if (videoInfo && videoInfo.thumbnail) {
    baseContent.push(
      sigma.ui.text(t('supportsYoutubeTwitch')),
      sigma.ui.previewCard({
        thumbnail: videoInfo.thumbnail,
        title: videoInfo.title || t('untitled'),
        subtitle: videoInfo.subtitle || '',
      }),
      sigma.ui.separator(),
      sigma.ui.select({
        id: 'mode',
        label: t('downloadType'),
        options: getDownloadModes(t),
        value: 'video-audio',
      }),
      sigma.ui.select({
        id: 'videoQuality',
        label: t('videoQuality'),
        options: getVideoQualityOptions(t),
        value: 'best',
      }),
      sigma.ui.select({
        id: 'audioQuality',
        label: t('audioQuality'),
        options: getAudioQualityOptions(t),
        value: 'best',
      }),
      sigma.ui.checkbox({
        id: 'liveFromStart',
        label: t('liveFromStartLabel'),
        checked: false,
      }),
    );
  } else {
    baseContent.push(sigma.ui.text(t('supportsYoutubeTwitch')));
    if (previewState?.statusElements?.length) {
      baseContent.push(...previewState.statusElements);
    } else if (previewState?.statusTextKey) {
      baseContent.push({ type: 'text', id: 'status', value: t(previewState.statusTextKey) });
    }
    if (previewState?.isLoading) {
      baseContent.push(sigma.ui.previewCardSkeleton());
    }
  }

  return baseContent;
}

function formatPreviewSubtitle(data) {
  const parts = [];
  const type = data._type || 'video';
  const liveStatus = data.live_status;

  if (liveStatus === 'is_live') {
    parts.push('Live stream');
  }
  else if (liveStatus === 'is_upcoming') {
    parts.push('Upcoming');
  }
  else if (type === 'playlist' || type === 'multi_video') {
    const count = data.n_entries ?? data.playlist_count ?? data.entries?.length;
    const label = count !== undefined ? `${count} ${count === 1 ? 'video' : 'videos'}` : 'Playlist';
    parts.push(label);
  }
  else {
    const duration = data.duration;
    if (typeof duration === 'number' && duration > 0) {
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      parts.push(minutes >= 60
        ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`);
    }
    else {
      parts.push('Video');
    }
  }

  const uploader = data.uploader || data.channel || data.creator;
  if (uploader) {
    parts.push(uploader);
  }

  return parts.join(' · ') || null;
}

function buildVideoInfoArgs(url, options) {
  const args = [
    '--no-playlist',
    '--dump-json',
    '--remote-components',
    'ejs:npm',
    '--remote-components',
    'ejs:github',
  ];

  if (options.denoPath) {
    args.push('--js-runtimes', 'deno');
  }

  if (options.pluginDir) {
    args.push('--plugin-dirs', options.pluginDir);
  }

  if (options.cookiesFilePath) {
    args.push('--cookies', options.cookiesFilePath);
  }

  args.push(url);
  return args;
}

async function thumbnailUrlToDataUrl(thumbnailUrl) {
  try {
    const ext = thumbnailUrl.includes('.webp') ? 'webp' : 'jpg';
    const relPath = `preview.${ext}`;
    const fullPath = await sigma.fs.private.resolvePath(relPath);
    await sigma.fs.downloadFile(thumbnailUrl, fullPath);
    const bytes = await sigma.fs.private.readFile(relPath);
    const uint8 = new Uint8Array(bytes);
    let binary = '';
    const chunkSize = 8192;
    for (let offset = 0; offset < uint8.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, uint8.subarray(offset, offset + chunkSize));
    }
    const base64 = btoa(binary);
    const mime = ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.warn('[Video Downloader] thumbnailUrlToDataUrl failed, using URL:', err);
    return thumbnailUrl;
  }
}

async function fetchVideoInfo(effectiveBinaryPath, url, toolchainOptions) {
  try {
    const args = buildVideoInfoArgs(url, toolchainOptions);
    const result = await sigma.shell.run(effectiveBinaryPath, args);
    if (result.code !== 0 || !result.stdout || !result.stdout.trim()) {
      const stderrSummary = extractErrorFromStderr(result.stderr || '') || result.stderr?.split('\n').filter((line) => line.trim()).slice(-3).join(' ') || 'Unknown error';
      return { error: stderrSummary };
    }
    const data = JSON.parse(result.stdout);
    let thumbnail = null;
    const targetWidth = 128;
    if (data.thumbnails && data.thumbnails.length > 0) {
      const withUrl = data.thumbnails.filter((t) => t.url);
      if (withUrl.length > 0) {
        const byWidth = [...withUrl].sort((a, b) => {
          const widthA = a.width ?? Infinity;
          const widthB = b.width ?? Infinity;
          return widthA - widthB;
        });
        const suitable = byWidth.find((t) => (t.width ?? 0) >= targetWidth);
        thumbnail = (suitable ?? byWidth[0]).url;
      }
    }
    if (!thumbnail) {
      thumbnail = data.thumbnail;
    }
    if (!thumbnail) {
      return { error: 'No thumbnail in response' };
    }
    const dataUrl = await thumbnailUrlToDataUrl(thumbnail);
    const subtitle = formatPreviewSubtitle(data);
    return { title: data.title || '', thumbnail: dataUrl, subtitle };
  } catch (parseError) {
    const message = parseError?.message || String(parseError);
    console.error('[Video Downloader] fetchVideoInfo error:', parseError);
    return { error: message };
  }
}

async function createDownloadModal(prefilledUrl) {
  let videoInfoValid = false;
  let debounceTimeout = null;
  let fetchAborted = false;

  return new Promise((resolve) => {
    const t = getT();
    const modal = sigma.ui.createModal({
      title: t('downloadFromUrl'),
      width: 480,
      content: buildPreviewContent(prefilledUrl || '', null, { statusTextKey: 'pasteUrlToSeePreview' }),
      buttons: [],
    });

    async function onUrlChange(urlValue) {
      const url = typeof urlValue === 'string' ? urlValue.trim() : '';
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }
      fetchAborted = true;
      videoInfoValid = false;

      if (!url) {
        modal.setContent(buildPreviewContent('', null, { statusTextKey: 'pasteUrlToSeePreview' }));
        modal.setButtons([]);
        return;
      }

      modal.setContent(buildPreviewContent(url, null, { statusTextKey: 'checkingUrl', isLoading: true }));
      modal.setButtons([]);
      const urlForFetch = url;

      debounceTimeout = setTimeout(async () => {
        debounceTimeout = null;
        fetchAborted = false;
        let effectiveBinaryPath;
        let toolchainOptions;
        try {
          const installResult = await ensureBinaryInstalled();
          await ensureToolchainReady();
          const denoPath = cachedDenoBinaryPath || await ensureDenoInstalled();
          const denoDir = getDirectoryFromPath(denoPath);
          const wrapperPath = denoDir ? await ensureYtDlpWrapper(installResult.binaryPath, denoDir) : null;
          effectiveBinaryPath = wrapperPath || installResult.binaryPath;
          const pluginDir = await ensureCookieUnlockPlugin();
          const platform = detectPlatform(urlForFetch);
          const savedCookiesPath = platform === 'youtube' ? await getSavedCookiesPath() : null;
          toolchainOptions = {
            denoPath,
            pluginDir,
            cookiesFilePath: savedCookiesPath || undefined,
          };
        } catch {
          if (fetchAborted) return;
          modal.setContent(buildPreviewContent(urlForFetch, null, {
            statusTextKey: 'failedSetup',
          }));
          modal.setButtons([]);
          return;
        }

        const videoInfo = await fetchVideoInfo(effectiveBinaryPath, urlForFetch, toolchainOptions);
        if (fetchAborted) return;

        if (videoInfo && videoInfo.thumbnail) {
          const isYouTubeUrl = detectPlatform(urlForFetch) === 'youtube';
          const savedCookiesPath = await getSavedCookiesPath();
          const showCookieWarning = isYouTubeUrl && !savedCookiesPath;
          const showDownloadButton = !showCookieWarning;
          if (showDownloadButton) {
            videoInfoValid = true;
          }
          const fullContent = buildPreviewContent(urlForFetch, videoInfo, null);
          if (showCookieWarning) {
            const t = getT();
            fullContent.push(sigma.ui.separator());
            fullContent.push(sigma.ui.text(t('youtubeCookiesWarning')));
            fullContent.push({ type: 'button', id: 'setup-cookies', label: t('setupYoutubeCookiesLabel'), variant: 'primary' });
            modal.setButtons([]);
          } else {
            modal.setButtons([{ id: 'download', label: t('download'), variant: 'primary', shortcut: { key: 'Enter' } }]);
          }
          modal.setContent(fullContent);
          modal.updateElement('url', { value: urlForFetch });
        } else {
          const rawError = videoInfo?.error || '';
          const savedCookiesPath = detectPlatform(urlForFetch) === 'youtube'
            ? await getSavedCookiesPath()
            : null;
          const previewErrorState = getPreviewErrorState(urlForFetch, rawError, Boolean(savedCookiesPath));
          const errorContent = buildPreviewContent(urlForFetch, null, previewErrorState);
          if (previewErrorState.needsCookieSetup) {
            errorContent.push(sigma.ui.separator());
            errorContent.push({
              type: 'button',
              id: 'setup-cookies',
              label: previewErrorState.cookieButtonLabel,
              variant: 'primary'
            });
          }
          modal.setContent(errorContent);
          modal.setButtons([]);
          modal.updateElement('url', { value: urlForFetch });
        }
      }, 400);
    }

    modal.onValueChange((elementId, value) => {
      if (elementId === 'url') {
        onUrlChange(value);
      }
    });

    if (prefilledUrl && prefilledUrl.trim()) {
      onUrlChange(prefilledUrl);
    }

    modal.onSubmit(async (values, buttonId) => {
      if (buttonId === 'setup-cookies') {
        const cookieSetupResult = await showCookieSetupModal();
        if (cookieSetupResult) {
          const url = typeof values.url === 'string' ? values.url.trim() : '';
          if (url) {
            onUrlChange(url);
          } else if (cookieSetupResult.action === 'imported') {
            modal.updateElement('setup-cookies', { label: t('cookiesConfigured'), disabled: true });
          }
        }
        return false;
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
        mode: values.mode ?? 'video-audio',
        videoQuality: values.videoQuality ?? 'best',
        audioQuality: values.audioQuality ?? 'best',
        twitchQuality: values.videoQuality ?? 'best',
        liveFromStart: values.liveFromStart ?? false,
      });
    });

    modal.onClose(() => {
      fetchAborted = true;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      resolve(null);
    });
  });
}

let cachedWrapperPath = null;

async function ensureYtDlpWrapper(ytDlpBinaryPath, denoDir) {
  if (cachedWrapperPath) return cachedWrapperPath;

  if (sigma.platform.isWindows) {
    const script = `@echo off\r\nset "PATH=${denoDir};%PATH%"\r\n"${ytDlpBinaryPath}" %*\r\n`;
    const wrapperRelativePath = 'yt-dlp-wrapper.cmd';
    await sigma.fs.private.writeFile(wrapperRelativePath, new TextEncoder().encode(script));
    cachedWrapperPath = await sigma.fs.private.resolvePath(wrapperRelativePath);
  } else {
    const script = `#!/bin/sh\nexport PATH="${denoDir}:$PATH"\n"${ytDlpBinaryPath}" "$@"\n`;
    const wrapperRelativePath = 'yt-dlp-wrapper.sh';
    await sigma.fs.private.writeFile(wrapperRelativePath, new TextEncoder().encode(script));
    cachedWrapperPath = await sigma.fs.private.resolvePath(wrapperRelativePath);
  }

  console.log('[Video Downloader] Created wrapper at:', cachedWrapperPath);
  return cachedWrapperPath;
}

async function runYtDlp(binaryPath, options) {
  const t = getT();
  const formatSelector = buildFormatSelector(options);
  await ensureToolchainReady();
  const ffmpegPath = await ensureFfmpegInstalled();
  const ffmpegDir = getDirectoryFromPath(ffmpegPath);
  const pluginDir = await ensureCookieUnlockPlugin();
  const denoPath = cachedDenoBinaryPath || await ensureDenoInstalled();
  const denoDir = getDirectoryFromPath(denoPath);
  const wrapperPath = denoDir ? await ensureYtDlpWrapper(binaryPath, denoDir) : null;
  const effectiveBinaryPath = wrapperPath || binaryPath;
  console.log('[Video Downloader] Using ffmpeg path:', ffmpegPath);
  console.log('[Video Downloader] Using deno path:', denoPath);
  console.log('[Video Downloader] Using wrapper:', effectiveBinaryPath);
  const ytDlpOptions = {
    ...options,
    ffmpegPath,
    ffmpegDir,
    pluginDir,
    denoPath,
  };
  const defaultArgs = buildYtDlpArgs(ytDlpOptions, formatSelector);

  console.log('[Video Downloader] Running yt-dlp with args:', JSON.stringify(defaultArgs));

  let lastDownloadState = { size: null, speed: null, eta: null };
  let lastUpdateTime = 0;
  let pendingUpdate = null;
  let isLiveStream = false;
  let streamDetected = false;
  let isCancelled = false;
  let activeCancelCommand = null;
  let cookieRetriesExhausted = false;
  const UPDATE_INTERVAL = 200;

  function throttledUpdate(update) {
    if (isCancelled) return;

    const now = Date.now();
    if (now - lastUpdateTime >= UPDATE_INTERVAL) {
      lastUpdateTime = now;
      if (options.onProgress) {
        options.onProgress(update);
      }
    } else {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate.timeout);
      }
      const timeout = setTimeout(() => {
        if (pendingUpdate && options.onProgress && !isCancelled) {
          options.onProgress(pendingUpdate.data);
          pendingUpdate = null;
          lastUpdateTime = Date.now();
        }
      }, UPDATE_INTERVAL - (now - lastUpdateTime));
      pendingUpdate = { data: update, timeout };
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

      if (line.startsWith('PROG\t') || line.includes('[download]')) {
        const info = parseDownloadInfo(line);

        if (info.percent !== null) {
          const merged = {
            percent: info.percent,
            size: info.size ?? lastDownloadState.size,
            speed: info.speed ?? lastDownloadState.speed,
            eta: info.eta ?? lastDownloadState.eta,
          };
          if (info.size !== null) lastDownloadState.size = info.size;
          if (info.speed !== null) lastDownloadState.speed = info.speed;
          if (info.eta !== null) lastDownloadState.eta = info.eta;
          throttledUpdate({
            subtitle: t('downloading'),
            description: formatDownloadStats(merged),
            value: Math.max(0, Math.min(100, merged.percent)),
          });
          return;
        }

        throttledUpdate({ subtitle: t('preparingToDownload'), description: formatStatusMessage(line) });
        return;
      }

      const ffmpegInfo = parseFfmpegProgress(line);
      if (ffmpegInfo) {
        lastDownloadState = { size: null, speed: null, eta: null };
        const statusTitle = isLiveStream ? t('recordingStream') : t('processing');
        throttledUpdate({ subtitle: statusTitle, description: formatStreamProgressMessage(ffmpegInfo) });
        return;
      }

      if (
        line.includes('[Merger]')
        || line.includes('[ExtractAudio]')
        || line.includes('[FixupM3u8]')
      ) {
        lastDownloadState = { size: null, speed: null, eta: null };
        throttledUpdate({ subtitle: t('finalizing'), description: '' });
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
        throttledUpdate({ subtitle: t('preparingToDownload'), description: formatStatusMessage(line) });
      }
  };

  async function runYtDlpAttempt(attemptArgs, attemptLabel) {
    console.log('[Video Downloader] Running yt-dlp attempt:', attemptLabel, JSON.stringify(attemptArgs));
    const commandTask = await sigma.shell.runWithProgress(
      effectiveBinaryPath,
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

  if (options.cookiesFilePath) {
    throttledUpdate({ subtitle: t('downloadingWithCookies'), description: '' });
    const cookiesArgs = buildYtDlpArgs(ytDlpOptions, formatSelector, [
      '--cookies', options.cookiesFilePath,
    ]);
    const cookiesResult = await runYtDlpAttempt(cookiesArgs, 'explicit-cookies-file');
    if (cookiesResult.code === 0) {
      return { success: true, needsCookieSetup: false };
    }
    if (!isCancelled) {
      const t = getT();
      const errorMessage = extractErrorFromStderr(cookiesResult.stderr || '');
      sigma.ui.showNotification({
        title: t('downloadFailed'),
        subtitle: errorMessage || t('ytdlpErrorCheckUrl'),
        type: 'error'
      });
    }
    return { success: false, needsCookieSetup: false };
  }

  let commandResult = await runYtDlpAttempt(defaultArgs, 'default');

  if (commandResult.code !== 0 && !isCancelled) {
    const fullOutput = (commandResult.stderr || '') + '\n' + (commandResult.stdout || '');
    if (shouldRetryWithBrowserCookies(options, fullOutput)) {
      const savedCookiesPath = await getSavedCookiesPath();
      if (savedCookiesPath && !isCancelled) {
        throttledUpdate({ subtitle: t('checkingBrowserCookies'), description: t('tryingSavedCookies') });
        const savedCookiesArgs = buildYtDlpArgs(ytDlpOptions, formatSelector, [
          '--cookies', savedCookiesPath,
        ]);
        const savedCookiesResult = await runYtDlpAttempt(savedCookiesArgs, 'saved-cookies-file');
        commandResult = savedCookiesResult;
        if (savedCookiesResult.code === 0) {
          return { success: true, needsCookieSetup: false };
        }
        const savedCookiesOutput = (savedCookiesResult.stderr || '') + '\n' + (savedCookiesResult.stdout || '');
        if (!shouldRetryWithBrowserCookies({ platform: options.platform }, savedCookiesOutput)) {
          console.log('[Video Downloader] Saved cookies worked (auth passed) but download failed for another reason');
          return { success: false, needsCookieSetup: false };
        }
        console.log('[Video Downloader] Saved cookies file did not work, clearing saved path');
        await clearStoredCookies();
      }

      if (commandResult.code !== 0 && !isCancelled) {
        const extractorRetryArgs = buildYtDlpArgs(ytDlpOptions, formatSelector, [
          '--extractor-args',
          'youtube:player_client=tv,ios,web',
        ]);
        throttledUpdate({ subtitle: t('checkingBrowserCookies'), description: t('tryingAlternateClients') });
        const extractorRetryResult = await runYtDlpAttempt(extractorRetryArgs, 'youtube-client-fallback');
        commandResult = extractorRetryResult;
      }

      if (commandResult.code === 0) {
        return { success: true, needsCookieSetup: false };
      }

      const browserCandidates = getCookieBrowserCandidates();
      let chromiumDpapiFailure = false;
      for (const browserName of browserCandidates) {
        if (isCancelled) break;
        if (chromiumDpapiFailure && isChromiumBrowser(browserName)) {
          console.log(`[Video Downloader] Skipping ${browserName} (DPAPI decryption failed for another Chromium browser)`);
          continue;
        }
        throttledUpdate({ subtitle: t('checkingBrowserCookies'), description: t('tryingBrowser', { browserName }) });
        const retryExtraArgs = [
          '--cookies-from-browser',
          browserName,
        ];

        const retryArgs = buildYtDlpArgs(ytDlpOptions, formatSelector, retryExtraArgs);
        const retryResult = await runYtDlpAttempt(retryArgs, `cookies:${browserName}`);
        commandResult = retryResult;
        const retryOutputText = (retryResult.stderr || '') + '\n' + (retryResult.stdout || '');
        if (isDpapiDecryptionFailure(retryOutputText) && isChromiumBrowser(browserName)) {
          chromiumDpapiFailure = true;
        }
        if (retryResult.code === 0) {
          break;
        }
      }

      if (commandResult.code !== 0 && !isCancelled) {
        cookieRetriesExhausted = true;
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

    if (cookieRetriesExhausted) {
      return { success: false, needsCookieSetup: true };
    }

    const t = getT();
    if (needsLogin) {
      sigma.ui.showNotification({
        title: t('downloadFailed'),
        subtitle: t('videoRequiresLogin'),
        type: 'error'
      });
    } else if (needsJsRuntime) {
      sigma.ui.showNotification({
        title: t('downloadFailed'),
        subtitle: t('youtubeNeedsDeno'),
        type: 'error'
      });
    } else {
      sigma.ui.showNotification({
        title: t('downloadFailed'),
        subtitle: errorMessage || t('ytdlpErrorReinstall'),
        type: 'error'
      });
    }
  }

  return { success: commandResult.code === 0, needsCookieSetup: false };
}

async function handleDownloadCommand(prefilledUrl) {
  const t = getT();
  const modalResult = await createDownloadModal(prefilledUrl);

  if (!modalResult || !modalResult.url) {
    return;
  }

  const installResult = await ensureBinaryInstalled();
  await ensureToolchainReady();

  let outputDir = sigma.context.getCurrentPath();
  let usedFallback = false;

  const ytDlpBinaryDir = getDirectoryFromPath(installResult.binaryPath);
  if (outputDir && ytDlpBinaryDir && isPathWithinPath(outputDir, ytDlpBinaryDir)) {
    outputDir = null;
  }

  if (!outputDir) {
    try {
      outputDir = await sigma.context.getDownloadsDir();
      usedFallback = true;
    } catch (error) {
      const t = getT();
      sigma.ui.showNotification({
        title: t('extensionTitle'),
        subtitle: t('couldNotDetermineLocation'),
        type: 'error'
      });
      return;
    }
  }

  if (usedFallback) {
    const t = getT();
    sigma.ui.showNotification({
      title: t('extensionTitle'),
      subtitle: t('downloadingToDownloads'),
      type: 'info',
    });
  }

  let isLiveStream = modalResult.platform === 'twitch-live';

  const progressTitle = isLiveStream ? t('recordingStream') : t('downloadingVideo');

  const progressResult = await sigma.ui.withProgress(
    {
      subtitle: progressTitle,
      location: 'notification',
      cancellable: true
    },
    async (progress, token) => {
      let onCancelHandler = null;
      token.onCancellationRequested(() => {
        const stoppedMessage = isLiveStream
          ? t('recordingStopped')
          : t('downloadStopped');
        progress.report({ subtitle: stoppedMessage, description: '' });
        if (onCancelHandler) {
          onCancelHandler();
        }
      });

      const downloadResult = await runYtDlp(installResult.binaryPath, {
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
        return { cancelled: true, isLiveStream, needsCookieSetup: false };
      }

      if (downloadResult && downloadResult.needsCookieSetup) {
        return { cancelled: false, isLiveStream, needsCookieSetup: true };
      }

      if (downloadResult && downloadResult.success) {
        progress.report({ description: t('downloadComplete'), value: 100 });
        await sleep(1500);
      }

      return { cancelled: false, isLiveStream, needsCookieSetup: false };
    }
  );

  if (progressResult.cancelled) {
    return;
  }

  if (progressResult.needsCookieSetup) {
    const cookieSetupResult = await showCookieSetupModal();
    if (!cookieSetupResult || cookieSetupResult.action !== 'imported') return;
    await handleDownloadCommand(modalResult.url);
    return;
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
  if (autoUpdate) {
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

    try {
      await ensureCookieUnlockPlugin();
    } catch (error) {
      console.warn('[Video Downloader] Failed to install cookie unlock plugin:', error);
    }
  }

  try {
    await getSavedCookiesPath();
  } catch (error) {
    console.warn('[Video Downloader] Failed to initialize managed cookies storage:', error);
  }
}

async function handleInstallActivation() {
  try {
    await ensureBinaryInstalled();
    await ensureToolchainReady();
    await ensureCookieUnlockPlugin();
  } catch (error) {
    const t = getT();
    sigma.ui.showNotification({
      title: t('extensionTitle'),
      subtitle: error.message || t('failedToSetupExtension'),
      type: 'error'
    });
  }
}

async function handleUninstallActivation() {
  try {
    await clearStoredCookies();
  } catch (error) {
    console.warn('[Video Downloader] Failed to clear stored cookies:', error);
  }

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
  cachedPluginDirPath = null;
  cachedWrapperPath = null;
}

/**
 * @param {ExtensionActivationContext} context
 */
async function activate(context) {
  await sigma.i18n.mergeFromPath('locales');

  cachedExtensionStoragePath = context?.storagePath || null;

  const t = getT();
  sigma.commands.registerCommand(
    {
      id: 'download-video',
      title: t('downloadFromUrl'),
    },
    async () => {
      return handleDownloadCommand();
    }
  );

  sigma.commands.registerCommand(
    {
      id: 'setup-youtube-cookies',
      title: t('setupYoutubeCookies'),
    },
    async () => {
      return showCookieSetupModal();
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
