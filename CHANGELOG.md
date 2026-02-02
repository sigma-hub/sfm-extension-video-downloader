# Changelog

All notable changes to the Video Downloader extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- Fall back to user downloads directory when command palette is opened from a page without a current directory (e.g., settings, extensions page)

### Changed

- Refactored to use new Sigma extension APIs:
  - Use `sigma.ui.createModal()` for declarative modal UI (replaces ~300 lines of manual DOM code)
  - Use `sigma.binary.ensureInstalled()` for binary management (replaces ~100 lines of download logic)
  - Use `sigma.platform` for platform detection (replaces manual navigator checks)
- Simplified codebase with cleaner, more maintainable code

### Added

- Dynamic download modal that adapts to different platforms:
  - YouTube: Video/audio mode selector, video quality, audio quality
  - Twitch Live: Stream quality, "Start from beginning" option
  - Twitch VOD/Clips: Video quality selector
  - Generic sites: Simple quality selector with helpful hint
- Platform auto-detection from URL with visual badge indicator
- Live stream specific UI with "Start Recording" button text
- Twitch-specific yt-dlp flags (--live-from-start, --concurrent-fragments)

## [0.1.7] - 2026-02-01

### Changed

- Show yt-dlp progress lines including speed and size.

## [0.1.6] - 2026-02-01

### Changed

- Stream yt-dlp progress lines reliably.

## [0.1.5] - 2026-02-01

### Changed

- Stream yt-dlp progress into the notification and allow cancel.

## [0.1.4] - 2026-02-01

### Changed

- Download videos into the current navigator directory without save dialog.

## [0.1.3] - 2026-02-01

### Fixed

- Keep the download progress toast visible until completion.

## [0.1.2] - 2026-02-01

### Fixed

- Avoid duplicate downloads and show completion notifications.

## [0.1.1] - 2026-02-01

### Fixed

- Use app download API to avoid CORS when fetching yt-dlp.

## [0.1.0] - 2026-02-01

### Added

- Initial release with yt-dlp download and command palette workflow.
