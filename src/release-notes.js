import {
  BUG_REPORT_URL,
  CHANGELOG_URL,
  FEATURE_REQUEST_URL,
  RELEASE_SEEN_KEY,
  RELEASE_NOTES_REVISION,
  VERSION,
} from './constants.js';
import { state } from './state.js';

const displayVersion = VERSION;
let activeOverlay = null;
let activeResizeHandler = null;
let activeViewportHandler = null;
let activeKeyHandler = null;

export const RELEASE_NOTES = {
  version: VERSION,
  revision: RELEASE_NOTES_REVISION,
  title: `Smart Search ${displayVersion}`,
  sections: [
    {
      label: 'New',
      icon: '✦',
      tone: 'new',
      items: [
        'Compact advanced syntax with AND, OR, exclusions, exact artists, year filters, and escaping.',
        'Inline syntax help and artist suggestions under the playlist search box.',
        'Diagnostics, automated checks, and version-aware release notes in Settings.',
      ],
    },
    {
      label: 'Improved',
      icon: '↗',
      tone: 'improved',
      items: [
        'Advanced searches now use a stable Smart Search-owned result view instead of patching Spotify’s private playlist UI.',
        'Filtered playback follows the visible sort order, mirrors Spotify Shuffle, and preserves songs you manually add to the queue.',
        'Playlist refresh, release-year lookup, and Spotify API compatibility are more resilient.',
      ],
    },
    {
      label: 'Fixed',
      icon: '✓',
      tone: 'fixed',
      items: [
        'Malformed searches now explain what is wrong instead of looking like empty results.',
        'Removed native-list flicker and rerender conflicts during advanced searches.',
        'Fixed selected-song playback, queue ordering, result Play controls, syntax-help lifecycle, and several refresh/UI edge cases.',
      ],
    },
  ],
};

function releaseToken() {
  return `${VERSION}:${RELEASE_NOTES_REVISION}`;
}

export function hasSeenCurrentRelease() {
  return readSeenRelease() === releaseToken();
}

function readSeenRelease() {
  try {
    return state.S?.LocalStorage?.get?.(RELEASE_SEEN_KEY)
      ?? globalThis.localStorage?.getItem?.(RELEASE_SEEN_KEY)
      ?? '';
  } catch {
    return '';
  }
}

function writeSeenRelease(value) {
  try { state.S?.LocalStorage?.set?.(RELEASE_SEEN_KEY, value); } catch {}
  try { globalThis.localStorage?.setItem?.(RELEASE_SEEN_KEY, value); } catch {}
}

function makeExternalButton(label, url, iconText) {
  const link = document.createElement('a');
  link.className = 'ss1-release-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const icon = document.createElement('span');
  icon.className = 'ss1-release-link-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = iconText;
  const text = document.createElement('span');
  text.textContent = label;
  link.append(icon, text);
  return link;
}

function cleanupReleaseOverlay() {
  if (activeResizeHandler) {
    try { window.removeEventListener('resize', activeResizeHandler); } catch {}
    activeResizeHandler = null;
  }
  if (activeViewportHandler && window.visualViewport) {
    try { window.visualViewport.removeEventListener('resize', activeViewportHandler); } catch {}
    activeViewportHandler = null;
  }
  if (activeKeyHandler) {
    try { document.removeEventListener('keydown', activeKeyHandler, true); } catch {}
    activeKeyHandler = null;
  }
}

export function closeReleaseNotes() {
  cleanupReleaseOverlay();
  try { activeOverlay?.remove?.(); } catch {}
  activeOverlay = null;
}

function buildReleaseNotesContent() {
  const content = document.createElement('div');
  content.className = 'ss1-release-notes';

  const hero = document.createElement('div');
  hero.className = 'ss1-release-hero';
  const appIcon = document.createElement('div');
  appIcon.className = 'ss1-release-app-icon';
  appIcon.setAttribute('aria-hidden', 'true');
  appIcon.textContent = 'S';
  const copy = document.createElement('div');
  copy.className = 'ss1-release-hero-copy';
  const label = document.createElement('div');
  label.className = 'ss1-release-overline';
  label.textContent = 'SMART SEARCH UPDATE';
  const heading = document.createElement('div');
  heading.className = 'ss1-release-heading';
  heading.textContent = `What's new in ${displayVersion}`;
  const sub = document.createElement('div');
  sub.className = 'ss1-release-subtitle';
  sub.textContent = 'Highlights since Smart Search 1.0. Full release notes are on GitHub.';
  const chip = document.createElement('span');
  chip.className = 'ss1-release-version-chip';
  chip.textContent = `Version ${displayVersion}`;
  copy.append(label, heading, sub, chip);
  hero.append(appIcon, copy);

  const sections = document.createElement('div');
  sections.className = 'ss1-release-sections';
  for (const section of RELEASE_NOTES.sections) {
    const card = document.createElement('section');
    card.className = `ss1-release-section ss1-release-section-${section.tone}`;
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'ss1-release-section-header';
    const sectionIcon = document.createElement('span');
    sectionIcon.className = 'ss1-release-section-icon';
    sectionIcon.setAttribute('aria-hidden', 'true');
    sectionIcon.textContent = section.icon;
    const sectionTitle = document.createElement('strong');
    sectionTitle.textContent = section.label;
    sectionHeader.append(sectionIcon, sectionTitle);
    const list = document.createElement('ul');
    list.className = 'ss1-release-section-list';
    for (const item of section.items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    }
    card.append(sectionHeader, list);
    sections.appendChild(card);
  }

  const footer = document.createElement('div');
  footer.className = 'ss1-release-footer';
  const links = document.createElement('div');
  links.className = 'ss1-release-links';
  links.append(
    makeExternalButton('Full changelog', CHANGELOG_URL, '↗'),
    makeExternalButton('Report bug', BUG_REPORT_URL, '!'),
    makeExternalButton('Request feature', FEATURE_REQUEST_URL, '+'),
  );

  const done = document.createElement('button');
  done.className = 'ss1-release-done';
  done.type = 'button';
  done.textContent = 'Done';
  done.addEventListener('click', closeReleaseNotes);

  footer.append(links, done);
  content.append(hero, sections, footer);
  return content;
}

function responsiveDialogWidth(viewportWidth, viewportHeight) {
  const horizontalGutter = viewportWidth < 700 ? 24 : viewportWidth < 1200 ? 48 : 72;
  const availableWidth = Math.max(300, viewportWidth - horizontalGutter);
  const aspect = viewportWidth / Math.max(1, viewportHeight);
  let preferredWidth;
  if (viewportWidth < 1200) {
    // Narrow or portrait-style window.
    preferredWidth = viewportWidth * 0.54;
  } else if (aspect >= 2.15) {
    // Ultrawide window: use more width without taking over the height.
    preferredWidth = Math.min(viewportWidth * 0.55, viewportHeight * 1.55);
  } else {
    preferredWidth = Math.min(viewportWidth * 0.68, viewportHeight * 1.45);
  }
  const minimumWidth = viewportWidth < 700 ? availableWidth : viewportWidth < 1200 ? 520 : 680;
  return Math.min(1800, availableWidth, Math.max(minimumWidth, preferredWidth));
}

function mountReleaseNotes(content) {
  if (!document.body) return false;
  closeReleaseNotes();

  const overlay = document.createElement('div');
  overlay.className = 'ss1-release-overlay';
  overlay.setAttribute('data-smart-search-release', displayVersion);

  const dialog = document.createElement('section');
  dialog.className = 'ss1-release-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `What's new in Smart Search ${displayVersion}`);

  const topbar = document.createElement('div');
  topbar.className = 'ss1-release-topbar';
  const topTitle = document.createElement('strong');
  topTitle.textContent = `Smart Search ${displayVersion}`;
  const close = document.createElement('button');
  close.className = 'ss1-release-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close release notes');
  close.textContent = '×';
  close.addEventListener('click', closeReleaseNotes);
  topbar.append(topTitle, close);

  dialog.append(topbar, content);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  const applyResponsiveSize = () => {
    if (!overlay.isConnected) return;
    const viewportWidth = Math.max(
      320,
      window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1280,
    );
    const viewportHeight = Math.max(
      320,
      window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720,
    );
    const width = responsiveDialogWidth(viewportWidth, viewportHeight);
    const verticalGutter = viewportHeight < 700 ? 24 : 48;
    const maxHeight = Math.max(300, viewportHeight - verticalGutter);
    dialog.style.setProperty('--ss1-release-dialog-width', `${Math.round(width)}px`);
    dialog.style.setProperty('--ss1-release-dialog-max-height', `${Math.round(maxHeight)}px`);
    overlay.style.setProperty('--ss1-release-overlay-pad', `${Math.max(12, Math.round(verticalGutter / 2))}px`);
  };

  activeResizeHandler = () => requestAnimationFrame(applyResponsiveSize);
  window.addEventListener('resize', activeResizeHandler, { passive: true });
  if (window.visualViewport) {
    activeViewportHandler = () => requestAnimationFrame(applyResponsiveSize);
    window.visualViewport.addEventListener('resize', activeViewportHandler, { passive: true });
  }
  activeKeyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeReleaseNotes();
    }
  };
  document.addEventListener('keydown', activeKeyHandler, true);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeReleaseNotes();
  });

  applyResponsiveSize();
  requestAnimationFrame(() => close.focus());
  return true;
}

export function showReleaseNotes({ markSeen = false } = {}) {
  const content = buildReleaseNotesContent();
  const mounted = mountReleaseNotes(content);
  if (!mounted) return false;
  if (markSeen) writeSeenRelease(releaseToken());
  return true;
}

export async function maybeShowReleaseNotes() {
  if (hasSeenCurrentRelease()) return false;
  const shown = showReleaseNotes({ markSeen: true });
  return shown;
}
