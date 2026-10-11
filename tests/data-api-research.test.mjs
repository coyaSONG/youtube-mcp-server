import assert from 'node:assert/strict';
import test from 'node:test';
import { YouTubeService } from '../dist/youtube-service.js';

function comment(id, parentId = undefined) {
  return {
    id,
    snippet: {
      parentId,
      authorDisplayName: `author-${id}`,
      authorChannelId: { value: `channel-${id}` },
      textDisplay: `text-${id}`,
      likeCount: 1,
      publishedAt: '2026-09-22T00:00:00Z',
      updatedAt: '2026-09-22T00:00:00Z',
    },
  };
}

test('YTR-021 completeReplies traverses reply pages and reports complete coverage', async () => {
  const service = new YouTubeService('test-key');
  const threadCalls = [];
  const replyCalls = [];

  service.youtube = {
    commentThreads: {
      list: async (args) => {
        threadCalls.push(args);
        return {
          data: {
            nextPageToken: 'thread-next',
            items: [{
              id: 'thread-1',
              snippet: {
                totalReplyCount: 3,
                topLevelComment: comment('top-1'),
              },
              replies: { comments: [comment('embedded-1', 'top-1')] },
            }],
          },
        };
      },
    },
    comments: {
      list: async (args) => {
        replyCalls.push(args);
        if (!args.pageToken) {
          return {
            data: {
              items: [comment('reply-1', 'top-1'), comment('reply-2', 'top-1')],
              nextPageToken: 'reply-next',
            },
          };
        }
        return {
          data: {
            items: [comment('reply-3', 'top-1')],
          },
        };
      },
    },
  };

  const result = await service.getComments('video-1', 20, {
    order: 'relevance',
    includeReplies: true,
    completeReplies: true,
    maxRepliesPerThread: 10,
    searchTerms: 'correction',
    pageToken: 'thread-page',
  });

  assert.equal(threadCalls.length, 1);
  assert.equal(threadCalls[0].pageToken, 'thread-page');
  assert.equal(threadCalls[0].searchTerms, 'correction');
  assert.equal(threadCalls[0].textFormat, 'plainText');
  assert.deepEqual(threadCalls[0].part, ['snippet', 'replies']);

  assert.equal(replyCalls.length, 2);
  assert.equal(replyCalls[0].parentId, 'top-1');
  assert.equal(replyCalls[0].textFormat, 'plainText');
  assert.equal(replyCalls[0].maxResults, 10);
  assert.equal(replyCalls[1].pageToken, 'reply-next');

  const thread = result.items[0];
  assert.deepEqual(
    thread.replies.comments.map((item) => item.id),
    ['reply-1', 'reply-2', 'reply-3'],
  );
  assert.deepEqual(thread.replyCoverage, {
    available: 3,
    returned: 3,
    complete: true,
    truncated: false,
  });
  assert.equal(result.nextPageToken, 'thread-next');
  assert.deepEqual(result.researchContext, {
    videoId: 'video-1',
    sourceUrl: 'https://www.youtube.com/watch?v=video-1',
    maxResults: 20,
    order: 'relevance',
    searchTerms: 'correction',
    pageToken: 'thread-page',
    includeReplies: true,
    completeReplies: true,
    maxRepliesPerThread: 10,
  });
});

test('YTR-021 completeReplies honors maxRepliesPerThread and marks truncation', async () => {
  const service = new YouTubeService('test-key');
  let replyCalls = 0;

  service.youtube = {
    commentThreads: {
      list: async () => ({
        data: {
          items: [{
            id: 'thread-1',
            snippet: {
              totalReplyCount: 5,
              topLevelComment: comment('top-1'),
            },
            replies: { comments: [comment('embedded-1', 'top-1')] },
          }],
        },
      }),
    },
    comments: {
      list: async (args) => {
        replyCalls += 1;
        assert.equal(args.maxResults, 2);
        return {
          data: {
            items: [comment('reply-1', 'top-1'), comment('reply-2', 'top-1')],
            nextPageToken: 'still-more',
          },
        };
      },
    },
  };

  const result = await service.getComments('video-1', 20, {
    includeReplies: true,
    completeReplies: true,
    maxRepliesPerThread: 2,
  });

  assert.equal(replyCalls, 1);
  assert.deepEqual(result.items[0].replyCoverage, {
    available: 5,
    returned: 2,
    complete: false,
    truncated: true,
  });
});


test('YTR-021 completeReplies enforces a default reply cap', async () => {
  const service = new YouTubeService('test-key');
  let replyPage = 0;

  service.youtube = {
    commentThreads: {
      list: async () => ({
        data: {
          items: [{
            id: 'thread-large',
            snippet: {
              totalReplyCount: 600,
              topLevelComment: comment('top-large'),
            },
            replies: { comments: [] },
          }],
        },
      }),
    },
    comments: {
      list: async (args) => {
        assert.equal(args.maxResults, 100);
        const currentPage = replyPage;
        replyPage += 1;
        return {
          data: {
            items: Array.from(
              { length: 100 },
              (_, index) => comment(`reply-${currentPage * 100 + index + 1}`, 'top-large'),
            ),
            nextPageToken: replyPage < 6 ? `reply-page-${replyPage}` : undefined,
          },
        };
      },
    },
  };

  const result = await service.getComments('video-large', 20, {
    completeReplies: true,
  });

  assert.equal(replyPage, 1);
  assert.deepEqual(result.items[0].replyCoverage, {
    available: 600,
    returned: 100,
    complete: false,
    truncated: true,
  });
  assert.equal(result.researchContext.maxRepliesPerThread, 100);
});


test('YTR-021 caller bound applies when embedded replies are already complete', async () => {
  const service = new YouTubeService('test-key');

  service.youtube = {
    commentThreads: {
      list: async () => ({
        data: {
          items: [{
            id: 'thread-embedded-bound',
            snippet: {
              totalReplyCount: 3,
              topLevelComment: comment('top-embedded-bound'),
            },
            replies: {
              comments: [
                comment('reply-1', 'top-embedded-bound'),
                comment('reply-2', 'top-embedded-bound'),
                comment('reply-3', 'top-embedded-bound'),
              ],
            },
          }],
        },
      }),
    },
    comments: {
      list: async () => {
        throw new Error('comments.list should not be called for complete embedded replies');
      },
    },
  };

  const result = await service.getComments('video-embedded-bound', 20, {
    completeReplies: true,
    maxRepliesPerThread: 2,
  });

  assert.deepEqual(
    result.items[0].replies.comments.map((item) => item.id),
    ['reply-1', 'reply-2'],
  );
  assert.deepEqual(result.items[0].replyCoverage, {
    available: 3,
    returned: 2,
    complete: false,
    truncated: true,
  });
});

test('YTR-021 completeReplies avoids extra calls when embedded replies are already complete', async () => {
  const service = new YouTubeService('test-key');

  service.youtube = {
    commentThreads: {
      list: async () => ({
        data: {
          items: [{
            id: 'thread-1',
            snippet: {
              totalReplyCount: 2,
              topLevelComment: comment('top-1'),
            },
            replies: {
              comments: [
                comment('reply-1', 'top-1'),
                comment('reply-2', 'top-1'),
              ],
            },
          }],
        },
      }),
    },
    comments: {
      list: async () => {
        throw new Error('comments.list should not be called');
      },
    },
  };

  const result = await service.getComments('video-1', 20, {
    includeReplies: true,
    completeReplies: true,
  });

  assert.deepEqual(result.items[0].replyCoverage, {
    available: 2,
    returned: 2,
    complete: true,
    truncated: false,
  });
});

test('YTR-030 searchVideos forwards pageToken and preserves provider pagination', async () => {
  const service = new YouTubeService('test-key');
  const calls = [];

  service.youtube = {
    search: {
      list: async (args) => {
        calls.push(args);
        return {
          data: {
            nextPageToken: 'next-page',
            items: [],
          },
        };
      },
    },
  };

  const result = await service.searchVideos('homelab', 10, {
    order: 'relevance',
    pageToken: 'page-2',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pageToken, 'page-2');
  assert.equal(result.nextPageToken, 'next-page');
});


test('YTR-040 video details request research metadata and statistics', async () => {
  const service = new YouTubeService('test-key');
  const calls = [];
  service.youtube = {
    videos: {
      list: async (args) => {
        calls.push(args);
        return { data: { items: [] } };
      },
    },
  };

  await service.getVideoDetails('video-1');

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].part, ['snippet', 'contentDetails', 'statistics']);
  assert.deepEqual(calls[0].id, ['video-1']);
});

test('YTR-040 channel details request research metadata and statistics', async () => {
  const service = new YouTubeService('test-key');
  const calls = [];
  service.youtube = {
    channels: {
      list: async (args) => {
        calls.push(args);
        return { data: { items: [] } };
      },
    },
  };

  await service.getChannelDetails('channel-1');

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].part, ['snippet', 'statistics']);
  assert.deepEqual(calls[0].id, ['channel-1']);
});

test('YTR-010 Data API methods fail explicitly without an API key', async () => {
  const service = new YouTubeService();
  await assert.rejects(
    service.getComments('video-1'),
    /API key/i,
  );
});

function stubComments(threads, fetchReplies) {
  const service = new YouTubeService('test-key');
  service.youtube = {
    commentThreads: { list: async () => ({ data: { items: threads, nextPageToken: 'top-next' } }) },
    comments: { list: fetchReplies },
  };
  return service;
}

function thread(id, total, embedded = []) {
  return { snippet: { totalReplyCount: total, topLevelComment: comment(id) }, replies: { comments: embedded } };
}

test('reply budget is shared across threads and preserves top-level continuation', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 1000), thread('two', 1000)], async (args) => {
    calls += 1;
    return { data: { items: Array.from({ length: args.maxResults }, (_, i) => comment(`${calls}-${i}`)), nextPageToken: calls < 10 ? `p${calls}` : undefined } };
  });
  const result = await service.getComments('video', 20, { completeReplies: true, maxRepliesPerThread: 1000 });
  assert.equal(calls, 10);
  assert.equal(result.items[0].replyCoverage.complete, true);
  assert.deepEqual(result.items[1].replyCoverage, { available: 1000, returned: 0, complete: false, truncated: true });
  assert.equal(result.nextPageToken, 'top-next');
});

test('reply request budget bounds low-yield pages across threads', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 100), thread('two', 100)], async () => {
    calls += 1;
    return { data: { items: [comment(`reply-${calls}`)], nextPageToken: `p${calls}` } };
  });
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.equal(calls, 20);
  assert.equal(result.items[0].replyCoverage.returned, 20);
  assert.ok(result.items.every((item) => item.replyCoverage.truncated && !item.replyCoverage.complete));
});

test('empty pages with changing tokens stop without claiming completion', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 100)], async () => ({ data: { items: [], nextPageToken: `p${++calls}` } }));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.equal(calls, 1);
  assert.equal(result.items[0].replyCoverage.complete, false);
  assert.equal(result.items[0].replyCoverage.truncated, true);
});

test('overlapping pages count unique reply IDs and retain later unique replies', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 3)], async () => ({ data: ++calls === 1
    ? { items: [comment('a'), comment('b')], nextPageToken: 'second' }
    : { items: [comment('b'), comment('c')] } }));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.deepEqual(result.items[0].replies.comments.map((reply) => reply.id), ['a', 'b', 'c']);
  assert.equal(result.items[0].replyCoverage.complete, true);
});

test('duplicate-only pages cannot satisfy completeness or keep fetching', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 2)], async () => ({ data: { items: [comment('same')], nextPageToken: `p${++calls}` } }));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.equal(calls, 2);
  assert.deepEqual(result.items[0].replyCoverage, { available: 2, returned: 1, complete: false, truncated: true });
});

test('repeated tokens stop even when each page contains new replies', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 3)], async () => ({ data: { items: [comment(`r${++calls}`)], nextPageToken: 'same-token' } }));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.equal(calls, 2);
  assert.equal(result.items[0].replyCoverage.complete, false);
});

test('embedded duplicates do not prevent fetching the missing unique replies', async () => {
  let calls = 0;
  const service = stubComments([thread('one', 2, [comment('a'), comment('a')])], async () => {
    calls += 1;
    return { data: { items: [comment('a'), comment('b')] } };
  });
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.equal(calls, 1);
  assert.equal(result.items[0].replyCoverage.complete, true);
});

test('embedded replies share the aggregate budget even without full retrieval', async () => {
  const embedded = Array.from({ length: 600 }, (_, i) => comment(`r${i}`));
  const service = stubComments([thread('one', 600, embedded), thread('two', 600, embedded)], async () => assert.fail('no reply request expected'));
  const result = await service.getComments('video', 20, { includeReplies: true });
  assert.equal(result.items[0].replyCoverage.returned, 600);
  assert.deepEqual(result.items[1].replyCoverage, { available: 600, returned: 400, complete: false, truncated: true });
});

test('reply byte budget never silently cuts comment text', async () => {
  const hugeReply = comment('huge'); hugeReply.snippet.textDisplay = 'x'.repeat(1024 * 1024);
  const service = stubComments([thread('one', 2)], async () => ({ data: { items: [comment('small'), hugeReply] } }));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.deepEqual(result.items[0].replies.comments.map((reply) => reply.id), ['small']);
  assert.equal(result.items[0].replyCoverage.truncated, true);
  assert.equal(result.items[0].replyCoverage.complete, false);
});

test('missing IDs and prematurely ended pages cannot establish complete evidence', async () => {
  const service = stubComments([thread('one', 2)], async () => ({ data: { items: [comment('a'), comment(undefined)] } }));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.equal(result.items[0].replyCoverage.returned, 1);
  assert.equal(result.items[0].replyCoverage.complete, false);
});

test('zero-reply threads need no extra API call', async () => {
  const service = stubComments([thread('one', 0)], async () => assert.fail('no reply request expected'));
  const result = await service.getComments('video', 20, { completeReplies: true });
  assert.deepEqual(result.items[0].replyCoverage, { available: 0, returned: 0, complete: true, truncated: false });
});

test('service rejects non-finite, fractional and oversized bounds before API calls', async () => {
  const service = new YouTubeService('test-key');
  service.youtube = { commentThreads: { list: async () => assert.fail('invalid bounds must not reach API') } };
  for (const cap of [NaN, Infinity, 0, -1, 1.5, 1001]) {
    await assert.rejects(service.getComments('video', 20, { completeReplies: true, maxRepliesPerThread: cap }), /maxRepliesPerThread/);
  }
  await assert.rejects(service.getComments('video', 101), /maxResults/);
});

for (const missingCount of [undefined, null]) {
  test(`unknown reply count (${missingCount}) never claims complete coverage`, async () => {
    let calls = 0;
    const service = stubComments([thread('one', missingCount)], async () => {
      calls += 1;
      return { data: { items: [comment('a')] } };
    });
    const result = await service.getComments('video', 20, { completeReplies: true });
    assert.equal(calls, 1);
    assert.equal(result.items[0].replyCoverage.returned, 1);
    assert.equal(result.items[0].replyCoverage.complete, false);
  });
}
