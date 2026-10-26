// Dependency-free tests for app.js logic. Run: node test/run.js
"use strict";
const assert = require("assert");
const S = require("../app.js");
let passed = 0;
function t(name, fn) { try { fn(); passed++; console.log("ok  " + name); } catch (e) { console.error("FAIL " + name + "\n  " + e.message); process.exitCode = 1; } }
const types = r => r.issues.map(i => i.type);
const has = (r, type, sev) => r.issues.some(i => i.type === type && (!sev || i.severity === sev));

t("timestamp: SRT comma", () => { const p = S.parseTimestamp("01:02:03,450"); assert.strictEqual(p.seconds, 3723.45); assert.strictEqual(p.separator, ","); });
t("timestamp: VTT without hours", () => { const p = S.parseTimestamp("02:03.004"); assert.strictEqual(+p.seconds.toFixed(3), 123.004); assert.strictEqual(p.hasHours, false); });
t("timestamp: rejects minutes > 59", () => assert.strictEqual(S.parseTimestamp("00:61:00.000"), null));
t("timestamp: rejects garbage", () => assert.strictEqual(S.parseTimestamp("1:2:3"), null));
t("timestamp: hours > 99 allowed", () => assert.strictEqual(S.parseTimestamp("100:00:00.000").seconds, 360000));

t("count: tags stripped, line break not counted", () => assert.strictEqual(S.countChars("<i>Hi</i> there\n<b>you</b>"), 11));
t("count: SSA override stripped", () => assert.strictEqual(S.countChars("{\\an8}Top"), 3));
t("count: emoji counted as one char", () => assert.strictEqual(S.countChars("ok 👍"), 4));
t("words: punctuation-only tokens ignored", () => assert.strictEqual(S.countWords("Wait - what?"), 2));
t("words: empty", () => assert.strictEqual(S.countWords("  "), 0));

t("speed: 40 chars / 2 s = 20 cps, at adult limit", () => { const r = S.speedFromCounts(40, null, 2); assert.strictEqual(r.cps, 20); assert.strictEqual(r.verdict[0].level, "warn"); assert.strictEqual(r.wpm, null); });
t("speed: 41 chars / 2 s over adult limit", () => assert.strictEqual(S.speedFromCounts(41, null, 2).verdict[0].level, "over"));
t("speed: 34 chars / 2 s within both", () => assert.strictEqual(S.speedFromCounts(34, null, 2).verdict[0].level, "ok"));
t("speed: zero duration is an error", () => assert.ok(S.readingSpeed("hi", 0).error));
t("speed: negative / NaN duration is an error", () => { assert.ok(S.readingSpeed("hi", -1).error); assert.ok(S.readingSpeed("hi", NaN).error); });
t("speed: wpm verdicts cross BBC and DCMP bands", () => {
  const v = S.speedFromCounts(10, 6, 2).verdict; // 180 wpm
  assert.ok(/Inside the BBC/.test(v[1].text)); assert.ok(/Above all three DCMP/.test(v[2].text));
  const v2 = S.speedFromCounts(10, 5, 2).verdict; // 150 wpm
  assert.ok(/Below the BBC/.test(v2[1].text)); assert.ok(/upper-level/.test(v2[2].text));
});

const goodSrt = "1\n00:00:01,000 --> 00:00:03,200\nWelcome back to the workshop.\n\n2\n00:00:03,600 --> 00:00:06,400\n<i>Today we look at timing.</i>\n";
t("SRT: clean file has no issues", () => { const r = S.parseSubtitles(goodSrt); assert.strictEqual(r.format, "srt"); assert.strictEqual(r.cues.length, 2); assert.deepStrictEqual(r.issues, []); });
t("SRT: CRLF line endings", () => { const r = S.parseSubtitles(goodSrt.replace(/\n/g, "\r\n")); assert.strictEqual(r.cues.length, 2); assert.deepStrictEqual(r.issues, []); });
t("SRT: CR-only line endings", () => assert.strictEqual(S.parseSubtitles(goodSrt.replace(/\n/g, "\r")).cues.length, 2));
t("SRT: period separator warned", () => assert.ok(has(S.parseSubtitles(goodSrt.replace("00:00:03,200", "00:00:03.200")), "separator", "warn")));
t("SRT: BOM warned", () => { const r = S.parseSubtitles("\uFEFF" + goodSrt); assert.ok(r.bom); assert.ok(has(r, "bom", "warn")); assert.strictEqual(r.cues.length, 2); });
t("SRT: missing blank line detected", () => { const r = S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\nOne\n2\n00:00:02,500 --> 00:00:03,000\nTwo\n"); assert.ok(has(r, "missing-blank-line", "error")); });
t("SRT: overlap warned", () => { const r = S.parseSubtitles("1\n00:00:01,000 --> 00:00:03,000\nA\n\n2\n00:00:02,000 --> 00:00:04,000\nB\n"); assert.ok(has(r, "overlap", "warn")); });
t("SRT: touching cues are not an overlap", () => { const r = S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:02,000 --> 00:00:03,000\nB\n"); assert.ok(!has(r, "overlap")); });
t("SRT: out-of-order cue", () => assert.ok(has(S.parseSubtitles("1\n00:00:05,000 --> 00:00:06,000\nA\n\n2\n00:00:01,000 --> 00:00:02,000\nB\n"), "order")));
t("SRT: empty cue warned", () => assert.ok(has(S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n"), "malformed") || has(S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\n<i></i>\n"), "empty")));
t("SRT: tag-only cue counts as empty", () => assert.ok(has(S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\n<i></i>\n"), "empty", "warn")));
t("SRT: end before start is an error", () => assert.ok(has(S.parseSubtitles("1\n00:00:03,000 --> 00:00:02,000\nA\n"), "duration", "error")));
t("SRT: zero-length cue is an error", () => assert.ok(has(S.parseSubtitles("1\n00:00:03,000 --> 00:00:03,000\nA\n"), "duration", "error")));
t("SRT: unreadable timestamp", () => assert.ok(has(S.parseSubtitles("1\n00:00:3,000 --> 00:00:04,000\nA\n"), "timestamp", "error")));
t("SRT: two-digit milliseconds warned", () => assert.ok(has(S.parseSubtitles("1\n00:00:01,50 --> 00:00:04,000\nA\n"), "timestamp", "warn")));
t("SRT: non-sequential numbers noted", () => assert.ok(has(S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\nA\n\n3\n00:00:03,000 --> 00:00:04,000\nB\n"), "numbering", "info")));
t("SRT: missing cue number warned", () => assert.ok(has(S.parseSubtitles("00:00:01,000 --> 00:00:02,000\nA\n"), "numbering", "warn")));
t("SRT: reading speed over limit", () => { const r = S.parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\nThis line is far too long to read in one second.\n"); assert.ok(has(r, "reading-speed")); assert.ok(r.cues[0].cps > 20); });
t("SRT: custom cps limit respected", () => { const txt = "1\n00:00:01,000 --> 00:00:03,000\nEighteen chars per second, ok?\n"; /* 30 chars/2s = 15 */ assert.ok(!has(S.parseSubtitles(txt), "reading-speed")); assert.ok(has(S.parseSubtitles(txt, { maxCps: 12 }), "reading-speed")); });
t("SRT: long line flagged at 43 chars, not 42", () => {
  const l42 = "x".repeat(42), l43 = "x".repeat(43);
  assert.ok(!has(S.parseSubtitles("1\n00:00:00,000 --> 00:00:10,000\n" + l42 + "\n"), "line-length"));
  assert.ok(has(S.parseSubtitles("1\n00:00:00,000 --> 00:00:10,000\n" + l43 + "\n"), "line-length"));
});
t("SRT: three lines noted", () => assert.ok(has(S.parseSubtitles("1\n00:00:00,000 --> 00:00:10,000\na\nb\nc\n"), "line-count")));
t("SRT: mojibake replacement char flagged", () => assert.ok(has(S.parseSubtitles("1\n00:00:00,000 --> 00:00:10,000\nCaf\uFFFD\n"), "encoding", "error")));
t("empty input", () => assert.ok(has(S.parseSubtitles(""), "no-cues", "error")));
t("null input", () => assert.ok(has(S.parseSubtitles(null), "no-cues")));

const goodVtt = "WEBVTT - converted\n\nSTYLE\n::cue { color: yellow }\n\nNOTE This is a comment\nspanning two lines\n\nintro\n00:01.000 --> 00:03.200 line:85% align:center\n<v Host>Welcome back.\n\n00:00:03.600 --> 00:00:06.400\n<c.loud>Today</c> we look at <i>timing</i>.\n";
t("VTT: clean file with header text, STYLE, NOTE, settings, no-hours", () => { const r = S.parseSubtitles(goodVtt); assert.strictEqual(r.format, "vtt"); assert.strictEqual(r.cues.length, 2); assert.deepStrictEqual(r.issues, []); assert.strictEqual(r.cues[0].settings, "line:85% align:center"); assert.strictEqual(r.cues[0].id, "intro"); });
t("VTT: BOM is allowed (info only)", () => { const r = S.parseSubtitles("\uFEFF" + goodVtt); assert.strictEqual(r.format, "vtt"); assert.ok(has(r, "bom", "info")); assert.ok(!r.issues.some(i => i.severity !== "info")); });
t("VTT: comma separator is an error", () => assert.ok(has(S.parseSubtitles("WEBVTT\n\n00:00:01,000 --> 00:00:02.000\nA\n"), "separator", "error")));
t("VTT: bad header WEBVTTFILE", () => assert.ok(has(S.parseSubtitles("WEBVTTFILE\n\n00:00:01.000 --> 00:00:02.000\nA\n"), "header", "error")));
t("VTT: overlap is only a note", () => assert.ok(has(S.parseSubtitles("WEBVTT\n\n00:01.000 --> 00:03.000\nA\n\n00:02.000 --> 00:04.000\nB\n"), "overlap", "info")));
t("VTT: STYLE after a cue is an error", () => assert.ok(has(S.parseSubtitles("WEBVTT\n\n00:01.000 --> 00:02.000\nA\n\nSTYLE\n::cue{}\n"), "block-order", "error")));
t("VTT: duplicate identifiers", () => assert.ok(has(S.parseSubtitles("WEBVTT\n\na\n00:01.000 --> 00:02.000\nA\n\na\n00:03.000 --> 00:04.000\nB\n"), "id", "error")));
t("VTT: header lines after WEBVTT are skipped", () => assert.strictEqual(S.parseSubtitles("WEBVTT\nKind: captions\nLanguage: en\n\n00:01.000 --> 00:02.000\nA\n").cues.length, 1));
t("VTT: entities decoded for counting", () => assert.strictEqual(S.countChars("a &amp; b"), 5));
t("formatTime", () => assert.strictEqual(S.formatTime(3723.45), "01:02:03.450"));

console.log("\n" + passed + " passed" + (process.exitCode ? ", some FAILED" : ", 0 failed"));
