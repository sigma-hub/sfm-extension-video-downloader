# Video Downloader Extension

An official extension for Sigma File Manager that downloads videos using yt-dlp.

## Features

- Download videos from URL via the command palette
- Choose download mode: video + audio, video only, or audio only
- Select video and audio quality presets
- Downloads yt-dlp automatically on install
- Optional auto-update on app startup

## Installation

1. Open Sigma File Manager
2. Go to **Extensions**
3. Search for "Video Downloader"
4. Click **Install**

## Permissions

This extension requires:

- `commands` for command palette integration
- `notifications` for status messages
- `fs.read` and `fs.write` to store the yt-dlp binary

## Settings

- **Auto update binary**: checks for yt-dlp updates when the app starts

## Usage

1. Open the command palette (Ctrl+Shift+P)
2. Run **Download video from URL**
3. Enter the URL and select quality options
4. Downloaded files are saved to the current directory

## Development

1. Clone this repository
2. The extension is plain JavaScript and has no build step
3. To use TypeScript types, download:

```
curl -O https://raw.githubusercontent.com/aleksey-hoffman/sigma-file-manager/v2/src/modules/extensions/sdk/sigma-extension.d.ts
```

## License

MIT
