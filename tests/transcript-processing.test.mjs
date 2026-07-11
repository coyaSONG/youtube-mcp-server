import assert from 'node:assert/strict';
import test from 'node:test';

import { segmentTranscript } from '../dist/transcript-processing.js';

const captions = [
  { text: 'one', offset: 0, duration: 500 },
  { text: 'two', offset: 1000, duration: 500 },
  { text: 'three', offset: 2000, duration: 500 },
  { text: 'four', offset: 9000, duration: 500 },
];

test('equal segmentation returns merged analysis chunks', () => {
  assert.deepEqual(segmentTranscript(captions, 'equal', 2), [
    { text: 'one two', offset: 0, duration: 1500, videoId: undefined },
    { text: 'three four', offset: 2000, duration: 7500, videoId: undefined },
  ]);
});

test('smart segmentation balances chunks by playback time', () => {
  const result = segmentTranscript(captions, 'smart', 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'one two three');
  assert.equal(result[1].text, 'four');
});

test('multi-video segmentation keeps videos separate', () => {
  const result = segmentTranscript([
    ...captions.slice(0, 2).map((segment) => ({ ...segment, videoId: 'video-a' })),
    ...captions.slice(0, 2).map((segment) => ({ ...segment, videoId: 'video-b' })),
  ], 'equal', 1);

  assert.deepEqual(result.map((segment) => segment.videoId), ['video-a', 'video-b']);
});
