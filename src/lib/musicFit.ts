/**
 * musicFit.ts — makes the music fit the reel.
 *  • analyseTrack: finds the beat (tempo + where each beat falls) and the loudness over time
 *  • bestParts:    finds the strongest stretches of the song (chorus / drop) for the reel's length
 *  • bestStart:    the best of those
 *  • fitToBeat:    nudges each clip's length so cuts land on the beat
 *  • gainAt:       the volume at any moment: a short fade in, and a long, smooth fade out that
 *                  finishes exactly when the reel ends (over the end card), so it never stops abruptly
 */
export type TrackInfo = { duration: number; bpm: number; beat: number; beats: number[]; loud: Float32Array; hop: number; onset?: Float32Array };
/** A piece of the song: `len` seconds starting at `from` (seconds into the song). */
export type Segment = { from: number; len: number };
/**
 * length: if set, the music stops (fading out) this many seconds into the reel, before the reel ends.
 * segments: if set, the music is these pieces of the song played one after another (repeat a part, or
 * stitch two parts together); they take over from start/loop.
 */
export type MusicFit = { start: number; volume: number; fadeIn: number; fadeOut: number; loop: boolean; length?: number; segments?: Segment[] };

/** Where in the song we are at reel time t. */
export function songAt(t: number, fit: MusicFit, songLen = 1e9): number {
  const segs = fit.segments;
  if (segs?.length) {
    let at = 0;
    for (const sg of segs) { if (t < at + sg.len) return sg.from + (t - at); at += sg.len; }
    const last = segs[segs.length - 1];
    return Math.min(songLen, last.from + last.len + (t - at));
  }
  const len = songLen - fit.start;
  return fit.start + (fit.loop && len > 0 ? t % len : t);
}

/** Reel times where one piece of the song hands over to the next. */
export function segmentEdges(fit: MusicFit): number[] {
  const out: number[] = []; let at = 0;
  for (const sg of (fit.segments || []).slice(0, -1)) { at += sg.len; out.push(at); }
  return out;
}

/** Reads the beat and loudness of a decoded track. Takes a fraction of a second. */
export function analyseTrack(buf: AudioBuffer): TrackInfo {
  const sr = buf.sampleRate, n = buf.length;
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const hopS = 512, hop = hopS / sr;
  const frames = Math.floor(n / hopS);
  const loud = new Float32Array(frames), bass = new Float32Array(frames);
  const k = 1 - Math.exp(-2 * Math.PI * 150 / sr);       // a simple low-pass at ~150 Hz: the kick drum and bass
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let s = 0, sb = 0; const o = f * hopS;
    for (let i = 0; i < hopS; i++) { const v = (a[o + i] + b[o + i]) * 0.5; s += v * v; lp += k * (v - lp); sb += lp * lp; }
    loud[f] = Math.sqrt(s / hopS); bass[f] = Math.sqrt(sb / hopS);
  }
  // Onsets: where the sound jumps up, counting the bass (kick drum) extra: these are the hits you feel
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, loud[f] - loud[f - 1]) + 1.6 * Math.max(0, bass[f] - bass[f - 1]);
  // Tempo by autocorrelation between 70 and 170 BPM, gently preferring 90–130
  const minLag = Math.round(60 / 170 / hop), maxLag = Math.round(60 / 70 / hop);
  let bestLag = Math.round(60 / 110 / hop), bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    const bpm = 60 / (lag * hop);
    const pref = 1 - Math.min(0.25, Math.abs(bpm - 110) / 400);
    if (s * pref > bestScore) { bestScore = s * pref; bestLag = lag; }
  }
  // Exact tempo and phase: try tempos a little either side of the rough one (in fine steps) and every
  // starting point, and keep the beat grid that lands on the most hits across the whole song
  const hit = (f: number) => { const i = Math.round(f); return Math.max(onset[i] || 0, 0.7 * (onset[i - 1] || 0), 0.7 * (onset[i + 1] || 0)); };
  let bestP = bestLag, bestOff = 0, gridScore = -1;
  for (let P = bestLag - 1.2; P <= bestLag + 1.2; P += 0.04) {
    for (let off = 0; off < P; off += 0.5) {
      let sc = 0;
      for (let f = off; f < frames; f += P) sc += hit(f);
      if (sc > gridScore) { gridScore = sc; bestP = P; bestOff = off; }
    }
  }
  const beat = bestP * hop;
  // Each beat is nudged onto the actual hit nearby (within 60 ms), so cuts land exactly on the drum
  // even when the tempo drifts a little
  let peak = 0; for (let f = 0; f < frames; f++) if (onset[f] > peak) peak = onset[f];
  // Follow the beat through the song: each next beat is looked for one beat-length after the last one
  // found, and the tempo is updated gently, so a slightly-off tempo or a drifting song stays locked
  const beats: number[] = [];
  let period = beat;
  let tt = bestOff * hop;
  while (tt < buf.duration) {
    const win = Math.max(1, Math.round((period * 0.18) / hop));
    const c = Math.round(tt / hop); let bf = c, bv = -1;
    for (let f = Math.max(0, c - win); f <= Math.min(frames - 1, c + win); f++) {
      const w = 1 - 0.5 * Math.abs(f - c) / win;           // prefer hits near where the beat was expected
      if (onset[f] * w > bv) { bv = onset[f] * w; bf = f; }
    }
    const found = bv > peak * 0.12 ? bf * hop : tt;
    if (beats.length && bv > peak * 0.12) {
      const gap = found - beats[beats.length - 1];
      if (gap > beat * 0.7 && gap < beat * 1.3) period = period * 0.85 + gap * 0.15;
    }
    beats.push(found);
    tt = found + period;
  }
  return { duration: buf.duration, bpm: Math.round(60 / beat), beat, beats, loud, hop, onset };
}

/**
 * The best parts of a song for a reel of this length, best first (up to `count`, spread apart).
 * A part scores well when:
 *  • it is full and loud for the whole reel (the chorus or "drop", not the quiet intro or a breakdown)
 *  • it doesn't dip into a quiet patch halfway through
 *  • it starts on a beat right where the song lifts (a new section kicking in feels like a proper start)
 */
export function bestParts(info: TrackInfo, reelSeconds: number, count = 3): number[] {
  const L = Math.min(Math.max(5, reelSeconds), info.duration);
  const n = info.loud.length, hop = info.hop;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + info.loud[i];
  const mean = (t: number, len: number) => {
    const s = Math.max(0, Math.floor(t / hop)), e = Math.min(n, Math.floor((t + len) / hop));
    return e > s ? (pre[e] - pre[s]) / (e - s) : 0;
  };
  const overall = mean(0, info.duration) || 1e-6;
  const latest = Math.max(0, info.duration - L);
  const starts = (info.beats.length ? info.beats : [0]).filter(b => b <= latest + 0.01);
  if (!starts.length) return [0];
  const scored = starts.map(b => {
    const energy = mean(b, L) / overall;                               // how full this stretch is
    let dip = Infinity;                                               // its quietest 3 seconds
    for (let t = b; t + 3 <= b + L; t += 1.5) dip = Math.min(dip, mean(t, 3) / overall);
    if (!isFinite(dip)) dip = energy;
    const lift = Math.min(2, Math.max(0.5, mean(b, 2) / (mean(b - 3, 3) || 1e-6)));  // a section kicking in
    return { at: Math.round(b * 100) / 100, score: energy + 0.5 * Math.min(dip, 1.2) + 0.3 * Math.log2(lift) };
  }).sort((x, y) => y.score - x.score);
  const gap = Math.max(6, L * 0.5);
  const out: number[] = [];
  for (const c of scored) {
    if (out.every(o => Math.abs(o - c.at) >= gap)) out.push(c.at);
    if (out.length >= count) break;
  }
  return out;
}

/** Where to start the music: the best part of the song for this reel. */
export function bestStart(info: TrackInfo, reelSeconds: number): number {
  return bestParts(info, reelSeconds, 1)[0] ?? 0;
}

export type BeatMode = "auto" | "beat" | "two" | "bar";

/**
 * Moves every cut onto a beat of the music, keeping the order and roughly the same total.
 *  auto: each cut goes to the beat nearest its planned time, preferring the strong ones (the first beat of a
 *        bar, where the music "lands"); short clips cut on single beats, so fast reels flick on every hit
 *  beat / two / bar: cut only on every beat, every 2nd beat, or every bar (4 beats)
 * A clip is never shorter than most of one beat.
 */
export function fitToBeat(seconds: number[], info: TrackInfo, start: number, mode: BeatMode = "auto"): number[] {
  if (!seconds.length || !info.beat) return seconds;
  const beats = info.beats.filter(b => b >= start - 0.01).map(b => b - start);
  if (beats.length < 4) return seconds;
  // how hard each beat hits
  const str = beats.map(b => {
    if (!info.onset) return 1;
    const f = Math.round((b + start) / info.hop); let m = 0;
    for (let i = Math.max(0, f - 2); i <= Math.min(info.onset.length - 1, f + 2); i++) m = Math.max(m, info.onset[i]);
    return m;
  });
  const top = Math.max(...str) || 1;
  // which beat of each 4 is the bar's first (the one that hits hardest on average)
  let phase = 0, bestSum = -1;
  for (let p = 0; p < 4; p++) { let sum = 0; for (let i = p; i < beats.length; i += 4) sum += str[i]; if (sum > bestSum) { bestSum = sum; phase = p; } }
  const step = mode === "two" ? 2 : mode === "bar" ? 4 : 1;
  const minLen = Math.max(0.3, info.beat * 0.85);
  const out: number[] = [];
  let at = 0, target = 0;
  for (const s of seconds) {
    target += s;
    let best = -1, bestCost = Infinity;
    for (let j = 0; j < beats.length; j++) {
      const g = beats[j];
      if (g <= at + minLen - 0.001) continue;
      if (best >= 0 && g > target + 4 * info.beat + 2) break;
      if (step > 1 && ((j - phase) % step + step) % step !== 0) continue;
      let cost = Math.abs(g - target);
      if (mode === "auto") {
        const bar = ((j - phase) % 4 + 4) % 4 === 0, half = ((j - phase) % 2 + 2) % 2 === 0;
        // prefer the bar's first beat and strong hits, but only if it's about as close as a plain beat
        cost -= (bar ? 0.35 : half ? 0.15 : 0) * info.beat * Math.max(0, Math.min(1, (s / info.beat - 1.5) / 2)) + 0.1 * info.beat * (str[j] / top);   // short clips just take the nearest beat
      }
      if (cost < bestCost) { bestCost = cost; best = g; }
    }
    if (best < 0) best = at + s;
    out.push(Math.round((best - at) * 1000) / 1000);
    at = best;
  }
  return out;
}

/** Volume at reel time t: fade in, then an equal-power fade out that reaches silence exactly at the end. */
export function gainAt(t: number, total: number, fit: MusicFit): number {
  if (fit.length && fit.length > 1) total = Math.min(total, fit.length);
  if (t < 0 || t >= total) return 0;
  let g = fit.volume;
  if (t < fit.fadeIn) g *= Math.sin((t / fit.fadeIn) * Math.PI / 2);
  const left = total - t;
  const fo = Math.min(fit.fadeOut, total * 0.4);
  if (left < fo) g *= Math.sin((left / fo) * Math.PI / 2);
  // a tiny dip where two pieces of the song meet, so the join is smooth instead of a click
  for (const e of segmentEdges(fit)) { const d = Math.abs(t - e); if (d < 0.06) g *= d / 0.06; }
  return g;
}

/** Applies gainAt to a Web Audio gain over the whole reel (used when saving). */
export function scheduleGain(param: AudioParam, total: number, fit: MusicFit, at = 0) {
  const steps = Math.max(2, Math.ceil(total * 20));
  const curve = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i++) curve[i] = gainAt((i / steps) * total * 0.9999, total, fit);
  curve[steps] = 0;
  param.setValueAtTime(curve[0], at);
  param.setValueCurveAtTime(curve, at, total);
}
