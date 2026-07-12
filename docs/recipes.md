# YouTube Research Recipes

These recipes work with `research-video` and `research-videos` without a
YouTube Data API key. Replace the example URLs with your own sources.

## Fact-check a claim

```text
Use research-video on https://youtu.be/VIDEO_ID.
Find evidence about "evaluation" and return the three strongest excerpts.
For each excerpt include its citation label, exact timestamp link, and one
sentence explaining whether it supports or contradicts the claim.
```

Use `matchMode: "word"`, `contextLines: 2`, and `maxSegments: 3` when calling
the tool directly.

## Compare the same topic across sources

```text
Use research-videos to compare these interviews:
- https://youtu.be/VIDEO_ONE
- https://youtu.be/VIDEO_TWO

Find what each says about "agents". Make a two-column evidence table with
video title, channel, quoted text, and timestamp link. Call out agreements and
contradictions without inventing conclusions beyond the cited excerpts.
```

## Navigate a long talk without loading the full transcript

Start with a focused query and a small result cap:

```json
{
  "video": "https://youtu.be/VIDEO_ID",
  "query": "benchmark",
  "contextLines": 1,
  "maxSegments": 5
}
```

If the result is truncated, continue from `nextOffset`. Use `startSeconds` and
`endSeconds` when you already know the relevant part of the video.

## Research captions in another language

```text
Research https://youtu.be/VIDEO_ID using Korean captions (`language: "ko"`).
Find references to "안전" and keep the original Korean evidence with exact
timestamp links. Summarize the evidence in English only after citing it.
```

Caption availability and translation depend on the video. The tool returns a
clear error when YouTube does not expose a usable track.

## Build a citation-ready note

The structured result contains source identity once per video and compact
citations underneath it:

```json
{
  "source": {
    "title": "Introducing GPT-5",
    "channelName": "OpenAI",
    "videoUrl": "https://www.youtube.com/watch?v=0Uu_VJeVVfo"
  },
  "citations": [
    {
      "label": "Introducing GPT-5 [00:35]",
      "text": "...caption evidence...",
      "sourceUrl": "https://www.youtube.com/watch?v=0Uu_VJeVVfo&t=35s"
    }
  ]
}
```

Keep the timestamp URL with every excerpt so readers can verify the evidence
in context.
