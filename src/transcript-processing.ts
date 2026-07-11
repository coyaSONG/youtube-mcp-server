import { TranscriptSegment } from './types/youtube-types.js';

function mergeSegments(segments: TranscriptSegment[]): TranscriptSegment {
  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    text: segments.map((segment) => segment.text).join(' '),
    offset: first.offset,
    duration: last.offset + last.duration - first.offset,
    videoId: first.videoId,
  };
}

function segmentSingleTranscript(
  segments: TranscriptSegment[],
  method: 'equal' | 'smart',
  count: number,
): TranscriptSegment[] {
  if (count <= 1) {
    return [mergeSegments(segments)];
  }
  if (segments.length <= count) {
    return segments;
  }

  if (method === 'equal') {
    const chunkSize = Math.ceil(segments.length / count);
    const chunks: TranscriptSegment[] = [];
    for (let index = 0; index < segments.length; index += chunkSize) {
      chunks.push(mergeSegments(segments.slice(index, index + chunkSize)));
    }
    return chunks;
  }

  const start = segments[0].offset;
  const end = Math.max(...segments.map((segment) => segment.offset + segment.duration));
  const targetDuration = Math.max((end - start) / count, 1);
  const groups: TranscriptSegment[][] = Array.from({ length: count }, () => []);

  for (const segment of segments) {
    const groupIndex = Math.min(
      Math.floor((segment.offset - start) / targetDuration),
      count - 1,
    );
    groups[groupIndex].push(segment);
  }

  return groups.filter((group) => group.length > 0).map(mergeSegments);
}

export function segmentTranscript(
  segments: TranscriptSegment[],
  method: 'equal' | 'smart',
  count: number,
): TranscriptSegment[] {
  if (segments.length === 0) {
    return [];
  }

  if (!segments.some((segment) => segment.videoId)) {
    return segmentSingleTranscript(segments, method, count);
  }

  const byVideo = new Map<string, TranscriptSegment[]>();
  for (const segment of segments) {
    const videoId = segment.videoId ?? 'unknown';
    const videoSegments = byVideo.get(videoId) ?? [];
    videoSegments.push(segment);
    byVideo.set(videoId, videoSegments);
  }

  return Array.from(byVideo.values()).flatMap((videoSegments) =>
    segmentSingleTranscript(videoSegments, method, count));
}
