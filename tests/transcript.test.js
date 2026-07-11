'use strict';

const assert = require('assert');

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function assembleTranscript(segments, chunkDuration = 180) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }
  return segments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((segment, position) => {
      const start = segment.startTime || 0;
      const end = start + chunkDuration;
      return `## Chunk ${position + 1} [${formatClock(start)} - ${formatClock(end)}]\n\n${segment.text}`;
    })
    .join('\n\n');
}

describe('assembleTranscript', () => {
  it('orders segments by index', () => {
    const transcript = assembleTranscript([
      { index: 2, startTime: 360, text: 'Third chunk' },
      { index: 0, startTime: 0, text: 'First chunk' },
      { index: 1, startTime: 180, text: 'Second chunk' }
    ]);
    assert.ok(transcript.indexOf('First chunk') < transcript.indexOf('Second chunk'));
    assert.ok(transcript.indexOf('Second chunk') < transcript.indexOf('Third chunk'));
  });

  it('uses the expected heading format', () => {
    assert.strictEqual(
      assembleTranscript([{ index: 0, startTime: 0, text: 'Hello world' }]),
      '## Chunk 1 [00:00 - 03:00]\n\nHello world'
    );
  });

  it('returns an empty string for empty segments', () => {
    assert.strictEqual(assembleTranscript([]), '');
  });

  it('formats a single segment correctly', () => {
    assert.strictEqual(
      assembleTranscript([{ index: 5, startTime: 60, text: 'Only one' }]),
      '## Chunk 1 [01:00 - 04:00]\n\nOnly one'
    );
  });
});
