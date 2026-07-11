import assert from 'node:assert/strict';
import test from 'node:test';

import { parseJson3Transcript } from '../dist/transcript-parser.js';

test('parseJson3Transcript joins caption fragments and preserves timing', () => {
  assert.deepEqual(parseJson3Transcript({
    events: [{
      tStartMs: 1250,
      dDurationMs: 900,
      segs: [{ utf8: 'hello' }, { utf8: ' world' }],
    }],
  }), [{ text: 'hello world', offset: 1250, duration: 900 }]);
});

test('parseJson3Transcript ignores formatting and empty events', () => {
  assert.deepEqual(parseJson3Transcript({
    events: [
      { tStartMs: 0 },
      { tStartMs: 10, segs: [{ utf8: '   ' }] },
      { segs: [{ utf8: 'missing timestamp' }] },
    ],
  }), []);
  assert.deepEqual(parseJson3Transcript({}), []);
});
