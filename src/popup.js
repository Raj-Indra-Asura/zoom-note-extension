import {
  PROVIDERS,
  DEFAULT_TRANSCRIPTION_PROVIDER,
  DEFAULT_NOTES_PROVIDER
} from './constants.js';

const STATE_KEY = 'sessionState';
const API_KEY_KEY = 'apiKey';
const CHUNK_DURATION_KEY = 'chunkDuration';
const TRANSCRIPTION_PROVIDER_KEY = 'transcriptionProvider';
const TRANSCRIPTION_API_KEY = 'transcriptionApiKey';
const TRANSCRIPTION_BASE_URL_KEY = 'transcriptionBaseUrl';
const TRANSCRIPTION_MODEL_KEY = 'transcriptionModel';
const NOTES_PROVIDER_KEY = 'notesProvider';
const NOTES_API_KEY = 'notesApiKey';
const NOTES_BASE_URL_KEY = 'notesBaseUrl';
const NOTES_MODEL_KEY = 'notesModel';
const SETTINGS_KEYS = [
  API_KEY_KEY,
  CHUNK_DURATION_KEY,
  TRANSCRIPTION_PROVIDER_KEY,
  TRANSCRIPTION_API_KEY,
  TRANSCRIPTION_BASE_URL_KEY,
  TRANSCRIPTION_MODEL_KEY,
  NOTES_PROVIDER_KEY,
  NOTES_API_KEY,
  NOTES_BASE_URL_KEY,
  NOTES_MODEL_KEY
];
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
let savedSettings = {};
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

function requestOriginPermission(baseUrl) {
  return new Promise((resolve, reject) => {
    let origin;
    try {
      const url = new URL(baseUrl);
      const isAllowed = url.protocol === 'https:'
        || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
      if (!isAllowed) {
        reject(new Error('Custom base URLs must use HTTPS, or HTTP on localhost/127.0.0.1.'));
        return;
      }
      origin = `${url.origin}/*`;
    } catch {
      reject(new Error('Enter a valid custom base URL.'));
      return;
    }

    chrome.permissions.request({ origins: [origin] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!granted) {
        reject(new Error(`Permission to connect to ${origin} was not granted.`));
        return;
      }
      resolve();
    });
  });
}

function providerElements(capability) {
  if (capability === 'transcription') {
    return {
      provider: elements.transcriptionProvider,
      apiKey: elements.transcriptionApiKey,
      baseUrl: elements.transcriptionBaseUrl,
      baseUrlRow: elements.transcriptionBaseUrlRow,
      model: elements.transcriptionModel,
      keyStatus: elements.transcriptionKeyStatus,
      savedKeyName: TRANSCRIPTION_API_KEY
    };
  }
  return {
    provider: elements.notesProvider,
    apiKey: elements.notesApiKey,
    baseUrl: elements.notesBaseUrl,
    baseUrlRow: elements.notesBaseUrlRow,
    model: elements.notesModel,
    keyStatus: elements.notesKeyStatus,
    savedKeyName: NOTES_API_KEY
  };
}

function updateProviderFields(capability, resetDefaults = false) {
  const fields = providerElements(capability);
  const provider = PROVIDERS[fields.provider.value];
  const isCustom = fields.provider.value === 'custom';
  fields.baseUrlRow.hidden = !isCustom;
  if (resetDefaults && provider) {
    fields.baseUrl.value = provider.baseUrl;
    fields.model.value = capability === 'transcription' ? provider.transcriptionModel : provider.notesModel;
  }
  updateConsentText();
  updateActionButtons();
}

function updateConsentText() {
  if (!elements.consentText || !elements.transcriptionProvider || !elements.notesProvider) {
    return;
  }
  const transcriptionName = PROVIDERS[elements.transcriptionProvider.value]?.name || 'selected transcription provider';
  const notesName = PROVIDERS[elements.notesProvider.value]?.name || 'selected note provider';
  elements.consentText.textContent = `I understand this extension will send captured audio to ${transcriptionName} and the resulting transcript to ${notesName}.`;
}

function isProviderReady(capability) {
  const fields = providerElements(capability);
  const provider = PROVIDERS[fields.provider.value];
  if (!provider) {
    return false;
  }
  const supportsCapability = capability === 'transcription'
    ? provider.supportsTranscription
    : provider.supportsNotes;
  if (!supportsCapability || !fields.model.value.trim()) {
    return false;
  }
  const apiKey = fields.apiKey.value.trim() || savedSettings[fields.savedKeyName] || '';
  if (provider.requiresApiKey && !apiKey.trim()) {
    return false;
  }
  return fields.provider.value !== 'custom' || Boolean(fields.baseUrl.value.trim());
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
      return 'Transcribing audio chunks with your selected provider...';
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
  const consentChecked = elements.consentCheckbox.checked;
  const providersReady = isProviderReady('transcription') && isProviderReady('notes');
  const canStart = currentState.status === 'idle' && providersReady && consentChecked;
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
  const result = await storageGet([...SETTINGS_KEYS, STATE_KEY]);
  if (result[API_KEY_KEY] && !result[TRANSCRIPTION_API_KEY] && !result[NOTES_API_KEY]) {
    result[TRANSCRIPTION_API_KEY] = result[API_KEY_KEY];
    result[NOTES_API_KEY] = result[API_KEY_KEY];
    await storageSet({
      [TRANSCRIPTION_API_KEY]: result[API_KEY_KEY],
      [NOTES_API_KEY]: result[API_KEY_KEY]
    });
    await storageRemove(API_KEY_KEY);
  }
  savedSettings = { ...result };

  const transcriptionProvider = result[TRANSCRIPTION_PROVIDER_KEY] || DEFAULT_TRANSCRIPTION_PROVIDER;
  const transcriptionDefinition = PROVIDERS[transcriptionProvider];
  elements.transcriptionProvider.value = transcriptionProvider;
  elements.transcriptionBaseUrl.value = result[TRANSCRIPTION_BASE_URL_KEY] || transcriptionDefinition.baseUrl;
  elements.transcriptionModel.value = result[TRANSCRIPTION_MODEL_KEY] || transcriptionDefinition.transcriptionModel;
  elements.transcriptionApiKey.value = '';
  elements.transcriptionKeyStatus.textContent = maskApiKey(result[TRANSCRIPTION_API_KEY]);

  const notesProvider = result[NOTES_PROVIDER_KEY] || DEFAULT_NOTES_PROVIDER;
  const notesDefinition = PROVIDERS[notesProvider];
  elements.notesProvider.value = notesProvider;
  elements.notesBaseUrl.value = result[NOTES_BASE_URL_KEY] || notesDefinition.baseUrl;
  elements.notesModel.value = result[NOTES_MODEL_KEY] || notesDefinition.notesModel;
  elements.notesApiKey.value = '';
  elements.notesKeyStatus.textContent = maskApiKey(result[NOTES_API_KEY]);

  updateProviderFields('transcription');
  updateProviderFields('notes');
  elements.chunkDuration.value = String(result[CHUNK_DURATION_KEY] || DEFAULT_CHUNK_DURATION);
  renderState(result[STATE_KEY] || DEFAULT_STATE);
}

async function saveProviders() {
  try {
    for (const capability of ['transcription', 'notes']) {
      const fields = providerElements(capability);
      if (fields.provider.value === 'custom') {
        await requestOriginPermission(fields.baseUrl.value.trim());
      }
    }

    const transcriptionApiKey = elements.transcriptionApiKey.value.trim()
      || savedSettings[TRANSCRIPTION_API_KEY]
      || '';
    const notesApiKey = elements.notesApiKey.value.trim()
      || savedSettings[NOTES_API_KEY]
      || '';
    const values = {
      [TRANSCRIPTION_PROVIDER_KEY]: elements.transcriptionProvider.value,
      [TRANSCRIPTION_API_KEY]: transcriptionApiKey,
      [TRANSCRIPTION_BASE_URL_KEY]: elements.transcriptionBaseUrl.value.trim().replace(/\/+$/, ''),
      [TRANSCRIPTION_MODEL_KEY]: elements.transcriptionModel.value.trim(),
      [NOTES_PROVIDER_KEY]: elements.notesProvider.value,
      [NOTES_API_KEY]: notesApiKey,
      [NOTES_BASE_URL_KEY]: elements.notesBaseUrl.value.trim().replace(/\/+$/, ''),
      [NOTES_MODEL_KEY]: elements.notesModel.value.trim()
    };
    await storageSet(values);
    await storageRemove(API_KEY_KEY);
    savedSettings = { ...savedSettings, ...values };
    elements.transcriptionApiKey.value = '';
    elements.notesApiKey.value = '';
    elements.transcriptionKeyStatus.textContent = maskApiKey(transcriptionApiKey);
    elements.notesKeyStatus.textContent = maskApiKey(notesApiKey);
    renderState({ ...currentState, error: null });
  } catch (error) {
    renderState({ ...currentState, error: error.message });
  }
}

async function removeApiKeys() {
  await storageRemove([API_KEY_KEY, TRANSCRIPTION_API_KEY, NOTES_API_KEY]);
  delete savedSettings[API_KEY_KEY];
  delete savedSettings[TRANSCRIPTION_API_KEY];
  delete savedSettings[NOTES_API_KEY];
  elements.transcriptionApiKey.value = '';
  elements.notesApiKey.value = '';
  elements.transcriptionKeyStatus.textContent = maskApiKey('');
  elements.notesKeyStatus.textContent = maskApiKey('');
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
  elements.transcriptionProvider = document.getElementById('transcription-provider');
  elements.transcriptionApiKey = document.getElementById('transcription-api-key');
  elements.transcriptionKeyStatus = document.getElementById('transcription-key-status');
  elements.transcriptionBaseUrl = document.getElementById('transcription-base-url');
  elements.transcriptionBaseUrlRow = document.getElementById('transcription-base-url-row');
  elements.transcriptionModel = document.getElementById('transcription-model');
  elements.notesProvider = document.getElementById('notes-provider');
  elements.notesApiKey = document.getElementById('notes-api-key');
  elements.notesKeyStatus = document.getElementById('notes-key-status');
  elements.notesBaseUrl = document.getElementById('notes-base-url');
  elements.notesBaseUrlRow = document.getElementById('notes-base-url-row');
  elements.notesModel = document.getElementById('notes-model');
  elements.saveProvidersButton = document.getElementById('save-providers');
  elements.removeKeysButton = document.getElementById('remove-keys');
  elements.chunkDuration = document.getElementById('chunk-duration');
  elements.consentCheckbox = document.getElementById('consent-checkbox');
  elements.consentText = document.getElementById('consent-text');
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
  elements.saveProvidersButton.addEventListener('click', () => void saveProviders());
  elements.removeKeysButton.addEventListener('click', () => void removeApiKeys());
  elements.transcriptionProvider.addEventListener('change', () => updateProviderFields('transcription', true));
  elements.notesProvider.addEventListener('change', () => updateProviderFields('notes', true));
  for (const input of [
    elements.transcriptionApiKey,
    elements.transcriptionBaseUrl,
    elements.transcriptionModel,
    elements.notesApiKey,
    elements.notesBaseUrl,
    elements.notesModel
  ]) {
    input.addEventListener('input', updateActionButtons);
  }
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
    if (changes[TRANSCRIPTION_API_KEY]) {
      savedSettings[TRANSCRIPTION_API_KEY] = changes[TRANSCRIPTION_API_KEY].newValue || '';
      elements.transcriptionKeyStatus.textContent = maskApiKey(savedSettings[TRANSCRIPTION_API_KEY]);
    }
    if (changes[NOTES_API_KEY]) {
      savedSettings[NOTES_API_KEY] = changes[NOTES_API_KEY].newValue || '';
      elements.notesKeyStatus.textContent = maskApiKey(savedSettings[NOTES_API_KEY]);
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
