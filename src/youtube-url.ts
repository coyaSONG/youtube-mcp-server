const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Resolve a raw video ID or a common YouTube URL to its canonical video ID. */
export function extractVideoId(input: string): string {
  const value = input.trim();
  if (VIDEO_ID_PATTERN.test(value)) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Expected an 11-character YouTube video ID or a valid YouTube URL.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  let candidate: string | null = null;

  if (hostname === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v');
    } else {
      const [kind, id] = url.pathname.split('/').filter(Boolean);
      if (kind === 'shorts' || kind === 'embed' || kind === 'live') {
        candidate = id ?? null;
      }
    }
  }

  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) {
    throw new Error('The supplied URL does not contain a valid YouTube video ID.');
  }

  return candidate;
}

export function createTimestampUrl(videoId: string, seconds: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.floor(seconds))}s`;
}
