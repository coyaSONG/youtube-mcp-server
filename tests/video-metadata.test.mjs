import assert from 'node:assert/strict';
import test from 'node:test';

import { createResearchSourceMetadata } from '../dist/youtube-service.js';

test('research source metadata preserves citation identity', () => {
  assert.deepEqual(
    createResearchSourceMetadata('abcdefghijk', {
      title: 'How to evaluate agents',
      channel: {
        id: 'UC-research',
        name: 'Research Channel',
        url: '/@research-channel',
      },
      thumbnail: [
        { url: 'https://i.ytimg.com/vi/abcdefghijk/default.jpg' },
        { url: 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg' },
      ],
    }),
    {
      videoId: 'abcdefghijk',
      title: 'How to evaluate agents',
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      channelId: 'UC-research',
      channelName: 'Research Channel',
      channelUrl: 'https://www.youtube.com/@research-channel',
      thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg',
      captionRequestedLanguage: null,
      captionTrackLanguage: null,
      captionLanguage: null,
      captionOrigin: null,
      captionSourceOrigin: null,
    },
  );
});

test('research source metadata degrades safely when optional fields are absent', () => {
  assert.deepEqual(createResearchSourceMetadata('abcdefghijk', {}), {
    videoId: 'abcdefghijk',
    title: 'abcdefghijk',
    videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    channelId: null,
    channelName: null,
    channelUrl: null,
    thumbnailUrl: null,
    captionRequestedLanguage: null,
    captionTrackLanguage: null,
    captionLanguage: null,
    captionOrigin: null,
    captionSourceOrigin: null,
  });
});

test('research source metadata preserves selected caption provenance', () => {
  const metadata = createResearchSourceMetadata('abcdefghijk', {}, {
    requestedLanguage: 'nl',
    trackLanguage: 'en',
    outputLanguage: 'nl',
    origin: 'translated',
    sourceOrigin: 'youtube_asr',
  });

  assert.equal(metadata.captionRequestedLanguage, 'nl');
  assert.equal(metadata.captionTrackLanguage, 'en');
  assert.equal(metadata.captionLanguage, 'nl');
  assert.equal(metadata.captionOrigin, 'translated');
  assert.equal(metadata.captionSourceOrigin, 'youtube_asr');
});
