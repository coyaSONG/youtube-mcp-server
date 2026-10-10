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


test('YTR-021 completeReplies has no implicit reply cap', async () => {
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

  assert.equal(replyPage, 6);
  assert.deepEqual(result.items[0].replyCoverage, {
    available: 600,
    returned: 600,
    complete: true,
    truncated: false,
  });
  assert.equal(result.researchContext.maxRepliesPerThread, null);
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
