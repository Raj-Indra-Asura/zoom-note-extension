import {
  DEFAULT_TRANSCRIPTION_PROVIDER,
  DEFAULT_NOTES_PROVIDER,
  DEFAULT_CHUNK_DURATION,
  ALLOWED_CHUNK_DURATIONS,
  getProvider,
  joinApiUrl
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
const NOTES_KEY = 'sessionNotes';
const TRANSCRIPT_KEY = 'sessionTranscript';
const FILES_KEY = 'sessionFiles';
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
const ACTIVE_STATES = new Set(['starting', 'recording', 'stopping', 'transcribing', 'generating']);
const TRANSITIONS = {
  idle: new Set(['starting', 'error']),
  starting: new Set(['recording', 'stopping', 'error', 'idle']),
  recording: new Set(['stopping', 'error', 'idle']),
  stopping: new Set(['transcribing', 'error', 'idle']),
  transcribing: new Set(['generating', 'complete', 'error', 'idle']),
  generating: new Set(['complete', 'error', 'idle']),
  complete: new Set(['idle', 'starting']),
  error: new Set(['idle', 'starting'])
};

let cachedState = null;
let offscreenReadyPromise = null;
let offscreenReadyResolver = null;
let sessionRuntime = createSessionRuntime();

function createSessionRuntime() {
  return {
    tabId: null,
    tabTitle: '',
    startTime: null,
    chunkDuration: DEFAULT_CHUNK_DURATION,
    transcriptSegments: [],
    pendingChunkPromises: new Map(),
    processedChunks: 0,
    receivedChunks: 0,
    interruptionReason: '',
    shouldFinalize: false,
    transcriptionConfig: null,
    notesConfig: null
  };
}

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

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs || []);
    });
  });
}

function getMediaStreamId(targetTabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(streamId);
    });
  });
}

async function getState() {
  if (cachedState) {
    return cachedState;
  }
  const stored = await storageGet(STATE_KEY);
  cachedState = { ...DEFAULT_STATE, ...(stored[STATE_KEY] || {}) };
  return cachedState;
}

function isValidStateTransition(from, to) {
  if (from === to) {
    return true;
  }
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].has(to));
}

function elapsedSecondsFrom(startTime) {
  if (!startTime) {
    return 0;
  }
  const start = Date.parse(startTime);
  if (Number.isNaN(start)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

async function setBadgeForState(state) {
  let text = '';
  let color = '#2160d8';
  switch (state.status) {
    case 'recording':
      text = '●';
      color = '#c62828';
      break;
    case 'transcribing':
    case 'generating':
    case 'stopping':
      text = '…';
      color = '#2160d8';
      break;
    case 'complete':
      text = '✓';
      color = '#1f8f4e';
      break;
    case 'error':
      text = '!';
      color = '#e67e22';
      break;
    default:
      text = '';
      color = '#2160d8';
      break;
  }
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

async function updateState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  if (!isValidStateTransition(current.status, next.status)) {
    next.status = patch.status || current.status;
  }
  cachedState = next;
  await storageSet({ [STATE_KEY]: next });
  await setBadgeForState(next);
  return next;
}

async function initializeState() {
  const state = await getState();
  if (!state || !state.status) {
    await updateState(DEFAULT_STATE);
  } else {
    await setBadgeForState(state);
  }
}

async function hasOffscreenDocument() {
  if (chrome.offscreen && typeof chrome.offscreen.hasDocument === 'function') {
    return chrome.offscreen.hasDocument();
  }
  const offscreenUrl = chrome.runtime.getURL('src/offscreen.html');
  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    if (!offscreenReadyPromise) {
      return;
    }
    await Promise.race([
      offscreenReadyPromise,
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
    return;
  }
  if (!offscreenReadyPromise) {
    offscreenReadyPromise = new Promise((resolve) => {
      offscreenReadyResolver = resolve;
    });
  }
  await chrome.offscreen.createDocument({
    url: 'src/offscreen.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture tab audio in an offscreen document for chunked transcription.'
  });
  await Promise.race([
    offscreenReadyPromise,
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]);
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
  offscreenReadyPromise = null;
  offscreenReadyResolver = null;
}

function isAllowedCustomBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

function resolveProviderConfig(settings, capability) {
  const isTranscription = capability === 'transcription';
  const providerKey = isTranscription ? TRANSCRIPTION_PROVIDER_KEY : NOTES_PROVIDER_KEY;
  const apiKeyKey = isTranscription ? TRANSCRIPTION_API_KEY : NOTES_API_KEY;
  const baseUrlKey = isTranscription ? TRANSCRIPTION_BASE_URL_KEY : NOTES_BASE_URL_KEY;
  const modelKey = isTranscription ? TRANSCRIPTION_MODEL_KEY : NOTES_MODEL_KEY;
  const defaultProvider = isTranscription ? DEFAULT_TRANSCRIPTION_PROVIDER : DEFAULT_NOTES_PROVIDER;
  const providerId = settings[providerKey] || defaultProvider;
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown ${capability} provider.`);
  }
  if (isTranscription && !provider.supportsTranscription) {
    throw new Error(`${provider.name} does not support the audio transcription endpoint. Choose a different transcription provider.`);
  }
  if (!isTranscription && !provider.supportsNotes) {
    throw new Error(`${provider.name} does not support note generation.`);
  }

  const apiKey = String(settings[apiKeyKey] || settings[API_KEY_KEY] || '').trim();
  const baseUrl = String(settings[baseUrlKey] || provider.baseUrl || '').trim().replace(/\/+$/, '');
  const defaultModel = isTranscription ? provider.transcriptionModel : provider.notesModel;
  const model = String(settings[modelKey] || defaultModel || '').trim();

  if (provider.requiresApiKey && !apiKey) {
    throw new Error(`Missing ${provider.name} API key for ${capability}. Save the provider settings in the popup first.`);
  }
  if (!baseUrl) {
    throw new Error(`Missing base URL for ${capability}.`);
  }
  if (providerId === 'custom' && !isAllowedCustomBaseUrl(baseUrl)) {
    throw new Error('Custom base URLs must use HTTPS, or HTTP on localhost/127.0.0.1.');
  }
  if (!model) {
    throw new Error(`Missing model name for ${capability}.`);
  }

  return { providerId, providerName: provider.name, apiKey, baseUrl, model };
}

function validateSettings(settings) {
  try {
    resolveProviderConfig(settings, 'transcription');
    resolveProviderConfig(settings, 'notes');
  } catch (error) {
    return error.message;
  }
  const duration = Number(settings.chunkDuration || DEFAULT_CHUNK_DURATION);
  if (!ALLOWED_CHUNK_DURATIONS.includes(duration)) {
    return 'Invalid chunk duration selected.';
  }
  return null;
}

function sanitizeFilename(title, timestamp, extension = 'md') {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  const collapsed = safeTitle
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/['`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const titleSegment = (collapsed || 'lecture')
    .replace(/[^A-Za-z0-9._ -]+/g, '')
    .replace(/[ ._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'lecture';
  const timestampSegment = (typeof timestamp === 'string' && timestamp ? timestamp : new Date().toISOString())
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, '')
    .replace(/Z$/, '');
  return `${titleSegment}_${timestampSegment}.${extension.replace(/^\./, '')}`;
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function assembleTranscript(segments, chunkDuration = DEFAULT_CHUNK_DURATION) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }
  return segments
    .filter((segment) => segment && typeof segment.index === 'number')
    .sort((a, b) => a.index - b.index)
    .map((segment, position) => {
      const start = Number(segment.startTime || 0);
      const end = start + Number(chunkDuration || DEFAULT_CHUNK_DURATION);
      const heading = `## Chunk ${position + 1} [${formatClock(start)} - ${formatClock(end)}]`;
      return `${heading}\n\n${(segment.text || '').trim()}`.trim();
    })
    .join('\n\n');
}

async function parseApiError(responseOrError) {
  if (!responseOrError) {
    return 'Unknown error.';
  }
  if (responseOrError instanceof Error && typeof responseOrError.ok === 'undefined') {
    return responseOrError.message || 'Network request failed.';
  }
  if (typeof responseOrError === 'string') {
    return responseOrError;
  }
  if (typeof responseOrError.json === 'function') {
    try {
      const data = await responseOrError.json();
      if (data && data.error && data.error.message) {
        return data.error.message;
      }
      return JSON.stringify(data);
    } catch {
      // Ignore and fall back to text.
    }
  }
  if (typeof responseOrError.text === 'function') {
    try {
      const text = await responseOrError.text();
      return text || `Request failed (${responseOrError.status || 'unknown'})`;
    } catch {
      // Ignore and fall back below.
    }
  }
  return responseOrError.message || `Request failed (${responseOrError.status || 'unknown'})`;
}

function buildApiHeaders(config, json = false) {
  const headers = {};
  if (config.apiKey) {
    headers.Authorization = 'Bearer ' + config.apiKey;
  }
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  if (config.providerId === 'openrouter') {
    headers['X-Title'] = 'Lecture Note Agent';
  }
  return headers;
}

async function transcribeChunk(base64Audio, chunkIndex, config) {
  const binaryStr = atob(base64Audio);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'audio/webm' });
  if (blob.size < 100) {
    return '';
  }

  const formData = new FormData();
  formData.append('model', config.model);
  formData.append('file', blob, `chunk_${chunkIndex}.webm`);
  formData.append('response_format', 'text');

  let response;
  try {
    response = await fetch(joinApiUrl(config.baseUrl, 'audio/transcriptions'), {
      method: 'POST',
      headers: buildApiHeaders(config),
      body: formData
    });
  } catch (error) {
    throw new Error(`Transcription request failed: ${await parseApiError(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Transcription failed (${response.status}): ${await parseApiError(response)}`);
  }
  return response.text();
}

async function generateNotes(transcript, title, config) {
  const prompt = [
    `Lecture title: ${title || 'Untitled lecture'}`,
    '',
    'Generate Markdown notes from the transcript below.',
    'Requirements:',
    '- Include a clear title at the top.',
    '- Use sections for key topics.',
    '- Summarize accurately and do not invent facts.',
    '- Add a brief bullet list of action items or follow-up questions only if they are supported by the transcript.',
    '- End with a short glossary of important terms mentioned when possible.',
    '',
    'Transcript:',
    transcript
  ].join('\n');

  let response;
  try {
    response = await fetch(joinApiUrl(config.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: buildApiHeaders(config, true),
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You create accurate, structured academic lecture notes based only on the provided transcript. Do not invent facts not present in the transcript.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });
  } catch (error) {
    throw new Error(`Note generation request failed: ${await parseApiError(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Note generation failed (${response.status}): ${await parseApiError(response)}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || '# Notes\n\nNo notes were returned by the API.';
}

async function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function resetRuntimeState() {
  sessionRuntime = createSessionRuntime();
  await closeOffscreenDocument().catch(() => {});
}

async function clearArtifacts() {
  await storageRemove([NOTES_KEY, TRANSCRIPT_KEY, FILES_KEY]);
}

async function handleFatalError(error, preserveArtifacts = false) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error.');
  try {
    await sendRuntimeMessage({ type: 'OFFSCREEN_CANCEL' });
  } catch {
    // Ignore cleanup messaging failures.
  }
  await resetRuntimeState();
  if (!preserveArtifacts) {
    await clearArtifacts();
  }
  await updateState({
    ...DEFAULT_STATE,
    status: 'error',
    error: message,
    notesAvailable: false,
    transcriptAvailable: false,
    badgeText: '!'
  });
}

async function startRecording() {
  const state = await getState();
  if (state.status !== 'idle') {
    throw new Error('Recording can only start from the idle state. Clear the current session first if needed.');
  }

  await clearArtifacts();
  await updateState({ ...DEFAULT_STATE, status: 'starting', error: null, badgeText: '' });

  const settings = await storageGet(SETTINGS_KEYS);
  const validationError = validateSettings({
    ...settings,
    apiKey: settings[API_KEY_KEY],
    chunkDuration: settings[CHUNK_DURATION_KEY]
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const tabs = await queryActiveTab();
  const [activeTab] = tabs;
  if (!activeTab || typeof activeTab.id !== 'number') {
    throw new Error('No active browser tab is available for capture.');
  }
  const tabUrl = activeTab.url || '';
  if (/^(chrome|edge|about):/i.test(tabUrl)) {
    throw new Error('The active tab uses a protected browser page that cannot be captured. Open your lecture in a regular web page tab.');
  }

  await ensureOffscreenDocument();
  const streamId = await getMediaStreamId(activeTab.id);
  const tabTitle = activeTab.title || 'Lecture';
  const startTime = new Date().toISOString();

  sessionRuntime = createSessionRuntime();
  sessionRuntime.tabId = activeTab.id;
  sessionRuntime.tabTitle = tabTitle;
  sessionRuntime.startTime = startTime;
  sessionRuntime.chunkDuration = Number(settings[CHUNK_DURATION_KEY] || DEFAULT_CHUNK_DURATION);
  sessionRuntime.transcriptionConfig = resolveProviderConfig(settings, 'transcription');
  sessionRuntime.notesConfig = resolveProviderConfig(settings, 'notes');

  await sendRuntimeMessage({
    type: 'OFFSCREEN_START',
    streamId,
    tabTitle,
    chunkDuration: sessionRuntime.chunkDuration
  });

  await updateState({
    ...DEFAULT_STATE,
    status: 'recording',
    tabTitle,
    startTime,
    elapsedSeconds: 0,
    badgeText: '●'
  });
}

async function stopRecording(reason = '') {
  const state = await getState();
  if (!ACTIVE_STATES.has(state.status) && state.status !== 'recording') {
    throw new Error('There is no active recording to stop.');
  }
  sessionRuntime.interruptionReason = reason;
  sessionRuntime.shouldFinalize = true;
  await updateState({
    ...state,
    status: 'stopping',
    elapsedSeconds: elapsedSecondsFrom(state.startTime),
    error: null,
    badgeText: '…'
  });
  await sendRuntimeMessage({ type: 'OFFSCREEN_STOP' });
}

async function cancelRecording() {
  try {
    await sendRuntimeMessage({ type: 'OFFSCREEN_CANCEL' });
  } catch {
    // Ignore.
  }
  await resetRuntimeState();
  await clearArtifacts();
  await updateState({ ...DEFAULT_STATE });
}

async function handleChunkReady(message) {
  sessionRuntime.receivedChunks = Math.max(sessionRuntime.receivedChunks, message.chunkIndex + 1);
  await updateState({
    ...(await getState()),
    chunksRecorded: sessionRuntime.receivedChunks,
    error: null
  });

  const pendingTask = (async () => {
    const text = await transcribeChunk(message.blob, message.chunkIndex, sessionRuntime.transcriptionConfig);
    sessionRuntime.transcriptSegments[message.chunkIndex] = {
      index: message.chunkIndex,
      startTime: Number(message.startTime || 0),
      text
    };
    sessionRuntime.processedChunks += 1;
    await updateState({
      ...(await getState()),
      chunksRecorded: sessionRuntime.receivedChunks,
      chunksProcessed: sessionRuntime.processedChunks,
      error: null
    });
  })();

  sessionRuntime.pendingChunkPromises.set(message.chunkIndex, pendingTask);
  pendingTask.catch((error) => {
    void handleFatalError(error);
  }).finally(() => {
    sessionRuntime.pendingChunkPromises.delete(message.chunkIndex);
  });
}

async function finalizeSession() {
  const state = await getState();
  await updateState({
    ...state,
    status: 'transcribing',
    elapsedSeconds: elapsedSecondsFrom(state.startTime),
    badgeText: '…'
  });

  await Promise.all([...sessionRuntime.pendingChunkPromises.values()]);

  const transcriptBody = assembleTranscript(sessionRuntime.transcriptSegments, sessionRuntime.chunkDuration);
  const transcript = transcriptBody
    ? `# Transcript\n\n${transcriptBody}`
    : '# Transcript\n\nNo speech was detected in the captured audio.';

  let notes;
  if (!transcriptBody) {
    notes = `# ${sessionRuntime.tabTitle || 'Lecture'} Notes\n\n_No lecture content could be transcribed from the captured audio._`;
  } else {
    await updateState({ ...(await getState()), status: 'generating', badgeText: '…' });
    notes = await generateNotes(transcriptBody, sessionRuntime.tabTitle, sessionRuntime.notesConfig);
  }

  const timestamp = sessionRuntime.startTime || new Date().toISOString();
  const notesFilename = sanitizeFilename(`${sessionRuntime.tabTitle || 'lecture'} Notes`, timestamp, 'md');
  const transcriptFilename = sanitizeFilename(`${sessionRuntime.tabTitle || 'lecture'} Transcript`, timestamp, 'md');

  await storageSet({
    [NOTES_KEY]: notes,
    [TRANSCRIPT_KEY]: transcript,
    [FILES_KEY]: {
      notesFilename,
      transcriptFilename,
      mimeType: 'text/markdown;charset=utf-8'
    }
  });

  await downloadFile(transcript, transcriptFilename, 'text/markdown;charset=utf-8');
  await downloadFile(notes, notesFilename, 'text/markdown;charset=utf-8');

  await updateState({
    ...(await getState()),
    status: 'complete',
    elapsedSeconds: elapsedSecondsFrom(state.startTime),
    notesAvailable: true,
    transcriptAvailable: true,
    error: null,
    badgeText: '✓'
  });
  await resetRuntimeState();
}

async function downloadStoredArtifact(kind) {
  const result = await storageGet([NOTES_KEY, TRANSCRIPT_KEY, FILES_KEY]);
  const files = result[FILES_KEY] || {};
  if (kind === 'notes') {
    if (!result[NOTES_KEY]) {
      throw new Error('No generated notes are available yet.');
    }
    await downloadFile(result[NOTES_KEY], files.notesFilename || 'lecture-notes.md', files.mimeType || 'text/markdown;charset=utf-8');
    return;
  }
  if (!result[TRANSCRIPT_KEY]) {
    throw new Error('No transcript is available yet.');
  }
  await downloadFile(result[TRANSCRIPT_KEY], files.transcriptFilename || 'lecture-transcript.md', files.mimeType || 'text/markdown;charset=utf-8');
}

async function clearSession() {
  await clearArtifacts();
  await resetRuntimeState();
  await updateState({ ...DEFAULT_STATE });
}

async function handleTabInterrupted(tabId, reason) {
  if (sessionRuntime.tabId !== tabId) {
    return;
  }
  const state = await getState();
  if (state.status === 'recording' || state.status === 'starting') {
    try {
      await stopRecording(reason);
    } catch {
      await handleFatalError(new Error(reason));
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeState();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'GET_STATE': {
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'START_RECORDING': {
        await startRecording();
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'STOP_RECORDING': {
        await stopRecording();
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'CANCEL_RECORDING': {
        await cancelRecording();
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'DOWNLOAD_NOTES': {
        await downloadStoredArtifact('notes');
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'DOWNLOAD_TRANSCRIPT': {
        await downloadStoredArtifact('transcript');
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'CLEAR_SESSION': {
        await clearSession();
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'OFFSCREEN_READY': {
        if (offscreenReadyResolver) {
          offscreenReadyResolver();
        }
        sendResponse({ ok: true });
        return;
      }
      case 'OFFSCREEN_CHUNK_READY': {
        await handleChunkReady(message);
        sendResponse({ ok: true });
        return;
      }
      case 'OFFSCREEN_DONE': {
        await finalizeSession();
        sendResponse({ ok: true, state: await getState() });
        return;
      }
      case 'OFFSCREEN_ERROR': {
        throw new Error(message.message || 'An offscreen recording error occurred.');
      }
      default:
        sendResponse({ ok: false, error: `Unknown message type: ${message?.type || 'undefined'}` });
    }
  })().catch(async (error) => {
    await handleFatalError(error);
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleTabInterrupted(tabId, 'The captured tab was closed before the session finished.');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }
  void handleTabInterrupted(tabId, 'The captured tab navigated away before the session finished.');
});

void initializeState();
