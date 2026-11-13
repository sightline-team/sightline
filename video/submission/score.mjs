/**
 * Original score + sound design for the Sightline submission film, synthesized from
 * scratch in Node (no new dependency) and written as a 48 kHz stereo WAV bed.
 *
 * Both picture and sound read `build/timeline.json`, so a cue cannot drift from the frame
 * it belongs to. The score is a warm 100 BPM pulse: bare at the letter, tense at the
 * trade-off, lifting when the enclave appears, breathing under the results, then resolving
 * on the wordmark.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'timeline.json'), 'utf8'));
const SR = 48000;
const DUR = TL.duration;
const N = Math.ceil(DUR * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const M = TL.marks;
const BEAT = 0.6; // 100 BPM
const BAR = BEAT * 4;

let seed = 20261114;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function add(i, v, pan) {
  if (i < 0 || i >= N) return;
  const p = pan ?? 0;
  const lg = Math.sqrt((1 - p) * 0.5 + 0.5);
  const rg = Math.sqrt((1 + p) * 0.5 + 0.5);
  L[i] += v * lg;
  R[i] += v * rg;
}

/** 1 ms of smoothing on every envelope edge keeps the whole bed click-free. */
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function tone(t0, dur, freq, amp, { harmonics = [1], decay = 0.0, attack = 0.004, pan = 0, detune = 0 } = {}) {
  const i0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const aN = Math.max(1, Math.floor(attack * SR));
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const f = freq * (h + 1) * (1 + detune * (h % 2 === 0 ? 1 : -1));
      s += harmonics[h] * Math.sin(2 * Math.PI * f * t);
    }
    const att = ease(k / aN);
    const dec = decay > 0 ? Math.exp(-t / decay) : 1;
    const rel = ease((len - k) / Math.min(len, SR * 0.04));
    add(i0 + k, s * amp * att * dec * rel, pan);
  }
}

function pad(t0, dur, notes, amp) {
  for (const n of notes) {
    tone(t0, dur, midi(n), amp, { harmonics: [1, 0.28, 0.12, 0.05], attack: 0.55, pan: -0.25 });
    tone(t0, dur, midi(n), amp * 0.8, { harmonics: [1, 0.22, 0.09], attack: 0.7, pan: 0.3, detune: 0.0016 });
  }
}

function sub(t0, dur, note, amp) {
  tone(t0, dur, midi(note), amp, { harmonics: [1], attack: 0.01, decay: 0 });
}

function kick(t0, amp = 0.9) {
  const i0 = Math.floor(t0 * SR);
  const len = Math.floor(0.42 * SR);
  let phase = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const f = 46 + 110 * Math.exp(-t / 0.045);
    phase += (2 * Math.PI * f) / SR;
    const e = Math.exp(-t / 0.16) * (1 - Math.exp(-t / 0.002));
    add(i0 + k, Math.sin(phase) * e * amp, 0);
  }
}

function hat(t0, amp = 0.2, pan = 0.2) {
  const i0 = Math.floor(t0 * SR);
  const len = Math.floor(0.07 * SR);
  let prev = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const n = rnd() * 2 - 1;
    const hp = n - prev; // one-pole difference = gentle high-pass
    prev = n;
    add(i0 + k, hp * Math.exp(-t / 0.018) * amp, pan);
  }
}

function tick(t0, amp = 0.22, f = 2100) {
  tone(t0, 0.09, f, amp, { harmonics: [1, 0.4], decay: 0.022, attack: 0.001, pan: 0.15 });
  tone(t0, 0.05, f * 2.02, amp * 0.25, { harmonics: [1], decay: 0.012, attack: 0.001, pan: -0.1 });
}

function pluck(t0, note, amp = 0.18, pan = 0) {
  tone(t0, 0.5, midi(note), amp, { harmonics: [1, 0.45, 0.22, 0.1], decay: 0.16, attack: 0.003, pan });
}

function bell(t0, note, amp = 0.12, pan = 0) {
  tone(t0, 1.6, midi(note), amp, { harmonics: [1, 0.3, 0.12], decay: 0.55, attack: 0.002, pan });
  tone(t0, 1.2, midi(note + 12), amp * 0.28, { harmonics: [1], decay: 0.35, attack: 0.002, pan: -pan });
}

function noise(t0, dur, amp, { decay = 0.2, lowpass = 0, pan = 0, rise = 0 } = {}) {
  const i0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let lp = 0;
  const k = lowpass > 0 ? Math.exp(-2 * Math.PI * lowpass / SR) : 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const w = rnd() * 2 - 1;
    const v = lowpass > 0 ? (lp = w * (1 - k) + lp * k) : w;
    const e = rise > 0 ? Math.pow(ease(t / dur), rise) * (1 - ease((dur - t) / 0.05)) : Math.exp(-t / decay) * (1 - ease((dur - t) / 0.02));
    add(i0 + n, v * e * amp, pan);
  }
}

function thud(t0, amp = 0.5) {
  kick(t0, amp);
  noise(t0, 0.12, amp * 0.35, { lowpass: 500, decay: 0.05 });
}

function stamp(t0) {
  thud(t0, 0.55);
  tone(t0, 0.5, 118, 0.25, { harmonics: [1, 0.5, 0.3], decay: 0.12, attack: 0.001 });
  noise(t0, 0.06, 0.3, { decay: 0.015, pan: 0.1 });
}

function whoosh(t0, dur, amp, down = false) {
  const i0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  for (let n = 0; n < len; n++) {
    const x = n / len;
    const e = down ? ease(1 - x) * (1 - x) : ease(x) * Math.sin(Math.PI * x);
    const w = rnd() * 2 - 1;
    add(i0 + n, w * e * amp * (0.4 + 0.6 * Math.sin(Math.PI * x)), down ? 0.1 : -0.1);
  }
}

function riser(t0, dur, amp) {
  const i0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const f0 = 220;
  for (let n = 0; n < len; n++) {
    const x = n / len;
    const f = f0 * Math.pow(6, x);
    const e = Math.pow(x, 2.4);
    add(i0 + n, Math.sin(2 * Math.PI * f * (n / SR)) * e * amp * 0.5, Math.sin(x * 6) * 0.3);
    add(i0 + n, (rnd() * 2 - 1) * e * amp * 0.5, Math.cos(x * 5) * 0.3);
  }
}

// ---------------------------------------------------------------- harmony
const CH = {
  Am9: [45, 48, 52, 55, 59],
  Fmaj9: [41, 45, 48, 52, 55],
  Cadd9: [48, 52, 55, 62],
  G6: [43, 47, 50, 55],
  Em7: [40, 47, 50, 55],
};
const ROOT_OF = { Am9: 45, Fmaj9: 41, Cadd9: 48, G6: 43, Em7: 40 };

function bedChords(t0, t1, chords, amp, subAmp) {
  let t = t0;
  let i = 0;
  while (t < t1 - 0.01) {
    const d = Math.min(BAR, t1 - t);
    const name = chords[i % chords.length];
    pad(t, d + 0.4, CH[name], amp);
    sub(t, d, ROOT_OF[name] - 12, subAmp);
    t += d;
    i++;
  }
}

function pulseRun(t0, t1, note, amp, division = 2, pan = 0) {
  for (let t = t0, i = 0; t < t1 - 0.01; t += BEAT / division, i++) {
    pluck(t, note + (i % 8 === 7 ? 12 : 0), amp * (i % 2 === 0 ? 1 : 0.7), pan);
  }
}

function arpRun(t0, t1, notes, amp) {
  let i = 0;
  for (let t = t0; t < t1 - 0.01; t += BEAT / 4, i++) {
    const n = notes[i % notes.length] + (i % 8 === 6 ? 12 : 0);
    tone(t, 0.22, midi(n + 12), amp, { harmonics: [1, 0.3], decay: 0.07, attack: 0.002, pan: Math.sin(i * 0.7) * 0.45 });
  }
}

// ---------------------------------------------------------------- arrangement
const S = TL.sceneStarts;

// 1 — the letter: bare, airy, a little uneasy
sub(0, 10.9, 33, 0.16); // A1
tone(0, 10.9, midi(45), 0.03, { harmonics: [1, 0.5, 0.25], attack: 1.4 });
noise(0, 11, 0.012, { lowpass: 800, rise: 0.6 });
bell(1.9, 69, 0.05, -0.2);
bell(6.2, 72, 0.04, 0.25);
noise(M.letterOn, 0.55, 0.1, { rise: 1.6, pan: -0.2 }); // paper

// 2 — the trade-off: pulse arrives, the two redactions land as low hits
pulseRun(11.0, 24.5, 45, 0.1, 2, -0.15);
thud(M.redact1, 0.42);
thud(M.redact2, 0.42);
pad(M.statLine - 0.3, 3.6, CH.Em7, 0.035);
sub(M.statLine, 3.2, 28, 0.2);
bell(M.statLine + 0.02, 64, 0.06, 0);

// 3 — the enclave: the drop, 4/4, warm
const d0 = S[2]; // 24.6
bedChords(d0, S[4], ['Cadd9', 'G6', 'Am9', 'Fmaj9'], 0.042, 0.15);
for (let t = d0; t < S[4] - 0.01; t += BEAT) kick(t, 0.55);
for (let t = d0 + BEAT / 2; t < S[4] - 0.01; t += BEAT) hat(t, 0.07, 0.3);
arpRun(d0 + BAR, S[4], [60, 64, 67, 71], 0.032);
whoosh(M.shutter, 0.35, 0.16);
noise(M.shutter, 0.05, 0.25, { decay: 0.012 }); // shutter click
stamp(M.seal);
bell(M.seal + 0.02, 76, 0.09, 0.15);

// 4 — proof before sending: kick out, ticks in, airy tension
for (let t = S[3]; t < S[5] - 0.01; t += BEAT / 2) hat(t, 0.035, t % 1 < 0.5 ? -0.3 : 0.3);
bedChords(S[3], S[4], ['Fmaj9', 'G6'], 0.036, 0.12);
noise(M.scanIn, 2.6, 0.05, { rise: 1.4, lowpass: 3000, pan: 0.2 });
M.checks.forEach((t, i) => tick(t, 0.14 + (i === 11 ? 0.08 : 0), 1700 + i * 90));
tone(M.zeroBytes, 1.4, midi(84), 0.09, { harmonics: [1, 0.4], decay: 0.4, attack: 0.002 });
bell(M.zeroBytes, 81, 0.07, -0.1);

// 5 — results: the pulse comes back under the reading
bedChords(S[4], S[5], ['Cadd9', 'Am9', 'Fmaj9', 'G6'], 0.04, 0.14);
for (let t = S[4] + 0.3; t < S[5] - 0.01; t += BEAT) kick(t, 0.42);
for (let t = S[4] + 0.3; t < S[5] - 0.01; t += BEAT / 2) hat(t, 0.055, t % 1 < 0.5 ? 0.25 : -0.25);
arpRun(S[4] + BAR, S[5], [64, 67, 72, 74], 0.026);
for (let i = 0; i < 4; i++) pluck(M.resultsIn + i * 0.78, [72, 74, 76, 79][i], 0.09, -0.2 + i * 0.13);

// 6 — every fact traced: sparser, room for the question
bedChords(S[5], S[6], ['Fmaj9', 'Cadd9'], 0.036, 0.12);
for (let t = S[5]; t < S[6] - 0.01; t += BEAT / 2) hat(t, 0.03, 0.2);
bell(M.quoteReveal, 76, 0.1, -0.15);
for (let i = 0; i < 8; i++) tick(M.askType + i * 0.17, 0.05, 1500 + i * 60);
bell(M.answer1, 79, 0.1, 0.2);
thud(M.answer2, 0.3);
tone(M.answer2, 0.9, midi(50), 0.06, { harmonics: [1, 0.3], decay: 0.3, attack: 0.01 });

// 7 — the receipt: build
bedChords(S[6], S[7], ['Am9', 'Fmaj9', 'Cadd9', 'G6'], 0.04, 0.14);
for (let t = S[6] + 0.3; t < S[7] - 0.01; t += BEAT) kick(t, 0.45);
for (let t = S[6] + BEAT / 2; t < S[7] - 0.01; t += BEAT) noise(t, 0.09, 0.06, { decay: 0.03, lowpass: 6000, pan: -0.2 });
arpRun(S[6] + BAR, S[7], [60, 64, 67, 72, 74, 72, 67, 64], 0.03);
riser(S[7] - 3.0, 3.0, 0.09);
whoosh(M.signature, 0.28, 0.12);
tone(M.signature, 0.5, midi(88), 0.06, { harmonics: [1, 0.5], decay: 0.14 });

// 8 — forget, then the wordmark resolves
whoosh(M.forget, 1.3, 0.22, true);
noise(M.forget, 1.5, 0.05, { lowpass: 900, rise: 0.4 });
pad(M.forget, S[7] + 9.6 - M.forget, CH.Cadd9, 0.045);
sub(M.forget, 6.0, 24, 0.16);
stamp(M.wordmark);
pad(M.wordmark, DUR - M.wordmark + 0.2, CH.Cadd9, 0.05);
sub(M.wordmark, DUR - M.wordmark, 36, 0.2);
bell(M.wordmark, 72, 0.12, 0);
bell(M.wordmark + 0.04, 76, 0.1, 0.2);
bell(M.wordmark + 0.08, 79, 0.09, -0.2);
for (let i = 0; i < 6; i++) bell(M.wordmark + 1.2 + i * 0.55, [84, 79, 76, 72, 76, 79][i], 0.045, Math.sin(i) * 0.5);

// ---------------------------------------------------------------- master
// Gentle bus compression via soft clipping, then an even fade at the tail.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const pre = 0.72 / (peak || 1);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, (DUR - t) / 2.2) * Math.min(1, t / 0.12);
  L[i] = Math.tanh(L[i] * pre * 1.25) * 0.9 * fade;
  R[i] = Math.tanh(R[i] * pre * 1.25) * 0.9 * fade;
}

const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0);
out.writeUInt32LE(36 + N * 4, 4);
out.write('WAVE', 8);
out.write('fmt ', 12);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write('data', 36);
out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
}
fs.writeFileSync(path.join(ROOT, 'build', 'bed.wav'), out);
console.log(`bed.wav  ${DUR.toFixed(2)}s  ${(out.length / 1048576).toFixed(1)} MiB  pre-gain ${pre.toFixed(3)}`);
