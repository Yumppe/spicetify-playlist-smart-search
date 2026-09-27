# Playlist Smart Search architecture

This file is a quick map of the 1.1 codebase. It is not meant to document every helper or Spotify internal.

## Search flow

Spotify keeps control of normal text searches. Smart Search only switches into advanced mode when the parser finds Smart Search syntax.

`ui/native-search.js` watches Spotify's playlist search field. In advanced mode it keeps the input in sync and sends the query to `controller.js` instead of letting Spotify filter the playlist itself.

`search/parser.js` turns the query into a small AST. `search/matcher.js` applies that AST to normalized playlist tracks.

## Results

Advanced searches use the result list in `ui/results.js`.

Smart Search does not patch Spotify's private React playlist rows. While advanced mode is active, Spotify's native tracklist is hidden and Smart Search renders its own rows. Leaving advanced mode removes that state and Spotify's normal list comes back.

This avoids the row flicker and rerender races that came from trying to modify Spotify's virtualized list directly.

## Playlist data

`spotify/playlist-source.js` prefers `PlaylistAPI.getContents()`. A feature-detected GraphQL path is kept as a fallback for compatible Spotify builds.

`spotify/track-normalizer.js` converts Spotify track objects into the shape used by the parser, matcher, UI, and playback code.

`spotify/year-metadata.js` only looks up missing release years when a year query actually needs them.

`spotify/mutation-watcher.js` watches for playlist-level changes. A lightweight fingerprint is used to confirm that tracks were really added, removed, or reordered before cached state is replaced.

## Sorting

`spotify/sort-bridge.js` reads Spotify's current playlist sort control and applies the same order to Smart Search results.

The sort bridge is intentionally feature-detected because Spotify changes internal markup between client versions.

## Playback

`spotify/playback.js` keeps filtered playback separate from the original full-playlist context.

The preferred path is:

1. Read any songs the user manually added to the queue.
2. Build the Smart Search playback order from the filtered results and Spotify's current Shuffle state.
3. Put the selected result at the front of Spotify's low-level queue.
4. Advance with `PlayerAPI.skipToNext()` when available, with `Player.next()` as a fallback.
5. Restore manually queued songs ahead of the automatic Smart Search tail.
6. Keep checking the queue while the session is active and rebuild it when Shuffle, Repeat, or Spotify context updates require it.

`spotify/queue-model.js` contains the queue planning logic used by both production code and tests.

If the low-level queue API is not available, playback falls back to the older add-to-queue path. That fallback may need `Player.playUri()` to start the selected track.

## Settings and diagnostics

`ui/settings.js` contains extension settings, the syntax reference, diagnostics, support links, and the release-notes entry point.

`diagnostics.js` exposes the useful runtime state for bug reports: client versions, playlist source, active result view, playback method, sort state, capability checks, and recent Smart Search events.

## Release notes

`release-notes.js` owns the update popup. The visible extension version stays separate from an internal release-note revision, so the popup can be tested or corrected without changing the public version number.

The popup uses its own overlay rather than Spotify's modal positioning. Its size is recalculated when the Spotify window changes size.
