'use strict';

const assert = require('assert');

const ALLOWED_CHUNK_DURATIONS = [60, 120, 180, 300];
const PROVIDERS = {
  openai: { name: 'OpenAI', supportsTranscription: true, supportsNotes: true, requiresApiKey: true, baseUrl: 'https://api.openai.com/v1' },
  groq: { name: 'Groq', supportsTranscription: true, supportsNotes: true, requiresApiKey: true, baseUrl: 'https://api.groq.com/openai/v1' },
  openrouter: { name: 'OpenRouter', supportsTranscription: false, supportsNotes: true, requiresApiKey: true, baseUrl: 'https://openrouter.ai/api/v1' },
  custom: { name: 'Custom OpenAI-compatible', supportsTranscription: true, supportsNotes: true, requiresApiKey: false, baseUrl: '' }
};
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

function isAllowedCustomBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

function validateProvider(settings, capability) {
  const prefix = capability === 'transcription' ? 'transcription' : 'notes';
  const provider = PROVIDERS[settings[`${prefix}Provider`]];
  if (!provider) {
    return `Unknown ${capability} provider.`;
  }
  if (capability === 'transcription' && !provider.supportsTranscription) {
    return `${provider.name} does not support the audio transcription endpoint. Choose a different transcription provider.`;
  }
  if (provider.requiresApiKey && !String(settings[`${prefix}ApiKey`] || '').trim()) {
    return `Missing ${provider.name} API key for ${capability}. Save the provider settings in the popup first.`;
  }
  const baseUrl = settings[`${prefix}BaseUrl`] || provider.baseUrl;
  if (settings[`${prefix}Provider`] === 'custom' && !isAllowedCustomBaseUrl(baseUrl)) {
    return 'Custom base URLs must use HTTPS, or HTTP on localhost/127.0.0.1.';
  }
  if (!String(settings[`${prefix}Model`] || '').trim()) {
    return `Missing model name for ${capability}.`;
  }
  return null;
}

function validateSettings(settings) {
  const providerError = validateProvider(settings, 'transcription') || validateProvider(settings, 'notes');
  if (providerError) {
    return providerError;
  }
  const duration = Number(settings.chunkDuration);
  if (!ALLOWED_CHUNK_DURATIONS.includes(duration)) {
    return 'Invalid chunk duration selected.';
  }
  return null;
}

function isValidState(from, to) {
  if (from === to) {
    return true;
  }
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].has(to));
}

describe('validateSettings', () => {
  const validSettings = {
    transcriptionProvider: 'groq',
    transcriptionApiKey: 'test-transcription-key',
    transcriptionModel: 'whisper-large-v3-turbo',
    notesProvider: 'openrouter',
    notesApiKey: 'test-notes-key',
    notesModel: 'openrouter/free',
    chunkDuration: 180
  };

  it('accepts valid settings', () => {
    assert.strictEqual(validateSettings(validSettings), null);
  });

  it('rejects missing provider API keys', () => {
    assert.strictEqual(
      validateSettings({ ...validSettings, notesApiKey: '' }),
      'Missing OpenRouter API key for notes. Save the provider settings in the popup first.'
    );
  });

  it('rejects invalid chunk durations', () => {
    assert.strictEqual(
      validateSettings({ ...validSettings, chunkDuration: 30 }),
      'Invalid chunk duration selected.'
    );
  });

  it('rejects a provider without transcription support', () => {
    assert.strictEqual(
      validateSettings({ ...validSettings, transcriptionProvider: 'openrouter' }),
      'OpenRouter does not support the audio transcription endpoint. Choose a different transcription provider.'
    );
  });

  it('allows a keyless local OpenAI-compatible provider', () => {
    assert.strictEqual(validateSettings({
      ...validSettings,
      transcriptionProvider: 'custom',
      transcriptionApiKey: '',
      transcriptionBaseUrl: 'http://localhost:8000/v1',
      transcriptionModel: 'whisper-local'
    }), null);
  });

  it('rejects insecure remote custom endpoints', () => {
    assert.strictEqual(
      validateSettings({
        ...validSettings,
        notesProvider: 'custom',
        notesApiKey: '',
        notesBaseUrl: 'http://provider.example/v1',
        notesModel: 'local-model'
      }),
      'Custom base URLs must use HTTPS, or HTTP on localhost/127.0.0.1.'
    );
  });
});

describe('isValidState', () => {
  it('accepts valid transitions', () => {
    assert.strictEqual(isValidState('idle', 'starting'), true);
    assert.strictEqual(isValidState('recording', 'stopping'), true);
    assert.strictEqual(isValidState('complete', 'idle'), true);
  });

  it('rejects invalid transitions', () => {
    assert.strictEqual(isValidState('idle', 'stopping'), false);
    assert.strictEqual(isValidState('generating', 'recording'), false);
  });
});
