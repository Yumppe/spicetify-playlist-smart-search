import {
  BUG_REPORT_URL,
  FEATURE_REQUEST_URL,
  CHANGELOG_URL,
  RELEASE_SEEN_KEY,
  RELEASE_NOTES_REVISION,
  VERSION,
} from './constants.js';
import { state } from './state.js';
import { createLogoImage } from './branding.js';

const displayVersion = VERSION;
let activeOverlay = null;
let activePreviousFocus = null;
let markCurrentOnClose = false;
let activeResizeHandler = null;
let activeViewportHandler = null;
let activeKeyHandler = null;

// Keep the update focused: v1.2 fixes queue editing and polishes existing UI/code.
// We do not present the same queue fix as three unrelated features.
export const RELEASE_NOTES = {
  version: VERSION,
  revision: RELEASE_NOTES_REVISION,
  title: `Smart Search ${displayVersion}`,
  sections: [
    {
      label: 'Your queue stays yours',
      icon: 'check',
      tone: 'queue',
      items: [
        'Remove or rearrange songs in Up Next while playing filtered results. Smart Search will no longer put those songs straight back.',
      ],
    },
    {
      label: 'A little extra polish',
      icon: 'sparkles',
      tone: 'polish',
      items: [
        'New: Smart Search now has its own logo across the popup, Settings, and search results.',
        'Clearer search feedback, better keyboard navigation, and more reliable handling behind the scenes.',
      ],
    },
  ],
};

export const WELCOME_NOTES = {
  sections: [
    {
      label: 'Search beyond keywords',
      icon: 'search',
      tone: 'queue',
      items: [
        'Try @Quevedo;@Mora to find either artist, or use & to combine filters.',
      ],
    },
    {
      label: 'Play the results you want',
      icon: 'check',
      tone: 'polish',
      items: [
        'Start playback from your filtered results, then edit Up Next whenever you like.',
      ],
    },
  ],
};


const HEROICONS = {
  check: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M20.03 6.97a.75.75 0 0 1 0 1.06l-8.5 8.5a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06L11 14.94l7.97-7.97a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" /></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M9.315 7.584c-.346-.923-.53-1.385-.842-1.513a1.5 1.5 0 0 0-.946 0c-.312.128-.496.59-.842 1.513l-.073.196c-.39 1.04-.584 1.56-.96 1.936-.377.376-.897.57-1.937.96l-.195.073c-.925.346-1.387.53-1.515.842a1.5 1.5 0 0 0 0 .946c.128.312.59.496 1.515.842l.195.073c1.04.39 1.56.584 1.936.96.377.376.571.897.96 1.937l.074.195c.345.925.53 1.387.841 1.515.301.123.646.123.946 0 .312-.128.496-.59.842-1.515l.073-.195c.39-1.04.584-1.56.96-1.936.376-.377.897-.571 1.937-.96l.196-.074c.924-.345 1.386-.53 1.514-.841a1.5 1.5 0 0 0 0-.946c-.128-.312-.59-.496-1.514-.842l-.196-.073c-1.04-.39-1.56-.584-1.936-.96-.377-.376-.571-.897-.96-1.937l-.074-.195ZM18 4.5a.75.75 0 0 1 .75.75V6h.75a.75.75 0 0 1 0 1.5h-.75v.75a.75.75 0 0 1-1.5 0V7.5h-.75a.75.75 0 0 1 0-1.5h.75v-.75A.75.75 0 0 1 18 4.5ZM16.5 17.25a.75.75 0 0 1 .75.75v.75H18a.75.75 0 0 1 0 1.5h-.75V21a.75.75 0 0 1-1.5 0v-.75H15a.75.75 0 0 1 0-1.5h.75V18a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" /></svg>',
  search: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10.5 4.5a6 6 0 1 0 3.857 10.596l4.523 4.524a.75.75 0 1 0 1.06-1.06l-4.523-4.524A6 6 0 0 0 10.5 4.5Zm-4.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Z" clip-rule="evenodd" /></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 3.75a.75.75 0 0 1 1.125-.65l13.5 8.25a.75.75 0 0 1 0 1.3L5.625 20.9A.75.75 0 0 1 4.5 20.25V3.75Z" clip-rule="evenodd" /></svg>',
  external: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M15.75 3a.75.75 0 0 0 0 1.5h2.69L9.22 13.72a.75.75 0 1 0 1.06 1.06l9.22-9.22v2.69a.75.75 0 0 0 1.5 0v-4.5A.75.75 0 0 0 20.25 3h-4.5ZM5.25 4.5A2.25 2.25 0 0 0 3 6.75v12A2.25 2.25 0 0 0 5.25 21h12a2.25 2.25 0 0 0 2.25-2.25v-5.25a.75.75 0 0 0-1.5 0v5.25a.75.75 0 0 1-.75.75h-12a.75.75 0 0 1-.75-.75v-12a.75.75 0 0 1 .75-.75H10.5a.75.75 0 0 0 0-1.5H5.25Z" clip-rule="evenodd" /></svg>',
  exclamation: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75 2.25 17.385 2.25 12Zm10.5-4.5a.75.75 0 0 0-1.5 0v5.25a.75.75 0 0 0 1.5 0V7.5Zm0 9a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" clip-rule="evenodd" /></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5A.75.75 0 0 1 12 3.75Z" clip-rule="evenodd" /></svg>',
};

function createInlineIcon(name, className = '') {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = HEROICONS[name] || HEROICONS.sparkles;
  return span;
}

function releaseToken() {
  return `${VERSION}:${RELEASE_NOTES_REVISION}`;
}

export function releaseAudience(seen = readSeenRelease()) {
  return seen ? 'update' : 'welcome';
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

function makeExternalButton(label, url, iconName) {
  const link = document.createElement('a');
  link.className = 'ss1-release-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const icon = document.createElement('span');
  icon.className = 'ss1-release-link-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(createInlineIcon(iconName, 'ss1-release-link-glyph'));
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
  if (!activeOverlay) return;
  cleanupReleaseOverlay();
  if (markCurrentOnClose) writeSeenRelease(releaseToken());
  markCurrentOnClose = false;
  try { activeOverlay.remove(); } catch {}
  activeOverlay = null;
  if (activePreviousFocus?.isConnected) activePreviousFocus.focus();
  activePreviousFocus = null;
}

function buildReleaseNotesContent(audience = releaseAudience()) {
  const content = document.createElement('div');
  content.className = 'ss1-release-notes';

  const hero = document.createElement('div');
  hero.className = 'ss1-release-hero';
  const appIcon = document.createElement('div');
  appIcon.className = 'ss1-release-app-icon';
  appIcon.setAttribute('aria-hidden', 'true');
  appIcon.appendChild(createLogoImage('ss1-logo-image ss1-logo-image-release', ''));
  const copy = document.createElement('div');
  copy.className = 'ss1-release-hero-copy';
  const label = document.createElement('div');
  label.className = 'ss1-release-overline';
  label.textContent = audience === 'welcome' ? 'WELCOME TO SMART SEARCH' : 'SMART SEARCH · VERSION 1.2';
  const heading = document.createElement('div');
  heading.className = 'ss1-release-heading';
  heading.textContent = audience === 'welcome' ? 'Find your next favorite track.' : 'Up Next, on your terms.';
  const sub = document.createElement('div');
  sub.className = 'ss1-release-subtitle';
  sub.textContent = audience === 'welcome'
    ? 'Smarter playlist filters, with playback you can control.'
    : 'One important queue fix, plus a few thoughtful refinements.';
  const chip = document.createElement('span');
  chip.className = 'ss1-release-version-chip';
  chip.textContent = `v${displayVersion}`;
  copy.append(label, heading, sub, chip);
  hero.append(appIcon, copy);

  const sections = document.createElement('div');
  sections.className = 'ss1-release-sections';
  const notes = audience === 'welcome' ? WELCOME_NOTES : RELEASE_NOTES;
  for (const section of notes.sections) {
    const card = document.createElement('section');
    card.className = `ss1-release-section ss1-release-section-${section.tone}`;
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'ss1-release-section-header';
    const sectionIcon = document.createElement('span');
    sectionIcon.className = 'ss1-release-section-icon';
    sectionIcon.setAttribute('aria-hidden', 'true');
    sectionIcon.appendChild(createInlineIcon(section.icon, 'ss1-release-section-glyph'));
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
    makeExternalButton('Changelog', CHANGELOG_URL, 'external'),
    makeExternalButton('Report a bug', BUG_REPORT_URL, 'exclamation'),
    makeExternalButton('Request feature', FEATURE_REQUEST_URL, 'plus'),
  );

  const done = document.createElement('button');
  done.className = 'ss1-release-done';
  done.type = 'button';
  done.textContent = 'Got it';
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
  return Math.min(720, availableWidth, Math.max(minimumWidth, preferredWidth));
}

function mountReleaseNotes(content, audience = releaseAudience()) {
  if (!document.body) return false;
  closeReleaseNotes();
  activePreviousFocus = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'ss1-release-overlay';
  overlay.setAttribute('data-smart-search-release', displayVersion);

  const dialog = document.createElement('section');
  dialog.className = 'ss1-release-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', audience === 'welcome' ? 'Welcome to Smart Search' : `Smart Search ${displayVersion} update notes`);

  const topbar = document.createElement('div');
  topbar.className = 'ss1-release-topbar';
  const topTitle = document.createElement('strong');
  topTitle.textContent = 'Smart Search';
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
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not([disabled]),a[href]')];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      return;
    }
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
  const audience = releaseAudience();
  const content = buildReleaseNotesContent(audience);
  const mounted = mountReleaseNotes(content, audience);
  if (!mounted) return false;
  markCurrentOnClose = markSeen;
  return true;
}

export async function maybeShowReleaseNotes() {
  if (hasSeenCurrentRelease() || activeOverlay) return false;
  const shown = showReleaseNotes({ markSeen: true });
  return shown;
}
