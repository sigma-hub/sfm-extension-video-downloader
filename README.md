# Video Downloader Extension

An official extension for Sigma File Manager that downloads videos, playlists, audio, and streams from YouTube, Twitch, and thousands of other websites using the open-source tool [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Features

- Download videos, playlists, audio, or streams from URL via the command palette
- Choose download mode: video + audio, video only, or audio only
- Select video and audio quality presets
- Downloads the open-source tool yt-dlp automatically on install
- Optional auto-update on app startup
- Supports YouTube, Twitch, and thousands of other websites (see [supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md))

## Installation

1. Open Sigma File Manager
2. Go to **Extensions**
3. Search for "Video Downloader"
4. Click **Install**

## Permissions

This extension requires:

- `commands` for command palette integration
- `notifications` for status messages
- `fs.read` and `fs.write` to store the open-source tool yt-dlp binary

## Settings

- **Auto update binary**: checks for open-source tool yt-dlp updates when the app starts

## Usage

1. Open the command palette (Ctrl+Shift+P)
2. Run **Download video, playlist, audio, or stream from URL**
3. Enter the URL and select quality options
4. Downloaded files are saved to the current directory

## Supported Sites

This extension uses the open-source tool [yt-dlp](https://github.com/yt-dlp/yt-dlp) which supports downloading from YouTube, Twitch, and thousands of other websites. See the [full list of supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) for details.

## Development

1. Clone this repository
2. The extension is plain JavaScript and has no build step
3. To use TypeScript types, download:

```
curl -O https://raw.githubusercontent.com/aleksey-hoffman/sigma-file-manager/v2/src/modules/extensions/sdk/sigma-extension.d.ts
```

## License

MIT
