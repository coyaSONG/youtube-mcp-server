import { TranscriptSegment } from './types/youtube-types.js';

export interface Json3CaptionEvent {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

export interface Json3CaptionResponse {
  events?: Json3CaptionEvent[];
}

export function parseJson3Transcript(data: Json3CaptionResponse): TranscriptSegment[] {
  return (data.events ?? []).flatMap((event) => {
    const text = event.segs?.map((segment) => segment.utf8 ?? '').join('').trim();
    if (!text || event.tStartMs === undefined) {
      return [];
    }

    return [{
      text,
      offset: event.tStartMs,
      duration: event.dDurationMs ?? 0,
    }];
  });
}
