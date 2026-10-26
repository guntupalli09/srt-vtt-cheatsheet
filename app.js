/* SRT/VTT cheat sheet: reading-speed calculator and local cue checker.
   Everything runs in the browser. No network requests are made. */
(function (root) {
  "use strict";

  // Guideline figures, quoted from the sources linked on the page.
  var GUIDES = {
    netflixAdultCps: 20,    // Netflix English (USA) Timed Text Style Guide, I.14 / II.17
    netflixChildCps: 17,    // same section, children's programs
    netflixLineChars: 42,   // same guide, I.2 / II.3
    bbcWpmLow: 160,         // BBC Subtitle Guidelines, section 4 Timing
    bbcWpmHigh: 180,
    dcmpLowerWpm: 130,      // DCMP Captioning Key, Presentation Rate (educational media)
    dcmpMiddleWpm: 140,
    dcmpUpperWpm: 160
  };

  /** Remove markup tags such as <i>, <b>, <v Name>, {\an8} and decode a few entities. */
  function stripTags(text) {
    return String(text)
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ").replace(/&lrm;|&rlm;/g, "")
      .replace(/&amp;/g, "&");
  }

  /** Characters counted for reading speed: visible text including spaces and
      punctuation, tags removed, line breaks not counted. */
  function countChars(text) {
    var lines = stripTags(text).split(/\r\n|\r|\n/).map(function (l) { return l.trim(); });
    return Array.from(lines.join("")).length;
  }

  function countWords(text) {
    var t = stripTags(text).trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length;
  }

  /** Reading speed for one block of text shown for `seconds`. */
  function readingSpeed(text, seconds) {
    var chars = countChars(text), words = countWords(text);
    return speedFromCounts(chars, words, seconds);
  }

  function speedFromCounts(chars, words, seconds) {
    var s = Number(seconds);
    if (!isFinite(s) || s <= 0) return { error: "Duration must be greater than 0 seconds." };
    var cps = chars / s;
    var wpm = words == null ? null : (words / s) * 60;
    return { chars: chars, words: words, seconds: s, cps: cps, wpm: wpm, verdict: verdict(cps, wpm) };
  }

  /** Plain-language verdict against the published figures. */
  function verdict(cps, wpm) {
    var out = [];
    if (cps > GUIDES.netflixAdultCps) out.push({ level: "over", text: "Above " + GUIDES.netflixAdultCps + " characters per second, the Netflix limit for adult programs." });
    else if (cps > GUIDES.netflixChildCps) out.push({ level: "warn", text: "Within the Netflix adult limit (" + GUIDES.netflixAdultCps + " cps) but above its children's limit (" + GUIDES.netflixChildCps + " cps)." });
    else out.push({ level: "ok", text: "Within both Netflix limits (" + GUIDES.netflixChildCps + " cps children, " + GUIDES.netflixAdultCps + " cps adult)." });
    if (wpm != null) {
      if (wpm > GUIDES.bbcWpmHigh) out.push({ level: "over", text: "Above the BBC recommended range of " + GUIDES.bbcWpmLow + "-" + GUIDES.bbcWpmHigh + " words per minute." });
      else if (wpm >= GUIDES.bbcWpmLow) out.push({ level: "ok", text: "Inside the BBC recommended range of " + GUIDES.bbcWpmLow + "-" + GUIDES.bbcWpmHigh + " words per minute." });
      else out.push({ level: "ok", text: "Below the BBC range of " + GUIDES.bbcWpmLow + "-" + GUIDES.bbcWpmHigh + " wpm, so not too fast by that measure." });
      if (wpm > GUIDES.dcmpUpperWpm) out.push({ level: "warn", text: "Above all three DCMP educational maximums (" + GUIDES.dcmpLowerWpm + " / " + GUIDES.dcmpMiddleWpm + " / " + GUIDES.dcmpUpperWpm + " wpm)." });
      else if (wpm > GUIDES.dcmpMiddleWpm) out.push({ level: "warn", text: "Within the DCMP upper-level maximum (" + GUIDES.dcmpUpperWpm + " wpm), above its lower and middle-level maximums." });
      else if (wpm > GUIDES.dcmpLowerWpm) out.push({ level: "warn", text: "Within the DCMP middle-level maximum (" + GUIDES.dcmpMiddleWpm + " wpm), above its lower-level maximum (" + GUIDES.dcmpLowerWpm + ")." });
      else out.push({ level: "ok", text: "Within all three DCMP educational maximums." });
    }
    return out;
  }

  // ---------- Timestamp parsing ----------
  // Accepts HH:MM:SS,mmm  HH:MM:SS.mmm  and MM:SS.mmm (VTT, hours optional).
  var TS = /^(?:(\d{1,}):)?(\d{2}):(\d{2})([.,])(\d{1,3})$/;

  function parseTimestamp(str) {
    var m = TS.exec(String(str).trim());
    if (!m) return null;
    var h = m[1] ? parseInt(m[1], 10) : 0, mi = parseInt(m[2], 10), s = parseInt(m[3], 10);
    if (mi > 59 || s > 59) return null;
    var frac = m[5];
    return {
      seconds: h * 3600 + mi * 60 + s + parseInt(frac, 10) / Math.pow(10, frac.length),
      separator: m[4], hasHours: !!m[1], fracDigits: frac.length
    };
  }

  function formatTime(sec) {
    var ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000); ms -= h * 3600000;
    var m = Math.floor(ms / 60000); ms -= m * 60000;
    var s = Math.floor(ms / 1000); ms -= s * 1000;
    function p(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
    return p(h, 2) + ":" + p(m, 2) + ":" + p(s, 2) + "." + p(ms, 3);
  }

  var TIMING_LINE = /^\s*(\S+)\s+-->\s+(\S+)(.*)$/;

  /**
   * Parse SRT or WebVTT text into cues plus a list of issues.
   * opts: { maxCps, maxLineChars }
   */
  function parseSubtitles(input, opts) {
    opts = opts || {};
    var maxCps = opts.maxCps || GUIDES.netflixAdultCps;
    var maxLine = opts.maxLineChars || GUIDES.netflixLineChars;
    var issues = [];
    var text = String(input == null ? "" : input);
    var hasBom = text.charCodeAt(0) === 0xFEFF;
    if (hasBom) text = text.slice(1);
    if (text.indexOf("\uFFFD") !== -1) issues.push({ cue: null, type: "encoding", severity: "error", msg: "The text contains replacement characters (\uFFFD). The file was probably not decoded as UTF-8; re-save it as UTF-8." });
    var lines = text.split(/\r\n|\r|\n/);
    var format = /^WEBVTT(?:[ \t].*)?$/.test(lines[0] || "") ? "vtt" : "srt";
    if (format === "srt" && /^\s*WEBVTT/i.test(lines[0] || "")) {
      issues.push({ cue: null, type: "header", severity: "error", msg: "The first line starts with WEBVTT but is not a valid header. It must be exactly \"WEBVTT\", optionally followed by a space or tab and more text." });
      format = "vtt"; lines[0] = "WEBVTT";
    }
    if (hasBom) issues.push({ cue: null, type: "bom", severity: format === "vtt" ? "info" : "warn",
      msg: format === "vtt" ? "File starts with a byte order mark (BOM). WebVTT allows this." : "File starts with a byte order mark (BOM). Some SRT players show it as stray characters before the first cue number; saving as UTF-8 without BOM is the safer choice." });

    // Split into blocks on blank lines.
    var blocks = [], cur = [], startLine = 0;
    var i0 = format === "vtt" ? 1 : 0;
    if (format === "vtt") {
      // Header may continue until first blank line.
      while (i0 < lines.length && lines[i0].trim() !== "") i0++;
    }
    for (var i = i0; i < lines.length; i++) {
      if (lines[i].trim() === "") { if (cur.length) { blocks.push({ lines: cur, line: startLine + 1 }); cur = []; } }
      else { if (!cur.length) startLine = i; cur.push(lines[i]); }
    }
    if (cur.length) blocks.push({ lines: cur, line: startLine + 1 });

    var cues = [], seenCue = false;
    blocks.forEach(function (b) {
      var L = b.lines;
      if (format === "vtt") {
        if (/^NOTE(?:[ \t]|$)/.test(L[0])) return;
        if (/^(STYLE|REGION)[ \t]*$/.test(L[0])) {
          if (seenCue) issues.push({ cue: null, type: "block-order", severity: "error", msg: "Line " + b.line + ": " + L[0].trim() + " blocks must come before the first cue." });
          return;
        }
      }
      // Find the timing line (first or second line).
      var t = -1;
      for (var k = 0; k < Math.min(L.length, 2); k++) if (TIMING_LINE.test(L[k])) { t = k; break; }
      if (t === -1) {
        issues.push({ cue: null, type: "malformed", severity: "error", msg: "Line " + b.line + ": block has no timing line (start --> end). Check for a missing blank line or a broken timestamp." });
        return;
      }
      var id = t === 1 ? L[0].trim() : "";
      var m = TIMING_LINE.exec(L[t]);
      var st = parseTimestamp(m[1]), en = parseTimestamp(m[2]);
      var settings = m[3].trim();
      var payload = L.slice(t + 1);
      var cue = { index: cues.length + 1, id: id, line: b.line, startRaw: m[1], endRaw: m[2], settings: settings, lines: payload, text: payload.join("\n") };
      var label = "Cue " + (id || cue.index) + " (line " + b.line + ")";

      if (!st || !en) {
        issues.push({ cue: cue.index, type: "timestamp", severity: "error", msg: label + ": unreadable timestamp \"" + (!st ? m[1] : m[2]) + "\". Expected " + (format === "srt" ? "HH:MM:SS,mmm" : "HH:MM:SS.mmm or MM:SS.mmm") + "." });
        return;
      }
      [st, en].forEach(function (ts, n) {
        var raw = n ? m[2] : m[1];
        if (format === "srt" && ts.separator === ".") issues.push({ cue: cue.index, type: "separator", severity: "warn", msg: label + ": \"" + raw + "\" uses a period. SRT convention is a comma before the milliseconds (00:00:01,000)." });
        if (format === "vtt" && ts.separator === ",") issues.push({ cue: cue.index, type: "separator", severity: "error", msg: label + ": \"" + raw + "\" uses a comma. WebVTT requires a period before the milliseconds (00:00:01.000)." });
        if (ts.fracDigits !== 3) issues.push({ cue: cue.index, type: "timestamp", severity: format === "vtt" ? "error" : "warn", msg: label + ": \"" + raw + "\" should have exactly three digits for milliseconds." });
        if (format === "srt" && !ts.hasHours) issues.push({ cue: cue.index, type: "timestamp", severity: "warn", msg: label + ": \"" + raw + "\" has no hours. SRT timestamps are normally written HH:MM:SS,mmm." });
      });
      if (format === "srt" && settings) issues.push({ cue: cue.index, type: "settings", severity: "info", msg: label + ": text after the end time (\"" + settings + "\"). Some SRT players ignore it; cue settings are a WebVTT feature." });
      if (format === "srt" && t === 0) issues.push({ cue: cue.index, type: "numbering", severity: "warn", msg: label + ": missing cue number above the timing line." });
      if (format === "srt" && t === 1 && !/^\d+$/.test(id)) issues.push({ cue: cue.index, type: "numbering", severity: "warn", msg: label + ": cue number \"" + id + "\" is not a whole number." });

      cue.start = st.seconds; cue.end = en.seconds; cue.duration = en.seconds - st.seconds;
      if (cue.duration <= 0) issues.push({ cue: cue.index, type: "duration", severity: "error", msg: label + ": end time is not after the start time." });

      // Timing line inside the payload = missing blank line between cues.
      var merged = payload.some(function (pl) { return TIMING_LINE.test(pl); });
      if (merged) issues.push({ cue: cue.index, type: "missing-blank-line", severity: "error", msg: label + ": a timing line appears inside the cue text. A blank line is probably missing between two cues. Speed and line checks are skipped for this cue until it is fixed." });
      var visible = stripTags(cue.text).trim();
      if (!visible) issues.push({ cue: cue.index, type: "empty", severity: "warn", msg: label + ": cue has no visible text." });

      if (visible && cue.duration > 0 && !merged) {
        cue.chars = countChars(cue.text); cue.words = countWords(cue.text);
        cue.cps = cue.chars / cue.duration; cue.wpm = cue.words / cue.duration * 60;
        if (cue.cps > maxCps) issues.push({ cue: cue.index, type: "reading-speed", severity: "warn", msg: label + ": " + cue.cps.toFixed(1) + " characters per second (limit set to " + maxCps + ")." });
      }
      if (!merged) stripTags(cue.text).split("\n").forEach(function (ln, n) {
        var len = Array.from(ln.trim()).length;
        if (len > maxLine) issues.push({ cue: cue.index, type: "line-length", severity: "warn", msg: label + ": line " + (n + 1) + " has " + len + " characters (limit set to " + maxLine + ")." });
      });
      if (payload.length > 2 && !merged) issues.push({ cue: cue.index, type: "line-count", severity: "info", msg: label + ": " + payload.length + " lines of text. Many guidelines ask for at most two." });
      cues.push(cue); seenCue = true;
    });

    // Cross-cue checks.
    var srtNums = [];
    for (var c = 0; c < cues.length; c++) {
      var a = cues[c];
      if (format === "srt" && /^\d+$/.test(a.id)) srtNums.push(parseInt(a.id, 10));
      if (c === 0 || a.start == null) continue;
      var prev = cues[c - 1];
      if (prev.start == null) continue;
      if (a.start < prev.start) issues.push({ cue: a.index, type: "order", severity: format === "vtt" ? "error" : "warn", msg: "Cue " + (a.id || a.index) + " starts before the cue above it. Cues should be listed in start-time order." });
      else if (a.start < prev.end) issues.push({ cue: a.index, type: "overlap", severity: format === "vtt" ? "info" : "warn",
        msg: "Cue " + (a.id || a.index) + " starts at " + formatTime(a.start) + ", before the previous cue ends at " + formatTime(prev.end) + "." + (format === "vtt" ? " WebVTT allows overlapping cues, but check it is intended." : " Many players show both at once or drop one.") });
    }
    for (var n = 1; n < srtNums.length; n++) {
      if (srtNums[n] !== srtNums[n - 1] + 1) { issues.push({ cue: null, type: "numbering", severity: "info", msg: "Cue numbers are not sequential (" + srtNums[n - 1] + " is followed by " + srtNums[n] + ")." }); break; }
    }
    if (format === "vtt") {
      var ids = {};
      cues.forEach(function (q) { if (q.id) { if (ids[q.id]) issues.push({ cue: q.index, type: "id", severity: "error", msg: "Cue identifier \"" + q.id + "\" is used more than once. WebVTT identifiers must be unique." }); ids[q.id] = true; } });
    }
    if (!cues.length) issues.push({ cue: null, type: "no-cues", severity: "error", msg: "No cues were found." });
    return { format: format, cues: cues, issues: issues, bom: hasBom };
  }

  var api = { GUIDES: GUIDES, stripTags: stripTags, countChars: countChars, countWords: countWords, readingSpeed: readingSpeed, speedFromCounts: speedFromCounts, verdict: verdict, parseTimestamp: parseTimestamp, formatTime: formatTime, parseSubtitles: parseSubtitles };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SubCheck = api;

  // ---------- DOM wiring (browser only) ----------
  if (typeof document === "undefined") return;

  function el(id) { return document.getElementById(id); }
  function renderVerdict(container, res) {
    container.textContent = "";
    if (res.error) { var p = document.createElement("p"); p.className = "msg over"; p.textContent = res.error; container.appendChild(p); return; }
    var dl = document.createElement("p"); dl.className = "result-figures";
    dl.textContent = res.chars + " characters" + (res.words != null ? ", " + res.words + " words" : "") + " in " + res.seconds + " s = " +
      res.cps.toFixed(1) + " characters per second" + (res.wpm != null ? ", " + Math.round(res.wpm) + " words per minute" : "") + ".";
    container.appendChild(dl);
    var ul = document.createElement("ul"); ul.className = "verdicts";
    res.verdict.forEach(function (v) { var li = document.createElement("li"); li.className = "msg " + v.level; li.textContent = v.text; ul.appendChild(li); });
    container.appendChild(ul);
  }

  function init() {
    var form = el("calc-form");
    if (form) {
      var mode = function () { return form.querySelector("input[name=calc-mode]:checked").value; };
      var sync = function () {
        var m = mode();
        el("text-fields").hidden = m !== "text";
        el("count-fields").hidden = m !== "count";
      };
      Array.prototype.forEach.call(form.querySelectorAll("input[name=calc-mode]"), function (r) { r.addEventListener("change", sync); });
      sync();
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var res;
        if (mode() === "text") res = readingSpeed(el("calc-text").value, parseFloat(el("calc-seconds").value));
        else {
          var ch = parseInt(el("calc-chars").value, 10), wd = el("calc-words").value === "" ? null : parseInt(el("calc-words").value, 10);
          res = isNaN(ch) || ch < 0 ? { error: "Enter a character count of 0 or more." } : speedFromCounts(ch, wd, parseFloat(el("calc-seconds2").value));
        }
        renderVerdict(el("calc-result"), res);
      });
    }
    var cf = el("check-form");
    if (cf) {
      el("check-file").addEventListener("change", function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () { el("check-input").value = r.result; };
        r.readAsText(f); // read locally; nothing is uploaded
      });
      cf.addEventListener("submit", function (e) {
        e.preventDefault();
        var res = parseSubtitles(el("check-input").value, { maxCps: parseFloat(el("check-cps").value) || 20, maxLineChars: parseInt(el("check-line").value, 10) || 42 });
        var out = el("check-result"); out.textContent = "";
        var sum = document.createElement("p");
        var errs = res.issues.filter(function (x) { return x.severity === "error"; }).length;
        var warns = res.issues.filter(function (x) { return x.severity === "warn"; }).length;
        sum.textContent = "Read as " + (res.format === "vtt" ? "WebVTT" : "SRT") + ": " + res.cues.length + " cues, " + errs + " errors, " + warns + " warnings, " + (res.issues.length - errs - warns) + " notes.";
        out.appendChild(sum);
        if (res.issues.length) {
          var ul = document.createElement("ul"); ul.className = "issues";
          res.issues.forEach(function (x) { var li = document.createElement("li"); li.className = "msg " + (x.severity === "error" ? "over" : x.severity === "warn" ? "warn" : "info"); li.textContent = (x.severity === "error" ? "Error: " : x.severity === "warn" ? "Warning: " : "Note: ") + x.msg; ul.appendChild(li); });
          out.appendChild(ul);
        }
        out.focus();
      });
      el("check-sample").addEventListener("click", function () {
        el("check-input").value = "1\n00:00:01,000 --> 00:00:03.500\nThis cue uses a period, which SRT players may reject.\n\n2\n00:00:03,000 --> 00:00:04,000\nThis one overlaps the cue before it and is far too fast to read.\n3\n00:00:04,500 --> 00:00:06,000\nA missing blank line merged this cue into the previous one.\n\n4\n00:00:07,000 --> 00:00:08,000\n\n";
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
