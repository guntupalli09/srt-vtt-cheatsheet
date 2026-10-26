# SRT vs VTT cheat sheet and reading speed calculator

A single static page for people who work with subtitle files:

- **SRT vs WebVTT cheat sheet**: header, cue numbering, timestamp format (comma vs period), cue settings, `NOTE` blocks, styling tags, encoding, and the same cues written in both formats.
- **Common mistakes**: wrong timestamp separator, missing blank line between cues, overlapping cues, end time not after start, BOM and encoding problems, empty cues, bad `WEBVTT` header.
- **Reading speed calculator**: paste a cue and its duration (or enter character and word counts) to get characters per second and words per minute, with a plain verdict against published guideline figures.
- **Cue checker**: paste or open an SRT or VTT file and list cues that break the format or go over your speed and line-length limits.
- **Client transcript style checklist**: verbatim level, speaker labels, tags, timestamps and numbers to settle with a client before you start.

## Privacy

The page runs entirely in your browser. Files you open or paste are read by JavaScript on the page and are never uploaded. There are no trackers, analytics, cookies, fonts or other external requests, and a Content Security Policy blocks network access from the page.

## Sources

Figures on the page are quoted from these sources (checked October 2026):

- W3C, [WebVTT: The Web Video Text Tracks Format](https://www.w3.org/TR/webvtt1/): file structure, timestamps, cue settings, comments, styling, overlap, UTF-8.
- Netflix, [English (USA) Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide): 42 characters per line; up to 20 characters per second for adult programs and 17 for children's programs.
- BBC, [Subtitle Guidelines](https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/): 160-180 words per minute.
- DCMP, [Captioning Key: Presentation Rate](https://dcmp.org/learn/captioningkey/601): educational media not to exceed 130 (lower level), 140 (middle) and 160 (upper) words per minute.

SRT has no formal specification; the SRT notes describe common conventions.

## Run locally

No build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

To run the logic tests (needs Node.js 18+):

```sh
node test/run.js
```

## Related tools

If you need to repair a file, [VideoText Fix Subtitles](https://videotext.io/fix-subtitles) fixes overlaps, timing, reading speed and long lines in SRT and VTT files (free downloads include two short watermark cues). For transcripts, [VideoText's style guide formatter](https://videotext.io/guideline-format) applies a client's style rules and flags uncertain edits for review; its presets are VideoText's own editable rule cards, not official guides.

## License

[MIT](LICENSE) © VideoText
