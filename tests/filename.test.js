'use strict';

const assert = require('assert');

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
  const timestampSegment = timestamp.replace(/:/g, '-').replace(/Z$/, '');
  return `${titleSegment}_${timestampSegment}.${extension}`;
}

describe('sanitizeFilename', () => {
  it('sanitizes a normal title', () => {
    assert.strictEqual(
      sanitizeFilename('My Lecture', '2024-01-01T10:00:00Z'),
      'My-Lecture_2024-01-01T10-00-00.md'
    );
  });

  it('removes special characters safely', () => {
    assert.strictEqual(
      sanitizeFilename('Lecture: CS101 <test>', '2024-01-01T10:00:00Z'),
      'Lecture-CS101-test_2024-01-01T10-00-00.md'
    );
  });

  it('uses a fallback title when empty', () => {
    assert.strictEqual(
      sanitizeFilename('', '2024-01-01T10:00:00Z'),
      'lecture_2024-01-01T10-00-00.md'
    );
  });

  it('truncates very long titles to about 80 characters', () => {
    const result = sanitizeFilename('A'.repeat(200), '2024-01-01T10:00:00Z');
    assert.ok(result.startsWith(`${'A'.repeat(80)}_2024-01-01T10-00-00.md`));
  });

  it('uses a fallback for null or undefined titles', () => {
    assert.strictEqual(
      sanitizeFilename(null, '2024-01-01T10:00:00Z'),
      'lecture_2024-01-01T10-00-00.md'
    );
    assert.strictEqual(
      sanitizeFilename(undefined, '2024-01-01T10:00:00Z'),
      'lecture_2024-01-01T10-00-00.md'
    );
  });
});
