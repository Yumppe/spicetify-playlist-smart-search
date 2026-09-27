import { state } from './state.js';
import { sleep, consoleWarn } from './utils.js';
import { injectStyles } from './ui/styles.js';
import { registerSettingsMenuDeferred } from './ui/settings.js';
import { updatePlayingRowStyles } from './ui/results.js';
import { installPlaybackBridge, maintainPlaybackSession } from './spotify/playback.js';
import { installControllerEvents, handleRoute, maintainBindings, maybeRefreshExpiredCache } from './controller.js';
import { playlistIdFromLocation } from './ui/dom.js';
import { recordDiagnostic } from './diagnostics.js';
import { VERSION } from './constants.js';
import { hasSeenCurrentRelease, maybeShowReleaseNotes } from './release-notes.js';

export async function bootstrap() {
  while (!globalThis.Spicetify?.Platform || !globalThis.Spicetify?.Player) await sleep(100);
  state.S = globalThis.Spicetify;
  injectStyles();
  installControllerEvents();
  installPlaybackBridge();
  registerSettingsMenuDeferred();
  recordDiagnostic('bootstrap', 'core ready');
  console.log(`[Smart Search] ${VERSION} core ready`);

  try {
    state.S?.Player?.addEventListener?.('songchange', () => {
      queueMicrotask(() => void maintainPlaybackSession('songchange'));
      setTimeout(updatePlayingRowStyles, 40);
    });
  } catch (error) { consoleWarn('Could not attach song-change listener.', error); }

  try {
    state.S?.Platform?.History?.listen?.(() => setTimeout(() => void handleRoute(), 80));
  } catch (error) { consoleWarn('Could not attach route listener.', error); }

  let lastPath = state.S?.Platform?.History?.location?.pathname || location.pathname;
  setInterval(() => {
    void maintainPlaybackSession('poll');
    maintainBindings();
    const currentPath = state.S?.Platform?.History?.location?.pathname || location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      void handleRoute();
    }
    if (playlistIdFromLocation()) maybeRefreshExpiredCache();
  }, 500);

  await handleRoute();
  recordDiagnostic('bootstrap', 'loaded');
  console.log(`[Smart Search] ${VERSION} loaded`);
  const releaseAttempts = [700, 1800, 3600, 6500];
  const tryReleaseNotes = (attempt = 0) => {
    if (hasSeenCurrentRelease() || attempt >= releaseAttempts.length) return;
    setTimeout(async () => {
      try {
        const shown = await maybeShowReleaseNotes();
        if (!shown && !hasSeenCurrentRelease()) tryReleaseNotes(attempt + 1);
      } catch (error) {
        consoleWarn('Could not show release notes.', error);
        tryReleaseNotes(attempt + 1);
      }
    }, releaseAttempts[attempt]);
  };
  tryReleaseNotes();
}
