# Changelog

## 1.1

First public update after 1.0.

### New

- Added compact syntax: `;` for OR, `&` for AND, `-` for exclusions, `@` for exact artists, year filters/comparisons/ranges, and `\` for escaping reserved characters.
- Added syntax hints and artist suggestions below the playlist search field.
- Added a diagnostics panel with capability checks, copyable diagnostics, parser self-checks, and a manual playlist refresh action.
- Added release notes that appear once after an update and can be reopened from Settings.
- Added tests for parsing, matching, year metadata, sorting, playback, and compatibility behavior.

### Improved

- Split the development code into modules while keeping `smart-search.js` as the installable bundle.
- Advanced searches now use a Smart Search result list instead of patching Spotify's private playlist rows.
- Filtered playback follows the visible Smart Search order, uses Spotify's Shuffle setting, and keeps manually queued songs ahead of the automatic filtered queue.
- Smart Search now follows Spotify's playlist sort order.
- Playlist additions and removals refresh cached data automatically.
- Year searches can fill missing release-year metadata when needed.
- Spotify APIs are checked before use, with fallbacks where possible.
- Settings now include a full syntax reference, clearer diagnostics, and direct support links.

### Fixed

- Invalid advanced queries now show a useful error instead of looking like an empty playlist.
- Removed the native-list flicker caused by Smart Search and Spotify trying to render the same playlist rows.
- Fixed result Play buttons being confused with Spotify's main playlist Play button.
- Fixed selected-track playback, queue order, shuffle rebuilds, playlist refresh, cache invalidation, and syntax-help cleanup issues found during testing.
- Increased the result-row Play target and fixed several Settings/action feedback issues.
- Reworked the release-notes window so it stays centered, adapts to the Spotify window size, and can be reopened from Settings.

### Known issue

- On some Spotify builds, the generic **"can't play this right now"** notification can briefly appear during the filtered-playback handoff even though playback starts correctly. Smart Search leaves Spotify's global error notifications alone so real playback errors are not hidden.
