/* Sentra-X camera heart-rate engine.
   Pure signal processing, no page access, so it can be tested in Node and used by script.js (window.SXHR).
   Input: camera frames as parallel arrays of time (ms) and the average red, green and blue of the frame.
   Output: a live "good / bad signal" verdict while measuring, and one accurate beats-per-minute value at the end.

   How accuracy is reached (a camera pulse is a weak, noisy signal, so each step matters):
   1. Samples are re-timed onto an exact 30 Hz grid, so uneven camera frame timing cannot bend the rate.
   2. A zero-lag band-pass filter keeps only 0.55 to 3.4 Hz (33 to 204 bpm) and removes drift and flicker.
   3. The red AND green channel are both tried; the one with the cleaner pulse is used (red can saturate in very bright light).
   4. A zero-padded FFT finds the pulse frequency; a harmonic check stops the "second bump" of the pulse wave being read as double speed.
   5. The signal is re-filtered tightly around that frequency, individual beats are located to a fraction of a frame,
      and the rate is the average time between the first and last accepted beat (not "beats in 20 seconds", which is only exact to 3 bpm).
   6. The FFT estimate and the beat-by-beat estimate must agree, otherwise no number is shown. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SXHR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FS = 30;                 // analysis sample rate (Hz)
  var LO = 0.55, HI = 3.4;     // pulse band (Hz): 33 to 204 bpm
  var MIN_FPS = 7;            // slower cameras cannot resolve a pulse

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function sd(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length ? Math.sqrt(s / a.length) : 0; }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; }

  // Put unevenly timed camera frames onto an even grid.
  function resample(ts, vs, fs) {
    var t = [], v = [];
    for (var i = 0; i < ts.length; i++) if (i === 0 || ts[i] > t[t.length - 1]) { t.push(ts[i]); v.push(vs[i]); }
    if (t.length < 2) return { x: [], t0: 0, fs: fs };
    var t0 = t[0], n = Math.floor((t[t.length - 1] - t0) / 1000 * fs) + 1, x = new Array(n), j = 0;
    for (var k = 0; k < n; k++) {
      var tk = t0 + k * 1000 / fs;
      while (j < t.length - 2 && t[j + 1] < tk) j++;
      var f = (tk - t[j]) / (t[j + 1] - t[j]);
      x[k] = v[j] + (v[j + 1] - v[j]) * Math.min(1, Math.max(0, f));
    }
    return { x: x, t0: t0, fs: fs };
  }

  function biquad(type, f0, fs, Q) {
    var w = 2 * Math.PI * f0 / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    var a0 = 1 + al;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0 };
  }
  function run(x, c) {
    var y = new Array(x.length), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < x.length; i++) {
      var yi = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = yi; y[i] = yi;
    }
    return y;
  }
  // Forward + backward pass = no time shift; mirrored edges keep the ends clean.
  function filtfilt(x, c, fs) {
    var n = x.length, P = Math.min(n - 1, Math.round(fs * 3)), e = [], i;
    for (i = P; i >= 1; i--) e.push(2 * x[0] - x[i]);
    for (i = 0; i < n; i++) e.push(x[i]);
    for (i = 1; i <= P; i++) e.push(2 * x[n - 1] - x[n - 1 - i]);
    var y = run(e, c); y.reverse(); y = run(y, c); y.reverse();
    return y.slice(P, P + n);
  }
  function bandpass(x, fs, lo, hi) {
    if (x.length < 10) return x.slice();
    return filtfilt(filtfilt(x, biquad('hp', lo, fs, 0.7071), fs), biquad('lp', Math.min(hi, fs / 2 - 0.5), fs, 0.7071), fs);
  }

  var fft = (function () {
    return function (re, im) {
      var n = re.length, i, j, bit, t;
      for (i = 1, j = 0; i < n; i++) {
        bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (var len = 2; len <= n; len <<= 1) {
        var h = len >> 1, step = -2 * Math.PI / len;
        for (i = 0; i < n; i += len) {
          for (j = 0; j < h; j++) {
            var wr = Math.cos(step * j), wi = Math.sin(step * j), a = i + j, b = a + h;
            var vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
          }
        }
      }
    };
  })();

  function powerSpectrum(x, fs, resHz) {
    var n = x.length, m = mean(x), N = 1;
    while (N < fs / resHz || N < n * 2) N <<= 1;
    var re = new Array(N), im = new Array(N), i;
    for (i = 0; i < N; i++) { re[i] = 0; im[i] = 0; }
    for (i = 0; i < n; i++) re[i] = (x[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    fft(re, im);
    var p = new Array(N / 2 + 1);
    for (i = 0; i <= N / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
    return { p: p, df: fs / N };
  }
  function bandPower(sp, lo, hi) {
    var a = Math.max(0, Math.floor(lo / sp.df)), b = Math.min(sp.p.length - 1, Math.ceil(hi / sp.df)), s = 0;
    for (var k = a; k <= b; k++) s += sp.p[k];
    return s;
  }
  function peakIn(sp, lo, hi) {
    var a = Math.max(1, Math.floor(lo / sp.df)), b = Math.min(sp.p.length - 2, Math.ceil(hi / sp.df)), best = a;
    for (var k = a; k <= b; k++) if (sp.p[k] > sp.p[best]) best = k;
    var l = sp.p[best - 1], c = sp.p[best], r = sp.p[best + 1], den = l - 2 * c + r, d = den !== 0 ? 0.5 * (l - r) / den : 0;
    if (!isFinite(d) || Math.abs(d) > 1) d = 0;
    return { f: (best + d) * sp.df, power: c };
  }
  // Pulse frequency with a harmonic check: a strong component at half the frequency means we found the second harmonic.
  function pulseFreq(sp, T) {
    var hw = Math.max(0.1, 1.6 / T), pk = peakIn(sp, LO, HI);
    var fl = pk.f / 2;
    if (fl >= LO) {
      var lo = peakIn(sp, Math.max(LO, fl - hw), fl + hw);
      if (lo.power > 0.35 * pk.power) return lo.f;
    }
    return pk.f;
  }
  function spectralSnr(sp, f0, T) {
    var hw = Math.max(0.1, 1.6 / T), s = bandPower(sp, f0 - hw, f0 + hw);
    if (2 * f0 + hw < 4.2) s += bandPower(sp, 2 * f0 - hw, 2 * f0 + hw);
    var tot = bandPower(sp, 0.6, 4.2);
    return tot > 0 ? Math.min(1, s / tot) : 0;
  }

  // Everything we need to know about one colour channel over a stretch of frames.
  function channelInfo(ts, vs, resHz) {
    var rs = resample(ts, vs, FS), x = rs.x;
    if (x.length < FS * 3) return null;
    var T = x.length / FS, dc = mean(x), filt = bandpass(x, FS, LO, HI);
    var sp = powerSpectrum(filt, FS, resHz), f0 = pulseFreq(sp, T);
    var raw = powerSpectrum(x, FS, 0.05), inBand = bandPower(raw, LO, HI), low = bandPower(raw, 0.15, 0.55);
    // how much the pulse peak stands above the typical level of the band (a real pulse towers over it, noise does not)
    var a = Math.floor(LO / sp.df), z = Math.ceil(HI / sp.df), bins = sp.p.slice(a, z + 1), med = median(bins), pk = sp.p[Math.round(f0 / sp.df)] || 0;
    // does the pulse strength stay similar through the window? (shaking and re-pressing make it jump)
    var seg = Math.floor(filt.length / 3), amps = [];
    for (var s = 0; s < 3; s++) amps.push(sd(filt.slice(s * seg, (s + 1) * seg)));
    var am = mean(amps);
    return { dc: dc, x: x, t0: rs.t0, filt: filt, f0: f0, snr: spectralSnr(sp, f0, T), pi: dc > 0 ? sd(filt) / dc : 0, lowRatio: inBand > 0 ? low / inBand : 99, pkRatio: med > 0 ? pk / med : 0, ampCv: am > 0 ? sd(amps) / am : 9, T: T };
  }

  // Is a fingertip over the lens? Phones render a fingertip very differently (lighting, colour correction),
  // so the colour test is deliberately forgiving. u is how uneven the picture is (0 = perfectly even). A fingertip is
  // an even, blurry red picture; a room scene is uneven. A clearly red frame passes on colour alone; a mildly red
  // one (washed-out phones) must also be even. Without u (frames that were already accepted) the colour test is enough.
  var isCovered = function (r, g, b, u) {
    if (!(r > 18)) return false;                                   // black: lens covered but no light, or no camera light at all
    if (r > g * 1.2 && r > b * 1.2) return true;                   // clearly red
    if (r > g * 1.05 && r > b * 1.05) return u === undefined || u < 0.08;
    return false;
  };
  // Only frames after the fingertip was last placed count (placing the finger is a big jump, not a pulse).
  // Real cameras hiccup: a single frame, or a few, can look "uncovered" while the exposure adjusts. Those must NOT restart the
  // measurement, so only a gap of GLITCH_MS or more counts as the finger having been lifted; shorter ones are dropped from the signal.
  var GLITCH_MS = 700;
  function trimToCovered(buf) {
    var n = buf.t.length, i = n - 1, cut = -1;
    while (i >= 0) {
      if (isCovered(buf.r[i], buf.g[i], buf.b[i])) { i--; continue; }
      var j = i; while (j > 0 && !isCovered(buf.r[j - 1], buf.g[j - 1], buf.b[j - 1])) j--;
      if (buf.t[i] - buf.t[j] >= GLITCH_MS) { cut = i; break; }
      i = j - 1;
    }
    var out = { t: [], r: [], g: [], b: [] };
    for (var k = cut + 1; k < n; k++) {
      if (!isCovered(buf.r[k], buf.g[k], buf.b[k])) continue;      // drop the glitch frames
      out.t.push(buf.t[k]); out.r.push(buf.r[k]); out.g.push(buf.g[k]); out.b.push(buf.b[k]);
    }
    return out;
  }

  function fpsOf(ts) { return ts.length > 1 ? (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000) : 0; }

  /* LIVE verdict on the most recent frames. Returns { good, checking, reason, text, hint, snr }.
     reason: nofinger | bright | camera | checking | motion | weak | good */
  function assessLive(buf, opts) {
    opts = opts || {};
    var full = buf, n = buf.t.length, winMs = opts.windowMs || 8000;
    var q = Math.max(0, n - 5); if (n && !isCovered(mean(buf.r.slice(q)), mean(buf.g.slice(q)), mean(buf.b.slice(q)))) return { good: false, checking: false, reason: 'nofinger', text: 'Bad signal', hint: 'Cover the camera lens fully with your fingertip, in a bright room', snr: 0 };
    buf = trimToCovered(buf); n = buf.t.length;
    var skip = 0; while (skip < n && buf.t[skip] - buf.t[0] < 1000) skip++;   // camera exposure is still settling
    if (skip < n) { buf = { t: buf.t.slice(skip), r: buf.r.slice(skip), g: buf.g.slice(skip), b: buf.b.slice(skip) }; n = buf.t.length; } else n = 0;
    if (n < 6) return { good: false, checking: true, reason: 'checking', text: 'Checking signal', hint: 'Place your fingertip lightly over the camera lens', snr: 0 };
    var tEnd = buf.t[n - 1], i0 = n - 1;
    while (i0 > 0 && tEnd - buf.t[i0 - 1] <= winMs) i0--;
    var ts = buf.t.slice(i0), r = buf.r.slice(i0), g = buf.g.slice(i0), b = buf.b.slice(i0);
    var k = Math.max(0, r.length - 10), mr = mean(r.slice(k)), mg = mean(g.slice(k)), mb = mean(b.slice(k));
    var covered = isCovered(mr, mg, mb);
    if (!covered) return { good: false, checking: false, reason: 'nofinger', text: 'Bad signal', hint: 'Cover the camera lens fully with your fingertip, in a bright room', snr: 0 };
    var spanS = (ts[ts.length - 1] - ts[0]) / 1000;
    if (spanS < 4) return { good: false, checking: true, reason: 'checking', text: 'Checking signal', hint: 'Hold still', snr: 0 };
    if (fpsOf(ts) < MIN_FPS) return { good: false, checking: false, reason: 'camera', text: 'Bad signal', hint: 'Camera is running too slowly. Move to a brighter place', snr: 0 };
    var cands = [], rI = mean(r) < 250 && mean(r) > 8 ? channelInfo(ts, r, 0.02) : null, gI = mean(g) > 10 && mean(g) < 250 ? channelInfo(ts, g, 0.02) : null;
    if (rI) cands.push(rI); if (gI) cands.push(gI);
    if (!cands.length) return { good: false, checking: false, reason: 'bright', text: 'Bad signal', hint: 'Too bright. Press a little lighter, or move away from direct light', snr: 0 };
    cands.sort(function (a, c) { return c.snr - a.snr; });
    var ch = cands[0];
    if (ch.lowRatio > 14) return { good: false, checking: false, reason: 'motion', text: 'Bad signal', hint: 'Too much movement. Rest your hand and keep still', snr: ch.snr };
    if (ch.pi > 0.06 || ch.ampCv > 0.6) return { good: false, checking: false, reason: 'motion', text: 'Bad signal', hint: 'Too much movement. Rest your hand and keep still', snr: ch.snr };
    if (ch.pi < 0.0007 || ch.snr < 0.5 || ch.pkRatio < 15) return { good: false, checking: false, reason: 'weak', text: 'Bad signal', hint: 'Pulse is faint. Press lightly and keep your fingertip flat on the lens', snr: ch.snr };
    return { good: true, checking: false, reason: 'good', text: 'Good signal', hint: 'Hold still', snr: ch.snr };
  }

  /* FINAL reading from one uninterrupted good-signal run.
     Returns { ok, bpm (decimal), peaks (ms), beats, snr, channel, method } or { ok:false, reason }.
     reason: short | camera | weak | unsteady */
  function analyze(buf, opts) {
    opts = opts || {};
    buf = trimToCovered(buf);
    var settleMs = opts.settleMs == null ? 1500 : opts.settleMs, n = buf.t.length;
    if (n < 40) return { ok: false, reason: 'short' };
    var t0 = buf.t[0], i0 = 0;
    while (i0 < n && buf.t[i0] - t0 < settleMs) i0++;
    var ts = buf.t.slice(i0), spanS = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 1000 : 0;
    if (spanS < (opts.minSeconds || 12)) return { ok: false, reason: 'short' };
    if (fpsOf(ts) < MIN_FPS) return { ok: false, reason: 'camera' };

    var infos = [];
    ['r', 'g'].forEach(function (c) {
      var v = buf[c].slice(i0), m = mean(v);
      if (m < (c === 'r' ? 8 : 10) || m > 250) return;
      var inf = channelInfo(ts, v, 0.002);
      if (inf) { inf.name = c; infos.push(inf); }
    });
    if (!infos.length) return { ok: false, reason: 'weak' };
    infos.sort(function (a, b) { return b.snr - a.snr; });
    var ch = infos[0], f0 = ch.f0;
    if (ch.pi > 0.06) return { ok: false, reason: 'unsteady', snr: ch.snr };
    if (ch.snr < 0.45 || ch.pi < 0.0006 || ch.pkRatio < 10) return { ok: false, reason: 'weak', snr: ch.snr };
    // the two halves of the run must show the same pulse rate (a hand that moved or a finger that slipped changes it)
    var half = Math.floor(ch.filt.length / 2), fa = pulseFreq(powerSpectrum(ch.filt.slice(0, half), FS, 0.005), half / FS), fb = pulseFreq(powerSpectrum(ch.filt.slice(half), FS, 0.005), (ch.filt.length - half) / FS);
    if (Math.abs(fa - fb) * 60 > 3.5) return { ok: false, reason: 'unsteady', snr: ch.snr };

    // Tight band around the pulse frequency removes the second bump of the pulse wave, leaving one clean peak per beat.
    var tight = bandpass(ch.x, FS, Math.max(0.5, f0 * 0.62), Math.min(HI + 0.5, f0 * 1.55)), x = tight;
    var minDist = Math.max(2, Math.floor(0.62 * FS / f0)), cand = [], i;
    for (i = 1; i < x.length - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0) cand.push(i);
    var amps = cand.map(function (k) { return x[k]; }), ma = median(amps);
    cand = cand.filter(function (k) { return x[k] >= 0.3 * ma; });
    var order = cand.slice().sort(function (a, b) { return x[b] - x[a]; }), taken = [];
    order.forEach(function (k) { for (var j = 0; j < taken.length; j++) if (Math.abs(taken[j] - k) < minDist) return; taken.push(k); });
    taken.sort(function (a, b) { return a - b; });
    var pk = taken.map(function (k) {      // beat time = top of a parabola fitted through 5 points around the peak
      if (k < 2 || k > x.length - 3) return k / FS;
      var s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
      for (var d = -2; d <= 2; d++) { var y = x[k + d]; s0++; s2 += d * d; s4 += d * d * d * d; y0 += y; y1 += d * y; y2 += d * d * y; }
      // y ~ a + b d + c d^2 (symmetric sample points, so odd sums vanish)
      var b = y1 / s2, den = s0 * s4 - s2 * s2, c = (s0 * y2 - s2 * y0) / den, off = c < 0 ? -b / (2 * c) : 0;
      if (!isFinite(off) || Math.abs(off) > 1.5) off = 0;
      return (k + off) / FS;      // seconds from the start of the window
    });
    if (pk.length < 8) return { ok: false, reason: 'weak', snr: ch.snr };

    // Number the beats (a skipped beat leaves a gap of about 2 intervals), then drop beats that sit off the line.
    var ibi = []; for (i = 1; i < pk.length; i++) ibi.push(pk[i] - pk[i - 1]);
    var m = median(ibi), idx = [0];
    for (i = 1; i < pk.length; i++) idx.push(idx[i - 1] + Math.max(1, Math.round(ibi[i - 1] / m)));
    var keep = pk.map(function () { return true; });
    for (var pass = 0; pass < 3; pass++) {
      var xs = [], ys = [];
      for (i = 0; i < pk.length; i++) if (keep[i]) { xs.push(idx[i]); ys.push(pk[i]); }
      if (xs.length < 6) break;
      var mx = mean(xs), my = mean(ys), sxx = 0, sxy = 0;
      for (i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
      var slope = sxy / sxx, icpt = my - slope * mx, changed = false;
      for (i = 0; i < pk.length; i++) { var bad = Math.abs(pk[i] - (icpt + slope * idx[i])) > 0.3 * m; if (keep[i] && bad) { keep[i] = false; changed = true; } }
      if (!changed) break;
    }
    var kept = []; for (i = 0; i < pk.length; i++) if (keep[i]) kept.push(i);
    if (kept.length < 8 || kept.length < 0.75 * pk.length) return { ok: false, reason: 'unsteady', snr: ch.snr };
    var a = kept[0], z = kept[kept.length - 1], beats = idx[z] - idx[a], dur = pk[z] - pk[a];
    if (beats < 7 || dur < 8) return { ok: false, reason: 'unsteady', snr: ch.snr };
    var lx = [], ly = []; for (i = 0; i < kept.length; i++) { lx.push(idx[kept[i]]); ly.push(pk[kept[i]]); }
    var lmx = mean(lx), lmy = mean(ly), lxx = 0, lxy = 0; for (i = 0; i < lx.length; i++) { lxx += (lx[i] - lmx) * (lx[i] - lmx); lxy += (lx[i] - lmx) * (ly[i] - lmy); }
    var bpmTime = 0.5 * (60 * beats / dur) + 0.5 * (60 * lxx / lxy), bpmSpec = 60 * f0, diff = Math.abs(bpmTime - bpmSpec), bpm, method;
    if (diff <= 3) { bpm = bpmTime; method = 'beats'; }
    else if (diff <= 6 && ch.snr >= 0.6) { bpm = bpmSpec; method = 'spectrum'; }
    else return { ok: false, reason: 'unsteady', snr: ch.snr };
    if (bpm < 40 || bpm > 200) return { ok: false, reason: 'weak', snr: ch.snr };
    var t0s = (ch.t0 - buf.t[0]) / 1000;
    return { ok: true, bpm: bpm, peaks: kept.map(function (j) { return Math.round((t0s + pk[j]) * 1000); }), beats: beats, snr: ch.snr, channel: ch.name, method: method, seconds: dur };
  }

  return { analyze: analyze, assessLive: assessLive, isCovered: isCovered, _x: { resample: resample, bandpass: bandpass, powerSpectrum: powerSpectrum, channelInfo: channelInfo, FS: FS } };
});
