import { BUG_REPORT_URL, FEATURE_REQUEST_URL, PROJECT_URL, VERSION } from '../constants.js';
import { state } from '../state.js';
import { loadConfig, updateConfig } from '../config.js';
import { SYNTAX_REFERENCE, parseQuery } from '../search/parser.js';
import { capabilityRows } from '../spotify/capabilities.js';
import { copyDiagnostics, diagnosticsText } from '../diagnostics.js';
import { emit, on } from '../events.js';
import { showReleaseNotes } from '../release-notes.js';
import { consoleWarn } from '../utils.js';

let settingsMenuItem = null;

function createSettingsToggle(parent, title, description, key) {
  const row = document.createElement('div'); row.className = 'ss1-settings-row';
  const copy = document.createElement('div'); copy.className = 'ss1-settings-copy';
  const heading = document.createElement('div'); heading.className = 'ss1-settings-title'; heading.textContent = title;
  const detail = document.createElement('div'); detail.className = 'ss1-settings-desc'; detail.textContent = description;
  copy.append(heading, detail);
  const toggle = document.createElement('button'); toggle.className = 'ss1-toggle'; toggle.type = 'button'; toggle.setAttribute('role', 'switch');
  const refresh = () => {
    const value = Boolean(loadConfig()[key]);
    toggle.setAttribute('aria-pressed', String(value));
    toggle.setAttribute('aria-checked', String(value));
    toggle.setAttribute('aria-label', `${title}: ${value ? 'on' : 'off'}`);
  };
  refresh();
  toggle.addEventListener('click', () => {
    const current = loadConfig();
    updateConfig({ [key]: !current[key] });
    refresh();
    emit('config-changed', { key });
  });
  row.append(copy, toggle); parent.appendChild(row);
}

function createCollapsiblePanel(titleText) {
  const details = document.createElement('details');
  details.className = 'ss1-panel ss1-collapsible';
  const summary = document.createElement('summary');
  summary.className = 'ss1-panel-summary';
  const title = document.createElement('span');
  title.className = 'ss1-panel-title';
  title.textContent = titleText;
  const chevron = document.createElement('span');
  chevron.className = 'ss1-panel-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';
  summary.append(title, chevron);
  const body = document.createElement('div');
  body.className = 'ss1-panel-body';
  details.append(summary, body);
  return { details, body };
}

function buildSyntaxPanel() {
  const { details, body } = createCollapsiblePanel('Search tutorial');
  const grid = document.createElement('div');
  grid.className = 'ss1-tutorial-grid';
  for (const item of SYNTAX_REFERENCE) {
    const example = document.createElement('code');
    example.textContent = item.example;
    const meaning = document.createElement('div');
    meaning.className = 'ss1-tutorial-meaning';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const description = document.createElement('span');
    description.textContent = item.description;
    meaning.append(name, description);
    grid.append(example, meaning);
  }
  body.appendChild(grid);
  return details;
}

function runSelfCheck() {
  const cases = [
    ['@Mora & @Quevedo', true],
    ['year:>2017 & <2020', true],
    ['Mora;Quevedo', true],
    ['rock\\&roll', true],
    ['year:20xx', false],
  ];
  const failures = [];
  for (const [query, valid] of cases) {
    const parsed = parseQuery(query);
    const actual = parsed.errors.length === 0;
    if (actual !== valid) failures.push(`${query}: expected ${valid ? 'valid' : 'invalid'}, got ${actual ? 'valid' : parsed.errors.join(' ')}`);
  }
  return { total: cases.length, failures };
}

function setFeedback(element, message, tone = 'neutral') {
  element.textContent = message;
  element.className = `ss1-action-feedback ss1-feedback-${tone}`;
  element.hidden = !message;
}

function setBusy(button, busy, busyLabel, normalLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : normalLabel;
}

function buildDiagnosticsPanel() {
  const { details, body } = createCollapsiblePanel('Diagnostics');
  const grid = document.createElement('div');
  grid.className = 'ss1-diag-grid';
  const renderRows = () => {
    grid.replaceChildren();
    for (const row of capabilityRows()) {
      const label = document.createElement('span');
      label.textContent = `${row.name} — ${row.note}`;
      const value = document.createElement('strong');
      value.className = row.tone === 'ok' ? 'ss1-diag-ok' : row.tone === 'warn' ? 'ss1-diag-bad' : 'ss1-diag-neutral';
      value.textContent = row.status;
      grid.append(label, value);
    }
  };
  renderRows();

  const feedback = document.createElement('div');
  feedback.className = 'ss1-action-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.hidden = true;

  const pre = document.createElement('pre');
  pre.className = 'ss1-pre';
  pre.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'ss1-panel-actions';

  const refresh = document.createElement('button');
  refresh.className = 'ss1-button';
  refresh.type = 'button';
  refresh.textContent = 'Refresh diagnostics';
  refresh.addEventListener('click', async () => {
    setBusy(refresh, true, 'Refreshing…', 'Refresh diagnostics');
    setFeedback(feedback, 'Refreshing diagnostics…');
    await new Promise((resolve) => setTimeout(resolve, 80));
    renderRows();
    if (!pre.hidden) pre.textContent = diagnosticsText();
    setBusy(refresh, false, 'Refreshing…', 'Refresh diagnostics');
    setFeedback(feedback, 'Diagnostics refreshed.', 'ok');
  });

  const copy = document.createElement('button');
  copy.className = 'ss1-button';
  copy.type = 'button';
  copy.textContent = 'Copy diagnostics';
  copy.addEventListener('click', async () => {
    setBusy(copy, true, 'Copying…', 'Copy diagnostics');
    setFeedback(feedback, 'Copying diagnostics…');
    try {
      const copied = await copyDiagnostics();
      setFeedback(feedback, copied ? 'Diagnostics copied to the clipboard.' : 'Clipboard access is unavailable.', copied ? 'ok' : 'warn');
    } catch (error) {
      setFeedback(feedback, `Could not copy diagnostics: ${error?.message || error}`, 'error');
    } finally {
      setBusy(copy, false, 'Copying…', 'Copy diagnostics');
    }
  });

  const show = document.createElement('button');
  show.className = 'ss1-button';
  show.type = 'button';
  show.textContent = 'Show raw diagnostics';
  show.addEventListener('click', () => {
    pre.hidden = !pre.hidden;
    pre.textContent = diagnosticsText();
    show.textContent = pre.hidden ? 'Show raw diagnostics' : 'Hide raw diagnostics';
    setFeedback(feedback, pre.hidden ? 'Raw diagnostics hidden.' : 'Raw diagnostics shown.');
  });

  const forceRefresh = document.createElement('button');
  forceRefresh.className = 'ss1-button';
  forceRefresh.type = 'button';
  forceRefresh.textContent = 'Refresh playlist data';
  forceRefresh.disabled = !state.playlistId;
  forceRefresh.addEventListener('click', () => {
    setBusy(forceRefresh, true, 'Refreshing playlist…', 'Refresh playlist data');
    setFeedback(feedback, 'Refreshing playlist data…');
    emit('manual-playlist-refresh');
  });

  const offRefreshStatus = on('playlist-refresh-status', (event) => {
    if (!details.isConnected) {
      offRefreshStatus();
      return;
    }
    if (event?.reason !== 'manual-refresh') return;
    if (event.phase === 'start') {
      setBusy(forceRefresh, true, 'Refreshing playlist…', 'Refresh playlist data');
      setFeedback(feedback, 'Refreshing playlist data…');
    } else if (event.phase === 'done') {
      setBusy(forceRefresh, false, 'Refreshing playlist…', 'Refresh playlist data');
      const suffix = event.changed ? ' Playlist changes detected.' : ' No playlist changes detected.';
      setFeedback(feedback, `Playlist data refreshed.${suffix}`, 'ok');
      renderRows();
      if (!pre.hidden) pre.textContent = diagnosticsText();
    } else if (event.phase === 'unavailable') {
      setBusy(forceRefresh, false, 'Refreshing playlist…', 'Refresh playlist data');
      setFeedback(feedback, 'Open a playlist before refreshing playlist data.', 'warn');
    } else if (event.phase === 'error') {
      setBusy(forceRefresh, false, 'Refreshing playlist…', 'Refresh playlist data');
      setFeedback(feedback, event.message || 'Playlist refresh failed.', 'error');
    }
  });

  const self = document.createElement('button');
  self.className = 'ss1-button';
  self.type = 'button';
  self.textContent = 'Run parser self-check';
  self.addEventListener('click', async () => {
    setBusy(self, true, 'Running self-check…', 'Run parser self-check');
    setFeedback(feedback, 'Running parser self-check…');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const result = runSelfCheck();
    setBusy(self, false, 'Running self-check…', 'Run parser self-check');
    if (result.failures.length) setFeedback(feedback, `Parser self-check failed: ${result.failures[0]}`, 'error');
    else setFeedback(feedback, `Parser self-check passed (${result.total}/${result.total}).`, 'ok');
  });

  actions.append(refresh, copy, show, forceRefresh, self);
  body.append(grid, actions, feedback, pre);
  return details;
}

function buildSupportPanel() {
  const box = document.createElement('div');
  box.className = 'ss1-panel';
  const title = document.createElement('div');
  title.className = 'ss1-panel-title';
  title.textContent = 'Support & feedback';
  const desc = document.createElement('div');
  desc.className = 'ss1-panel-desc';
  desc.textContent = 'Found a bug or have an idea? Create a GitHub Issue.';
  const actions = document.createElement('div');
  actions.className = 'ss1-panel-actions';
  for (const [label, url] of [['Report a bug', BUG_REPORT_URL], ['Suggest a feature', FEATURE_REQUEST_URL], ['View on GitHub', PROJECT_URL]]) {
    const link = document.createElement('a');
    link.className = 'ss1-button';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    actions.appendChild(link);
  }
  const notes = document.createElement('button');
  notes.className = 'ss1-button';
  notes.type = 'button';
  notes.textContent = 'Release notes';
  notes.addEventListener('click', () => {
    // Release notes use a separate overlay, so close Settings first.
    try { state.S?.PopupModal?.hide?.(); } catch {}
    setTimeout(() => showReleaseNotes({ markSeen: false }), 120);
  });
  actions.appendChild(notes);
  box.append(title, desc, actions);
  return box;
}

export function showSettings() {
  const content = document.createElement('div');
  content.className = 'ss1-settings';
  createSettingsToggle(content, 'Enabled', 'Use Smart Search on playlist pages.', 'enabled');
  createSettingsToggle(content, 'Live playlist refresh', 'Update Smart Search after tracks are added or removed.', 'livePlaylistRefresh');
  createSettingsToggle(content, 'Collapse results by default', 'Keep Smart Search results compact until you expand them.', 'resultsCollapsed');
  createSettingsToggle(content, 'Show syntax help', 'Show contextual syntax tips and artist suggestions below the playlist search box. Validation errors are always shown.', 'showSyntaxHelp');
  content.append(buildSyntaxPanel(), buildDiagnosticsPanel(), buildSupportPanel());
  const version = document.createElement('div');
  version.className = 'ss1-version';
  version.textContent = `smart-search ${VERSION}`;
  content.appendChild(version);
  state.S?.PopupModal?.display?.({ title: 'Smart Search', content, isLarge: true });
  setTimeout(() => {
    try {
      const dialog = content.closest?.('[role="dialog"]');
      if (dialog) {
        dialog.style.width = 'min(860px, calc(100vw - 96px))';
        dialog.style.maxWidth = 'min(860px, calc(100vw - 96px))';
        dialog.style.overflowX = 'hidden';
      }
    } catch {}
  }, 0);
}

export function registerSettingsMenu() {
  if (settingsMenuItem) return true;
  if (typeof state.S?.Menu?.Item !== 'function') return false;
  try {
    settingsMenuItem = new state.S.Menu.Item('Smart Search settings', false, showSettings, 'search');
    settingsMenuItem.register();
    return true;
  } catch (error) {
    settingsMenuItem = null;
    consoleWarn('Settings menu is not ready yet; Smart Search will retry later.', error);
    return false;
  }
}

export function registerSettingsMenuDeferred() {
  let attempts = 0;
  const attempt = () => {
    if (settingsMenuItem) return;
    attempts += 1;
    if (registerSettingsMenu()) return;
    if (attempts < 40) setTimeout(attempt, 500);
  };
  setTimeout(attempt, 1000);
}
