import assert from 'node:assert/strict';
import test from 'node:test';

import { createTimestampUrl, extractVideoId } from '../dist/youtube-url.js';

const videoId = 'dQw4w9WgXcQ';

test('extractVideoId accepts IDs and common YouTube URL formats', () => {
  const inputs = [
    videoId,
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}?si=demo`,
    `https://youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube.com/live/${videoId}`,
  ];

  for (const input of inputs) {
    assert.equal(extractVideoId(input), videoId);
  }
});

test('extractVideoId rejects unrelated and malformed inputs', () => {
  assert.throws(() => extractVideoId('not a video'), /11-character/);
  assert.throws(() => extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), /does not contain/);
});

test('createTimestampUrl creates stable source links', () => {
  assert.equal(
    createTimestampUrl(videoId, 65.9),
    `https://www.youtube.com/watch?v=${videoId}&t=65s`,
  );
});
