'use strict';

const STATE_KEY = 'sessionState';
const API_KEY_KEY = 'apiKey';
const CHUNK_DURATION_KEY = 'chunkDuration';
const ALLOWED_CHUNK_DURATIONS = [60, 120, 180, 300];
const DEFAULT_CHUNK_DURATION = 180;
const ACTIVE_STATES = new Set(['starting', 'recording', 'stopping', 'transcribing', 'generating']);
const DEFAULT_STATE = {
  status: 'idle',
  tabTitle: '',
  startTime: null,
  elapsedSeconds: 0,
  chunksRecorded: 0,
  chunksProcessed: 0,
  error: null,
  notesAvailable: false,
  transcriptAvailable: false,
  badgeText: ''
};

let currentState = { ...DEFAULT_STATE };
let savedApiKey = '';
let pollTimer = null;
let tickTimer = null;

const elements = {};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.ok === false) {
        reject(new Error(response.error || 'Unknown extension error.'));
        return;
      }
      resolve(response || {});
    });
  });
}

function maskApiKey(apiKey) {
  if (!apiKey) {
    return 'No key saved.';
  }
  const visible = Math.min(4, apiKey.length);
  return `Saved key: ${'*'.repeat(Math.max(8, apiKey.length - visible))}${apiKey.slice(-visible)}`;
}

function formatElapsed(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getEffectiveElapsedSeconds() {
  if (ACTIVE_STATES.has(currentState.status) && currentState.startTime) {
    const started = Date.parse(currentState.startTime);
    if (!Number.isNaN(started)) {
      return Math.max(0, Math.floor((Date.now() - started) / 1000));
    }
  }
  return currentState.elapsedSeconds || 0;
}

function getStatusMessage(state) {
  switch (state.status) {
    case 'starting':
      return 'Preparing tab capture and offscreen recorder...';
    case 'recording':
      return 'Recording lecture audio from the active tab.';
    case 'stopping':
      return 'Stopping the recorder and flushing the final chunk...';
    case 'transcribing':
      return 'Transcribing audio chunks with OpenAI...';
    case 'generating':
      return 'Generating Markdown lecture notes...';
    case 'complete':
      return 'Notes and transcript are ready to download.';
    case 'error':
      return 'The last session ended with an error.';
    default:
      return 'Ready when you are.';
  }
}

function updateActionButtons() {
  const hasKey = Boolean(savedApiKey && savedApiKey.trim());
  const consentChecked = elements.consentCheckbox.checked;
  const canStart = currentState.status === 'idle' && hasKey && consentChecked;
  const isActive = ACTIVE_STATES.has(currentState.status);
  const showDownloads = currentState.status === 'complete';

  elements.startButton.disabled = !canStart;
  elements.startButton.hidden = currentState.status !== 'idle';
  elements.stopButton.hidden = !(currentState.status === 'starting' || currentState.status === 'recording');
  elements.stopButton.disabled = !(currentState.status === 'starting' || currentState.status === 'recording');
  elements.cancelButton.hidden = !isActive;
  elements.cancelButton.disabled = !isActive;
  elements.downloadNotesButton.hidden = !showDownloads || !currentState.notesAvailable;
  elements.downloadTranscriptButton.hidden = !showDownloads || !currentState.transcriptAvailable;
  elements.clearSessionButton.disabled = currentState.status === 'starting' || currentState.status === 'stopping';
}

function renderError(state) {
  if (state.error) {
    elements.errorMessage.hidden = false;
    elements.errorMessage.textContent = state.error;
  } else {
    elements.errorMessage.hidden = true;
    elements.errorMessage.textContent = '';
  }
}

function renderState(state) {
  currentState = { ...DEFAULT_STATE, ...state };
  document.body.dataset.state = currentState.status;
  elements.statusLabel.textContent = currentState.status.charAt(0).toUpperCase() + currentState.status.slice(1);
  elements.statusMessage.textContent = getStatusMessage(currentState);
  elements.elapsedTime.textContent = formatElapsed(getEffectiveElapsedSeconds());
  elements.chunksRecorded.textContent = String(currentState.chunksRecorded || 0);
  elements.chunksProcessed.textContent = String(currentState.chunksProcessed || 0);
  elements.tabTitle.textContent = currentState.tabTitle || '—';
  renderError(currentState);
  updateActionButtons();
}

async function refreshState() {
  try {
    const response = await sendMessage({ type: 'GET_STATE' });
    if (response.state) {
      renderState(response.state);
      return;
    }
  } catch (error) {
    console.warn('Falling back to storage state.', error.message);
  }

  const stored = await storageGet(STATE_KEY);
  renderState(stored[STATE_KEY] || DEFAULT_STATE);
}

async function loadSettings() {
  const result = await storageGet([API_KEY_KEY, CHUNK_DURATION_KEY, STATE_KEY]);
  savedApiKey = result[API_KEY_KEY] || '';
  elements.apiKey.value = '';
  elements.apiKeyStatus.textContent = maskApiKey(savedApiKey);
  elements.chunkDuration.value = String(result[CHUNK_DURATION_KEY] || DEFAULT_CHUNK_DURATION);
  renderState(result[STATE_KEY] || DEFAULT_STATE);
}

async function saveApiKey() {
  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    renderState({ ...currentState, error: 'Enter an API key before saving.' });
    return;
  }
  await storageSet({ [API_KEY_KEY]: apiKey });
  savedApiKey = apiKey;
  elements.apiKey.value = '';
  elements.apiKeyStatus.textContent = maskApiKey(savedApiKey);
  renderState({ ...currentState, error: null });
}

async function removeApiKey() {
  await storageRemove(API_KEY_KEY);
  savedApiKey = '';
  elements.apiKey.value = '';
  elements.apiKeyStatus.textContent = maskApiKey(savedApiKey);
  renderState({ ...currentState, error: null });
}

async function saveChunkDuration() {
  const duration = Number(elements.chunkDuration.value);
  if (!ALLOWED_CHUNK_DURATIONS.includes(duration)) {
    renderState({ ...currentState, error: 'Choose a valid chunk duration.' });
    return;
  }
  await storageSet({ [CHUNK_DURATION_KEY]: duration });
  renderState({ ...currentState, error: null });
}

async function runAction(type) {
  try {
    await sendMessage({ type });
    await refreshState();
  } catch (error) {
    renderState({ ...currentState, status: 'error', error: error.message });
  }
}

function bindElements() {
  elements.apiKey = document.getElementById('api-key');
  elements.apiKeyStatus = document.getElementById('api-key-status');
  elements.saveKeyButton = document.getElementById('save-key');
  elements.removeKeyButton = document.getElementById('remove-key');
  elements.chunkDuration = document.getElementById('chunk-duration');
  elements.consentCheckbox = document.getElementById('consent-checkbox');
  elements.statusLabel = document.getElementById('status-label');
  elements.statusMessage = document.getElementById('status-message');
  elements.elapsedTime = document.getElementById('elapsed-time');
  elements.chunksRecorded = document.getElementById('chunks-recorded');
  elements.chunksProcessed = document.getElementById('chunks-processed');
  elements.tabTitle = document.getElementById('tab-title');
  elements.errorMessage = document.getElementById('error-message');
  elements.startButton = document.getElementById('start-recording');
  elements.stopButton = document.getElementById('stop-recording');
  elements.cancelButton = document.getElementById('cancel-recording');
  elements.downloadNotesButton = document.getElementById('download-notes');
  elements.downloadTranscriptButton = document.getElementById('download-transcript');
  elements.clearSessionButton = document.getElementById('clear-session');
}

function registerListeners() {
  elements.saveKeyButton.addEventListener('click', () => void saveApiKey());
  elements.removeKeyButton.addEventListener('click', () => void removeApiKey());
  elements.chunkDuration.addEventListener('change', () => void saveChunkDuration());
  elements.consentCheckbox.addEventListener('change', updateActionButtons);
  elements.startButton.addEventListener('click', () => void runAction('START_RECORDING'));
  elements.stopButton.addEventListener('click', () => void runAction('STOP_RECORDING'));
  elements.cancelButton.addEventListener('click', () => void runAction('CANCEL_RECORDING'));
  elements.downloadNotesButton.addEventListener('click', () => void runAction('DOWNLOAD_NOTES'));
  elements.downloadTranscriptButton.addEventListener('click', () => void runAction('DOWNLOAD_TRANSCRIPT'));
  elements.clearSessionButton.addEventListener('click', () => void runAction('CLEAR_SESSION'));

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    if (changes[API_KEY_KEY]) {
      savedApiKey = changes[API_KEY_KEY].newValue || '';
      elements.apiKeyStatus.textContent = maskApiKey(savedApiKey);
    }
    if (changes[CHUNK_DURATION_KEY] && changes[CHUNK_DURATION_KEY].newValue) {
      elements.chunkDuration.value = String(changes[CHUNK_DURATION_KEY].newValue);
    }
    if (changes[STATE_KEY]) {
      renderState(changes[STATE_KEY].newValue || DEFAULT_STATE);
    } else {
      updateActionButtons();
    }
  });

  pollTimer = window.setInterval(() => {
    void refreshState();
  }, 5000);

  tickTimer = window.setInterval(() => {
    elements.elapsedTime.textContent = formatElapsed(getEffectiveElapsedSeconds());
  }, 1000);

  window.addEventListener('beforeunload', () => {
    if (pollTimer) {
      window.clearInterval(pollTimer);
    }
    if (tickTimer) {
      window.clearInterval(tickTimer);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  registerListeners();
  await loadSettings();
  await refreshState();
  updateActionButtons();
});
