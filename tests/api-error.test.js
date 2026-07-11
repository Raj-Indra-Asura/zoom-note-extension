'use strict';

const assert = require('assert');

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
      // Ignore and fall back.
    }
  }
  if (typeof responseOrError.text === 'function') {
    try {
      return await responseOrError.text();
    } catch {
      // Ignore and fall back.
    }
  }
  return responseOrError.message || `Request failed (${responseOrError.status || 'unknown'})`;
}

describe('parseApiError', () => {
  it('extracts error.message from JSON responses', async () => {
    const message = await parseApiError({
      ok: false,
      async json() {
        return { error: { message: 'Bad request' } };
      }
    });
    assert.strictEqual(message, 'Bad request');
  });

  it('falls back when JSON has no error object', async () => {
    const message = await parseApiError({
      ok: false,
      async json() {
        return { detail: 'No explicit error key' };
      }
    });
    assert.strictEqual(message, JSON.stringify({ detail: 'No explicit error key' }));
  });

  it('returns raw text when JSON parsing is unavailable', async () => {
    const message = await parseApiError({
      ok: false,
      async text() {
        return 'Plain text failure';
      }
    });
    assert.strictEqual(message, 'Plain text failure');
  });

  it('handles network errors gracefully', async () => {
    const message = await parseApiError(new Error('Network down'));
    assert.strictEqual(message, 'Network down');
  });
});
