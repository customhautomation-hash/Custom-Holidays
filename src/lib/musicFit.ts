/**
 * musicFit.ts — makes the music fit the reel.
 *  • analyseTrack: finds the beat (tempo + where each beat falls) and the loudness over time
 *  • bestParts:    finds the strongest stretches of the song (chorus / drop) for the reel's length
 *  • bestStart:    the best of those
 *  • fitToBeat:    nudges each clip's length so cuts land on the beat
 *  • gainAt:       the volume at any moment: a short fade in, and a long, smooth fade out that
 *                  finishes exactly when the reel ends (over the end card), so it never stops abruptly
 */
export type TrackInfo = { duration: number; bpm: number; beat: number; beats: number[]; loud: Float32Array; hop: number };
export type MusicFit = { start: number; volume: number; fadeIn: number; fadeOut: number; loop: boolean };

/** Reads the beat and loudness of a decoded track. Takes a fraction of a second. */
export function analyseTrack(buf: AudioBuffer): TrackInfo {
  const sr = buf.sampleRate, n = buf.length;
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const hopS = 512, hop = hopS / sr;
  const frames = Math.floor(n / hopS);
  const loud = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0; const o = f * hopS;
    for (let i = 0; i < hopS; i++) { const v = (a[o + i] + b[o + i]) * 0.5; s += v * v; }
    loud[f] = Math.sqrt(s / hopS);
  }
  // Onsets: where loudness jumps up (a simple, reliable stand-in for drum hits)
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, loud[f] - loud[f - 1]);
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
  // Phase: where the beats sit
  let bestOff = 0, offScore = -1;
  for (let off = 0; off < bestLag; off++) {
    let s = 0;
    for (let f = off; f < frames; f += bestLag) s += onset[f];
    if (s > offScore) { offScore = s; bestOff = off; }
  }
  const beat = bestLag * hop;
  const beats: number[] = [];
  for (let tt = bestOff * hop; tt < buf.duration; tt += beat) beats.push(tt);
  return { duration: buf.duration, bpm: Math.round(60 / beat), beat, beats, loud, hop };
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

/**
 * Moves each cut to the nearest beat (every n beats, n chosen from the clip length), keeping the order
 * and roughly the same total. Clips never get shorter than one beat or 1 second.
 */
export function fitToBeat(seconds: number[], info: TrackInfo, start: number): number[] {
  if (!seconds.length || !info.beat) return seconds;
  const avg = seconds.reduce((x, y) => x + y, 0) / seconds.length;
  const every = Math.max(1, Math.round(avg / info.beat));
  const grid = info.beats.filter(b => b >= start - 0.01).map(b => b - start).filter((_, i) => i % every === 0);
  if (grid.length < 2) return seconds;
  const out: number[] = [];
  let at = 0, target = 0;
  for (const s of seconds) {
    target += s;
    let best = grid.find(g => g > at + 0.9) ?? at + s;
    for (const g of grid) if (g > at + 0.9 && Math.abs(g - target) < Math.abs(best - target)) best = g;
    out.push(Math.round((best - at) * 100) / 100);
    at = best;
  }
  return out;
}

/** Volume at reel time t: fade in, then an equal-power fade out that reaches silence exactly at the end. */
export function gainAt(t: number, total: number, fit: MusicFit): number {
  if (t < 0 || t >= total) return 0;
  let g = fit.volume;
  if (t < fit.fadeIn) g *= Math.sin((t / fit.fadeIn) * Math.PI / 2);
  const left = total - t;
  if (left < fit.fadeOut) g *= Math.sin((left / fit.fadeOut) * Math.PI / 2);
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
