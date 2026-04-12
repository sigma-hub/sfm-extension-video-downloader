import type { ProgressReport, UIElement } from '@sigma-file-manager/api';

export type PlatformKind =
  | 'youtube'
  | 'twitch-live'
  | 'twitch-vod'
  | 'generic';

export interface PreviewState {
  statusElements?: UIElement[];
  statusTextKey?: string;
  isLoading?: boolean;
  needsCookieSetup?: boolean;
  cookieButtonLabel?: string;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  subtitle?: string | null;
}

export interface DownloadModalResult {
  url: string;
  platform: PlatformKind;
  mode: string;
  videoQuality: string;
  audioQuality: string;
  twitchQuality: string;
  liveFromStart: boolean;
}

export type CookieSetupResult =
  | { action: 'imported'; path: string }
  | { action: 'cleared' }
  | null;

export interface YtDlpBuildOptions {
  url: string;
  platform: PlatformKind;
  mode: string;
  videoQuality: string;
  audioQuality: string;
  twitchQuality: string;
  liveFromStart: boolean;
  outputDir?: string | null;
  denoPath?: string | null;
  ffmpegPath?: string | null;
  ffmpegDir?: string | null;
  cookiesFilePath?: string;
}

export interface RunYtDlpOptions extends YtDlpBuildOptions {
  onProgress?: (report: ProgressReport) => void;
  onCancel?: (handler: () => Promise<void>) => void;
  onStreamDetected?: () => void;
}

export interface DownloadProgressState {
  percent: number | null;
  size: string | null;
  speed: string | null;
  eta: string | null;
  type: string;
}

export interface FfmpegProgressState {
  size: string | null;
  time: string | null;
  bitrate: string | null;
  speed: string | null;
  frame: number | null;
  type: string;
}

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;
