'use strict';

const assert = require('assert');

const ALLOWED_CHUNK_DURATIONS = [60, 120, 180, 300];
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

function validateSettings(settings) {
  const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  if (!apiKey) {
    return 'Missing OpenAI API key. Save an API key in the popup first.';
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
  it('accepts valid settings', () => {
    assert.strictEqual(validateSettings({ apiKey: 'sk-test', chunkDuration: 180 }), null);
  });

  it('rejects missing API keys', () => {
    assert.strictEqual(
      validateSettings({ apiKey: '', chunkDuration: 180 }),
      'Missing OpenAI API key. Save an API key in the popup first.'
    );
  });

  it('rejects invalid chunk durations', () => {
    assert.strictEqual(
      validateSettings({ apiKey: 'sk-test', chunkDuration: 30 }),
      'Invalid chunk duration selected.'
    );
  });

  it('rejects whitespace-only API keys', () => {
    assert.strictEqual(
      validateSettings({ apiKey: '   ', chunkDuration: 180 }),
      'Missing OpenAI API key. Save an API key in the popup first.'
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
