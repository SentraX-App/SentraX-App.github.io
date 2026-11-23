/* Sentra-X camera heart-rate scanner (v2). Replaces hr-engine.js and the old scanner block that lived in script.js.
   Part 1 (window.SXHR): signal processing and the fingertip test. No page access, so it can be tested in Node.
   Part 2: the scanner itself (camera, flash, live card, result). Same buttons and element ids as before.

   What changed and why:
   - The old finger test accepted any dim, slightly reddish picture (a room or a table with the flash on), so it showed
     "Weak signal", ran the progress bar and tried to find a pulse with nothing on the lens. A fingertip over a lit lens is
     bright AND strongly red (green and blue are absorbed by blood), even and blurry. All four are now required, on every frame.
   - Only frames from one uninterrupted, confirmed finger run are ever analysed. A lifted finger throws the run away.
   - "Good signal" is only shown when a real pulse is visible in the signal. Finger on but no pulse yet is "Finger detected".
   - A number is only shown when repeated analyses of the pulse agree (same rule as before). Never a guess. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SXHR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FS = 30;                 // analysis sample rate (Hz)
  var LO = 0.55, HI = 3.4;     // pulse band (Hz): 33 to 204 bpm
  var MIN_FPS = 7;             // slower cameras cannot resolve a pulse

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

  // Fine pulse-frequency search. The FFT bins are only a starting point: here the Hann-windowed power at f (plus its second
  // harmonic, which a pulse wave always carries) is maximised with a golden-section search, so the rate is no longer limited
  // by the bin spacing or by the length of the window. Always stays close to the FFT peak f0.
  function refineFreq(x, fs, f0, T) {
    var n = x.length, m = mean(x), xs = new Array(n), i;
    if (n < 16) return f0;
    for (i = 0; i < n; i++) xs[i] = (x[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    function pw(f) { var re = 0, im = 0, a = 2 * Math.PI * f / fs; for (var k = 0; k < n; k++) { re += xs[k] * Math.cos(a * k); im += xs[k] * Math.sin(a * k); } return re * re + im * im; }
    function score(f) { return pw(f) + (2 * f < HI ? pw(2 * f) : 0); }
    var d = Math.max(0.05, 0.6 / T), a = Math.max(LO, f0 - d), b = Math.min(HI, f0 + d), g = 0.6180339887;
    var c = b - g * (b - a), e = a + g * (b - a), fc = score(c), fe = score(e);
    for (i = 0; i < 26; i++) {
      if (fc > fe) { b = e; e = c; fe = fc; c = b - g * (b - a); fc = score(c); }
      else { a = c; c = e; fc = fe; e = a + g * (b - a); fe = score(e); }
    }
    var r = 0.5 * (a + b);
    return isFinite(r) ? r : f0;
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
    return { dc: dc, x: x, t0: rs.t0, filt: filt, f0: f0, snr: spectralSnr(sp, f0, T), pi: dc > 0 ? sd(filt) / dc : 0, lowRatio: inBand > 0 ? low / inBand : 99, pkRatio: med > 0 ? pk / med : 0, ampCv: am > 0 ? sd(amps) / am : 9, burst: burstOf(filt), T: T };
  }

  // Largest swing divided by the typical swing of the filtered signal. A steady pulse stays under about 7; a knock, a slip or a re-press
  // makes a spike of 10 or more.
  function burstOf(f) {
    var a = [], mx = 0, i, v;
    for (i = 0; i < f.length; i++) { v = Math.abs(f[i]); a.push(v); if (v > mx) mx = v; }
    var md = median(a); return md > 0 ? mx / md : 99;
  }

  // A very dark channel (the green of a fingertip under the flash is often only 5 to 20 out of 255) is mostly rounding
  // noise, and rounding noise can look like a perfect pulse stuck at the very edge of the band. So a channel only counts
  // when it is bright enough, shows a believable pulse size, and peaks away from the band edges; of those the cleanest wins.
  var MIN_GREEN = 5, MIN_RED = 12;
  // A channel is usable when it is not black and not clipped. Clipping (value stuck at 255) flattens the pulse, so a channel is dropped when
  // more than 15% of its frames are clipped. This replaces the old "average must be under 250" rule, which threw away a fingertip under the flash
  // whenever red sat at 250 to 255, even though green (often only 12 to 40 out of 255) still carried a clean pulse.
  function usable(v, minMean) {
    var m = mean(v), clip = 0;
    if (!(m > minMean) || m > 254.6) return false;
    for (var i = 0; i < v.length; i++) if (v[i] >= 254.5) clip++;
    return clip <= 0.6 * v.length;
  }
  function plausible(ch) { return !!ch && ch.pi >= 0.0004 && ch.f0 > LO + 0.08 && ch.f0 < HI - 0.15; }
  function bestChannel(list) {
    var ok = list.filter(plausible);
    var pool = ok.length ? ok : list;
    pool.sort(function (a, b) { return (b.name === 'r' ? 0.03 : 0) + b.snr - ((a.name === 'r' ? 0.03 : 0) + a.snr); });   // red is the steadier channel on a flash-lit fingertip: it wins close calls
    return pool[0];
  }

  function fpsOf(ts) { return ts.length > 1 ? (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000) : 0; }

  /* FINAL reading from one uninterrupted good-signal run.
     Returns { ok, bpm (decimal), peaks (ms), beats, snr, channel, method } or { ok:false, reason }.
     reason: short | camera | weak | unsteady */
  function analyze(buf, opts) {
    opts = opts || {};
    var settleMs = opts.settleMs == null ? 1500 : opts.settleMs, n = buf.t.length;
    if (n < 40) return { ok: false, reason: 'short' };
    var t0 = buf.t[0], i0 = 0;
    while (i0 < n && buf.t[i0] - t0 < settleMs) i0++;
    if (opts.windowMs) {   // only the most recent windowMs of the run: old movement or exposure settling ages out
      var cutT = buf.t[n - 1] - opts.windowMs;
      while (i0 < n - 1 && buf.t[i0] < cutT) i0++;
    }
    var ts = buf.t.slice(i0), spanS = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 1000 : 0;
    if (spanS < (opts.minSeconds || 8)) return { ok: false, reason: 'short' };
    if (fpsOf(ts) < MIN_FPS) return { ok: false, reason: 'camera' };

    var infos = [];
    ['r', 'g'].forEach(function (c) {
      var v = buf[c].slice(i0);
      if (!usable(v, c === 'r' ? MIN_RED : MIN_GREEN)) return;
      var inf = channelInfo(ts, v, 0.002);
      if (inf) { inf.name = c; infos.push(inf); }
    });
    if (!infos.length) return { ok: false, reason: 'weak' };
    var ch = bestChannel(infos), f0 = ch.f0;
    if (ch.pi > 0.12) return { ok: false, reason: 'unsteady', snr: ch.snr };
    var relaxed = !!opts.relaxed;   // second, stricter-consensus chance for weaker signals (see script.js)
    if (ch.snr < (relaxed ? 0.33 : 0.45) || ch.pi < 0.0004 || ch.pkRatio < (relaxed ? 7 : 10)) return { ok: false, reason: 'weak', snr: ch.snr };
    // the two halves of the run must show the same pulse rate (a hand that moved or a finger that slipped changes it)
    var half = Math.floor(ch.filt.length / 2), fa = pulseFreq(powerSpectrum(ch.filt.slice(0, half), FS, 0.005), half / FS), fb = pulseFreq(powerSpectrum(ch.filt.slice(half), FS, 0.005), (ch.filt.length - half) / FS);
    if (Math.abs(fa - fb) * 60 > (opts.maxHalfDiff || 6)) return { ok: false, reason: 'unsteady', snr: ch.snr };

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
      for (i = 0; i < pk.length; i++) { var bad = Math.abs(pk[i] - (icpt + slope * idx[i])) > 0.4 * m; if (keep[i] && bad) { keep[i] = false; changed = true; } }
      if (!changed) break;
    }
    var kept = []; for (i = 0; i < pk.length; i++) if (keep[i]) kept.push(i);
    if (kept.length < 8 || kept.length < 0.6 * pk.length) return { ok: false, reason: 'unsteady', snr: ch.snr };
    var a = kept[0], z = kept[kept.length - 1], beats = idx[z] - idx[a], dur = pk[z] - pk[a];
    if (beats < 7 || dur < 8) return { ok: false, reason: 'unsteady', snr: ch.snr };
    var lx = [], ly = []; for (i = 0; i < kept.length; i++) { lx.push(idx[kept[i]]); ly.push(pk[kept[i]]); }
    var lmx = mean(lx), lmy = mean(ly), lxx = 0, lxy = 0; for (i = 0; i < lx.length; i++) { lxx += (lx[i] - lmx) * (lx[i] - lmx); lxy += (lx[i] - lmx) * (ly[i] - lmy); }
    // Two independent estimates must agree (loose check, catches a wrong peak or a slipped finger). The number that is shown
    // comes from the fine frequency search over the whole window, which uses every sample instead of only the first and last beat.
    var fRef = refineFreq(ch.filt, FS, f0, ch.T);
    var bpmTime = 0.5 * (60 * beats / dur) + 0.5 * (60 * lxx / lxy), bpmSpec = 60 * fRef, diff = Math.abs(bpmTime - bpmSpec), bpm, method;
    if (diff <= 4) { bpm = bpmSpec; method = 'spectrum+beats'; }
    else if (diff <= 7 && ch.snr >= 0.55) { bpm = bpmSpec; method = 'spectrum'; }
    else return { ok: false, reason: 'unsteady', snr: ch.snr };
    if (bpm < 40 || bpm > 200) return { ok: false, reason: 'weak', snr: ch.snr };
    var t0s = (ch.t0 - buf.t[0]) / 1000;
    // A pulse under 50 bpm is rare, while slow swings from finger pressure or a moving hand sit at 40-45 bpm and look like a very
    // slow pulse. Real recordings showed such a swing accepted as "40 bpm" (signal quality 0.64; genuine slow pulses score about 0.9),
    // so a reading under 50 bpm is only shown when the signal is very clean.
    if (bpm < 50 && ch.snr < 0.8) return { ok: false, reason: 'weak', snr: ch.snr };
    return { ok: true, bpm: bpm, peaks: kept.map(function (j) { return Math.round((t0s + pk[j]) * 1000); }), beats: beats, snr: ch.snr, channel: ch.name, method: method, seconds: dur, bpmBeats: bpmTime };
  }

  /* Decide whether the recent answers of analyze() agree well enough to show a number.
     list: [{bpm, weak, peaks}] oldest first. final=true is the last chance at the end of the scan (a little more tolerance).
     One failed or odd answer no longer throws everything away: the middle value of the agreeing majority is used. */
  function consensus(list, final) {
    var L = list.slice(-6), need = final ? 4 : 4, tol = final ? 3 : 2;
    if (L.length >= 4 && L.filter(function (x) { return x.weak; }).length > L.length / 2) need = 5;   // mostly weak answers: ask for more agreement
    if (L.length < need) return null;
    var m = median(L.map(function (x) { return x.bpm; }));
    var inl = L.filter(function (x) { return Math.abs(x.bpm - m) <= tol; });
    if (inl.length < need || inl.length < 0.66 * L.length) return null;
    var weakN = inl.filter(function (x) { return x.weak; }).length;
    return { bpm: median(inl.map(function (x) { return x.bpm; })), peaks: inl[inl.length - 1].peaks, approx: !!final && weakN > 0 || weakN > inl.length / 2, n: inl.length };
  }

  /* ---------- Fingertip test ----------
     frameStats(rgba) turns one small camera frame into numbers; fingerOn(stats, torchOn) says whether a fingertip covers the lens.
       - bright enough (a dim room is not a finger): red at least 110 with the flash lit, 70 without it
       - strongly red: green under 68% and blue under 55% of red (blood absorbs green and blue; walls, tables and rooms do not)
       - red almost everywhere in the frame (a fingertip fills the whole picture)
       - even and blurry (a finger is out of focus, a room has edges). */
  function frameStats(d) {
    var n = d.length / 4, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, redPx = 0, clip = 0, i, l;
    for (i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      sr += r; sg += g; sb += b;
      l = 0.299 * r + 0.587 * g + 0.114 * b; sl += l; sl2 += l * l;
      if (r >= 30 && g <= 0.88 * r && b <= 0.78 * r) redPx++;
      if (r >= 250) clip++;
    }
    var ml = sl / n, v = sl2 / n - ml * ml;
    return { r: sr / n, g: sg / n, b: sb / n, lumCv: ml > 1 ? Math.sqrt(Math.max(0, v)) / ml : 9, redFrac: redPx / n, clipFrac: clip / n };
  }
  // Two tiers. Strict is used to START a run; relaxed is used to KEEP a run going (a finger that is already confirmed must not be
  // dropped because auto-exposure or auto white balance wobbled for a moment) and to rescue phones where the strict test never
  // fires (pale or thin fingertips that overexpose under the flash, auto white balance that dulls the red, dim rooms with no flash).
  // A wrong "finger" here can never produce a wrong number: analyze() still demands a real, steady pulse before anything is shown.
  function fingerOn(s, torchOn, relaxed) {
    if (!s) return false;
    var minR = torchOn ? (relaxed ? 55 : 70) : (relaxed ? 28 : 35);
    if (s.r < minR) return false;
    // With the flash lit, a pale or thin fingertip overexposes and looks less red, so more green and blue is allowed. Without a confirmed
    // flash, light has to pass through the tissue, which makes a real fingertip deep red, so the limits stay tight (skin-coloured tables fail).
    var gMax = torchOn ? (relaxed ? 0.88 : 0.82) : (relaxed ? 0.68 : 0.62), bMax = torchOn ? (relaxed ? 0.78 : 0.72) : (relaxed ? 0.58 : 0.52);
    if (s.g > gMax * s.r || s.b > bMax * s.r) return false;
    if (s.redFrac < (relaxed ? 0.6 : 0.7)) return false;
    if (s.lumCv > (relaxed ? 0.5 : 0.5)) return false;   // never stricter than the start test
    return true;
  }
  // Lens is covered by something very uniform and dark (a finger in a dim room with no flash): tell the person what to do.
  function lensCoveredDark(s) {
    return !!s && s.r < 28 && s.g < 28 && s.b < 28 && s.lumCv < 0.3;
  }

  function fpsOf(ts) { return ts.length > 1 ? (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000) : 0; }

  /* LIVE verdict. buf only ever holds frames from one confirmed finger run.
     Returns { good, checking, reason, hint }. reason: checking | camera | bright | motion | weak | good */
  function assessLive(buf, opts) {
    opts = opts || {};
    var n = buf.t.length, winMs = opts.windowMs || 10000, skip = 0;
    while (skip < n && buf.t[skip] - buf.t[0] < 1000) skip++;          // exposure is still settling
    if (n - skip < 6) return { good: false, checking: true, reason: 'checking', hint: 'Hold still while we find your pulse.' };
    var tEnd = buf.t[n - 1], i0 = n - 1;
    while (i0 > skip && tEnd - buf.t[i0 - 1] <= winMs) i0--;
    var ts = buf.t.slice(i0), r = buf.r.slice(i0), g = buf.g.slice(i0);
    if ((ts[ts.length - 1] - ts[0]) / 1000 < 6) return { good: false, checking: true, reason: 'checking', hint: 'Hold still while we find your pulse.' };
    if (fpsOf(ts) < MIN_FPS) return { good: false, checking: false, reason: 'camera', hint: 'The camera is running slowly. Try a brighter room.' };
    var cands = [], rI = usable(r, MIN_RED) ? channelInfo(ts, r, 0.02) : null, gI = usable(g, MIN_GREEN) ? channelInfo(ts, g, 0.02) : null;
    if (rI) { rI.name = 'r'; cands.push(rI); } if (gI) { gI.name = 'g'; cands.push(gI); }
    if (!cands.length) return { good: false, checking: false, reason: 'bright', hint: 'Too bright. Press a little lighter, or move away from direct light.' };
    var ch = bestChannel(cands);
    // Movement = sudden spikes or a pulse that keeps changing strength. Slow drift from breathing or finger pressure is NOT movement:
    // the pulse filter already removes it, and judging it here made good signals look bad.
    if (ch.burst > 9 || ch.ampCv > 0.5 || ch.pi > 0.06) return { good: false, checking: false, reason: 'motion', hint: 'Too much movement. Rest your hand and keep still.' };
    // Same bar as the final analysis (snr 0.45, peak 10), a little higher on the peak, so "Good signal" means the number will come.
    if (ch.pi < 0.0005 || ch.snr < 0.5 || ch.pkRatio < 12) return { good: false, checking: false, reason: 'weak', hint: 'Pulse is faint. Press lightly and keep your fingertip flat on the lens.' };
    return { good: true, checking: false, reason: 'good', hint: 'Hold still.', snr: ch.snr };
  }

  /* One short line of facts about a finished scan, shown on a failed scan so it can be tuned. */
  function diagnose(buf) {
    try {
      var n = buf.t.length;
      if (n < 10) return 'finger frames ' + n;
      var parts = ['fps ' + Math.round(fpsOf(buf.t)) + ', ' + n + ' finger frames'];
      var i0 = 0, tEnd = buf.t[n - 1]; while (i0 < n - 1 && tEnd - buf.t[i0] > 14000) i0++;
      var ts = buf.t.slice(i0);
      ['r', 'g'].forEach(function (c) {
        var v = buf[c].slice(i0), clip = 0, k; for (k = 0; k < v.length; k++) if (v[k] >= 254.5) clip++;
        var line = c.toUpperCase() + ' ' + Math.round(mean(v)) + ' clip ' + Math.round(100 * clip / v.length) + '%';
        var inf = v.length > FS * 3 ? channelInfo(ts, v, 0.02) : null;
        if (inf) line += ' snr ' + inf.snr.toFixed(2) + ' pk ' + inf.pkRatio.toFixed(1) + ' ' + Math.round(inf.f0 * 60) + 'bpm';
        parts.push(line);
      });
      return parts.join(' | ');
    } catch (e) { return 'diag error'; }
  }

  return { analyze: analyze, assessLive: assessLive, consensus: consensus, diagnose: diagnose, frameStats: frameStats, fingerOn: fingerOn, lensCoveredDark: lensCoveredDark, _x: { resample: resample, bandpass: bandpass, powerSpectrum: powerSpectrum, channelInfo: channelInfo, FS: FS } };
});

/* =====================================================================================================================
   Part 2: the scanner (camera + flash + live card + result). Elements and button handlers are the ones already in index.html:
   measureHeartRate(), cancelHeartRateMeasure(), hrToggleFlash(), hrManualEntry(), focusBpFields().
   Estimates heart rate only. It is NOT a blood pressure reading.
   ===================================================================================================================== */

// ---- Flash (torch) safety net. The flash heats up against skin (it burned a fingertip once), so it has limits:
//   1. Off the moment the scan ends, is cancelled, the person leaves the app, or the camera stops.
//   2. A scan with no fingertip after HR_NOFINGER_MS ends, and the flash goes off with it.
//   3. Never lit longer than HR_FLASH_MAX_MS in one scan (the whole scan is capped at the same length).
//   4. "Flash on/off" link lets the person switch it off; the card says to lift the finger if it feels warm.
const HR_NOFINGER_MS = 12000, HR_FLASH_MAX_MS = 36000, HR_MAX_MS = 36000;
const HR_TIGHT_MS = 20000;    // a number is shown after 20 s of steady finger at the earliest
const HR_NOPULSE_MS = 24000;  // lens covered this long and still no pulse of any quality: end the scan
const HR_CONFIRM_MS = 400;    // finger must look right for this long before the run starts
const HR_LOST_MS = 500;       // finger counts as lifted after this long without looking right

let hrStream = null, hrTrack = null, hrFlashOn = false, hrFlashSince = 0, hrFlashHasTorch = false, hrTorchConfirmed = false;
let hrRafId = null, hrVfcId = null, hrSession = 0, hrTorchTimers = [], hrShown = '';
let hrS = null;               // state of the scan in progress
let hrCanvas = null, hrCtx = null;

function hrFlashPref() { try { return localStorage.getItem('hrFlash') !== 'off'; } catch (_e) { return true; } }
function hrSetFlash(on) {
  try { if (hrTrack && hrTrack.applyConstraints) hrTrack.applyConstraints({ advanced: [{ torch: !!on }] }).catch(function () {}); } catch (_e) { /* optional camera control */ }
  if (on && !hrFlashOn) hrFlashSince = performance.now();
  hrFlashOn = !!on;
  const w = document.getElementById('hr-warm'); if (w) w.style.display = hrFlashOn ? 'block' : 'none';
}
function hrLensWord() { return hrFlashOn ? 'lens and flash' : 'lens'; }
function hrFlashLabel() { const b = document.getElementById('hr-flash'); if (!b) return; b.style.display = hrFlashHasTorch ? 'inline' : 'none'; b.textContent = hrFlashPref() ? 'Flash on' : 'Flash off'; }
function hrToggleFlash() {
  try { localStorage.setItem('hrFlash', hrFlashPref() ? 'off' : 'on'); } catch (_e) {}
  if (hrStream) measureHeartRate();   // a light change in the middle of a scan would spoil it, so start again
  else hrFlashLabel();
}

// One card: a short title, one plain sentence, and (when the scan has finished) two buttons.
function hrShow(cls, title, detail) {
  const box = document.getElementById('hr-measure-box');
  if (box) box.className = 'hr-line ' + cls;
  const key = title + '|' + (detail || '');
  if (hrShown !== key) {
    const t = document.getElementById('hr-status'), d = document.getElementById('hr-detail');
    if (t) t.textContent = title;
    if (d) d.textContent = detail || '';
    hrShown = key;
  }
  const act = document.getElementById('hr-actions');
  if (act) act.style.display = (cls === 'hr-fail' || cls === 'hr-done') ? 'flex' : 'none';
  const retry = document.getElementById('hr-retry');
  if (retry) { retry.textContent = cls === 'hr-done' ? 'Measure again' : 'Try again'; retry.classList.toggle('hr-btn-main', cls !== 'hr-done'); }
  const manual = document.getElementById('hr-manual');
  if (manual) manual.style.display = cls === 'hr-done' ? 'none' : '';
  const helpLink = document.getElementById('hr-help');
  if (helpLink) helpLink.style.display = cls === 'hr-fail' ? 'flex' : 'none';
  // While scanning this control says Cancel. Once a result or a failure is showing it becomes a close button (an X), so the card can always be dismissed.
  const closeBtn = document.getElementById('hr-cancel');
  if (closeBtn) {
    const finished = cls === 'hr-done' || cls === 'hr-fail';
    closeBtn.textContent = finished ? '\u2715' : 'Cancel';
    closeBtn.setAttribute('aria-label', finished ? 'Close' : 'Cancel the scan');
    closeBtn.classList.toggle('hr-close', finished);
  }
}

function hrManualEntry() {
  cancelHeartRateMeasure();
  const el = document.getElementById('heartrate');
  if (el) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) {} el.focus(); }
}

function hrNewState() {
  return { start: 0, buf: { t: [], r: [], g: [], b: [] }, candSince: null, runStart: null, missSince: null, coveredSeen: false, everRun: 0,
           results: [], lastTry: 0, lastLabel: -1e9, weakRun: 0, lastReason: '-', satFrames: 0, satSeen: 0, satStage: 0, flashNote: '',
           lastRGB: '', lastGood: false, everGood: false, goodStreak: 0, lastOk: -1e9, dark: false, diagBuf: null, fingerFrames: 0, totalFrames: 0 };
}

function measureHeartRate() {
  stopHeartRateCamera();   // never leave an earlier camera (or flash) running
  const box = document.getElementById('hr-measure-box');
  box.style.display = 'block';
  hrShown = ''; hrShow('hr-wait', 'Starting camera…', 'Allow camera access if your phone asks.');
  const bar = document.getElementById('hr-bar-fill'); if (bar) bar.style.width = '0%';
  hrS = hrNewState();
  const alertBox = document.getElementById('hr-pattern-alert');
  if (alertBox) alertBox.style.display = 'none';
  hrOpenCamera();
}

function hrOpenCamera() {
  const mySession = hrSession;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    hrShown = ''; hrShow('hr-fail', 'Camera not available', 'This browser cannot open the camera. Try Chrome or Safari, or enter your heart rate manually.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 100 }, height: { ideal: 100 }, frameRate: { ideal: 30 } } })
    .then(function (stream) {
      if (mySession !== hrSession) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }   // cancelled while opening
      hrStream = stream;
      const video = document.getElementById('hr-video');
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      if (track && track.applyConstraints) {
        hrTrack = track;
        try { const caps = track.getCapabilities ? track.getCapabilities() : null; hrFlashHasTorch = caps ? !!caps.torch : true; hrTorchConfirmed = !!(caps && caps.torch); } catch (_e) { hrFlashHasTorch = true; hrTorchConfirmed = false; }
        hrSetFlash(hrFlashHasTorch && hrFlashPref());
        hrFlashLabel();
        hrApplyCam();
      }
      video.onloadedmetadata = function () {
        try { const pp = video.play(); if (pp && pp.catch) pp.catch(function () {}); } catch (_e) { /* autoplay attribute still applies */ }
        hrShow('hr-wait', 'Place your fingertip on the lens', 'Cover the camera ' + hrLensWord() + ' fully and press lightly.');
        hrS.start = performance.now();
        hrSchedule();
        // some phones ignore the first torch request, so ask again once the camera is running
        hrTorchTimers = [300, 900, 2000, 4000].map(function (ms) { return setTimeout(function () { if (hrStream && hrFlashOn) hrApplyCam(); }, ms); });
      };
    })
    .catch(function () {
      if (mySession !== hrSession) return;
      hrShown = ''; hrShow('hr-fail', 'Camera unavailable', 'Allow camera access in your browser settings, then try again.');
    });
}

// Torch and fixed focus in one call (so the focus setting can never switch the torch off). Exposure compensation is a separate
// request so a phone that refuses it never affects the torch: a slightly darker picture keeps the red channel from clipping.
function hrApplyCam() {
  if (!hrTrack || !hrStream) return;
  const on = !!hrFlashOn;
  try {
    const caps = hrTrack.getCapabilities ? hrTrack.getCapabilities() : null;
    if (on && caps && caps.exposureCompensation && typeof caps.exposureCompensation.min === 'number') {   // darken only when the flash is lit; in room light it would hide the finger
      const ec = caps.exposureCompensation;
      hrTrack.applyConstraints({ advanced: [{ exposureCompensation: ec.min + (ec.max - ec.min) * 0.2 }] }).catch(function () {});
    }
  } catch (_e) { /* optional camera control */ }
  try {
    hrTrack.applyConstraints({ advanced: [{ torch: on }, { focusMode: 'fixed' }] }).catch(function () {
      try { hrTrack.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {}); } catch (_e) { /* optional camera control */ }
    });
  } catch (_e) { /* optional camera control */ }
}

// Shorter exposure and lowest ISO, each as its own request so a phone that refuses one still accepts the other.
function hrDarken() {
  if (!hrTrack) return;
  try {
    const caps = hrTrack.getCapabilities ? hrTrack.getCapabilities() : {}, tries = [];
    if (caps.exposureMode && caps.exposureMode.indexOf && caps.exposureMode.indexOf('manual') >= 0) {
      const adv = { exposureMode: 'manual' };
      if (caps.exposureTime) adv.exposureTime = caps.exposureTime.min + (caps.exposureTime.max - caps.exposureTime.min) * 0.05;
      if (caps.iso) adv.iso = caps.iso.min;
      tries.push(adv);
    }
    if (caps.exposureCompensation) tries.push({ exposureCompensation: caps.exposureCompensation.min });
    tries.forEach(function (adv) { hrTrack.applyConstraints({ advanced: [adv] }).catch(function () {}); });
  } catch (_e) { /* optional camera control */ }
}

function hrSchedule() {
  const video = document.getElementById('hr-video');
  if (video && typeof video.requestVideoFrameCallback === 'function') hrVfcId = video.requestVideoFrameCallback(hrTick);
  else hrRafId = requestAnimationFrame(hrTick);
}

function hrTick(now) {
  if (!hrStream) return;
  const video = document.getElementById('hr-video');
  if (video && video.readyState >= 2) {
    if (!hrCanvas) { hrCanvas = document.createElement('canvas'); hrCanvas.width = 32; hrCanvas.height = 32; hrCtx = hrCanvas.getContext('2d', { willReadFrequently: true }); }
    hrCtx.drawImage(video, 0, 0, 32, 32);
    const st = SXHR.frameStats(hrCtx.getImageData(0, 0, 32, 32).data);
    try { hrOnFrame(st, typeof now === 'number' ? now : performance.now()); }
    catch (_e) { finishHeartRateMeasure(null); return; }   // a frame that throws must never leave the camera and flash running
  }
  if (hrStream) hrSchedule();   // finishing a scan stops the camera, which ends the loop
}

function hrOnFrame(st, t) {
  const s = hrS; if (!s) return;
  const elapsed = t - s.start;

  // flash limit
  if (hrFlashOn && performance.now() - hrFlashSince > HR_FLASH_MAX_MS) { finishHeartRateMeasure(null); return; }

  // ---- finger test, every frame ----
  s.totalFrames++;
  s.lastRGB = Math.round(st.r) + '/' + Math.round(st.g) + '/' + Math.round(st.b);
  const torchLit = hrFlashOn && hrTorchConfirmed;
  const on = SXHR.fingerOn(st, torchLit, false) || ((s.runStart !== null || s.candSince !== null || (!s.coveredSeen && elapsed >= 3000)) && SXHR.fingerOn(st, torchLit, true));
  s.dark = !on && SXHR.lensCoveredDark(st);
  if (on) {
    s.missSince = null;
    if (s.candSince === null) s.candSince = t;
    if (s.runStart === null && t - s.candSince >= HR_CONFIRM_MS) {   // finger confirmed: a fresh run starts here
      s.runStart = t; s.coveredSeen = true;
      s.buf = { t: [], r: [], g: [], b: [] }; s.results = []; s.lastTry = 0; s.weakRun = 0; s.lastGood = false; s.everGood = false; s.goodStreak = 0; s.satFrames = 0; s.satSeen = 0;
    }
    if (s.runStart !== null) {
      s.buf.t.push(t); s.buf.r.push(st.r); s.buf.g.push(st.g); s.buf.b.push(st.b); s.fingerFrames++;
      s.satSeen++; if (st.r >= 250) s.satFrames++;
    }
  } else {
    s.candSince = null;
    if (s.runStart !== null) {
      if (s.missSince === null) s.missSince = t;
      if (t - s.missSince >= HR_LOST_MS) {       // finger lifted: everything recorded so far is thrown away
        s.diagBuf = s.buf; s.runStart = null; s.missSince = null; s.buf = { t: [], r: [], g: [], b: [] }; s.results = [];
        hrShown = '';
        if (elapsed + HR_TIGHT_MS > HR_MAX_MS) { finishHeartRateMeasure(null); return; }   // not enough time left for a new 20 s run
      }
    }
  }
  const run = s.runStart === null ? 0 : t - s.runStart;
  if (run > s.everRun) s.everRun = run;

  // Flash makes red hit 255, which hides the pulse. Stage 1: shorter exposure / lowest ISO. Stage 2: flash off once (room light is used).
  if (s.satStage < 2 && hrFlashOn && run >= 3000 && s.satSeen >= 40 && s.satFrames / s.satSeen > 0.6) {
    s.satStage++;
    if (s.satStage === 1) hrDarken();
    else { hrSetFlash(false); hrFlashLabel(); s.flashNote = 'The camera was too bright with the flash, so it was switched off. Use a bright room. '; }
    s.runStart = t; s.buf = { t: [t], r: [st.r], g: [st.g], b: [st.b] }; s.results = []; s.satFrames = 0; s.satSeen = 0; hrShown = '';
  }

  // ---- live card, about 2.5 times a second ----
  if (elapsed - s.lastLabel >= 400) {
    s.lastLabel = elapsed;
    const bar = document.getElementById('hr-bar-fill');
    if (s.runStart === null) {
      if (s.coveredSeen && !s.dark) hrShow('hr-wait', 'Finger lifted', 'Place it back on the lens and hold still.');
      else if (s.dark) hrShow('hr-wait', 'Too dark', hrFlashOn ? 'Press a little lighter so light gets through, or move to a brighter room.' : 'Move to a brighter room or turn the flash on, then keep your fingertip on the lens.');
      else hrShow('hr-wait', 'Place your fingertip on the lens', 'Cover the camera ' + hrLensWord() + ' fully and press lightly.');
      if (bar) bar.style.width = '0%';
    } else {
      let live = { good: false, checking: true, hint: '' };
      try { live = SXHR.assessLive(s.buf); } catch (_e) { /* keep default */ }
      const left = Math.ceil((HR_TIGHT_MS - run) / 1000);
      if (live.good && ++s.goodStreak >= 8) { s.weakRun = 0; s.lastGood = true; s.everGood = true; hrShow('hr-good', 'Good signal', left > 0 ? 'Hold still. About ' + left + (left === 1 ? ' second left.' : ' seconds left.') : 'Finishing up…'); }
      else if (live.good) { /* first good checks: wait for a steady streak before saying Good signal */ }
      else if (live.checking) { s.goodStreak = 0; s.weakRun = 0; if (!s.lastGood) hrShow('hr-wait', 'Looking for your pulse', 'Keep your fingertip still on the lens.'); }
      else {
        s.goodStreak = 0; s.weakRun++;
        // Calm label: never "Weak signal" in the first 10 s of a run, never from one bad check, and never while the full analysis is succeeding.
        const analysing = s.results.length > 0 && t - s.lastOk < 4000;
        if (!analysing && (s.lastGood ? s.weakRun >= 5 : (run >= 10000 && s.weakRun >= 4))) { s.lastGood = false; hrShow('hr-bad', 'Weak signal', live.hint || 'Press a little lighter, keep your fingertip flat and hold still.'); }
        else if (!s.lastGood && !analysing) hrShow('hr-wait', 'Looking for your pulse', 'Keep your fingertip still on the lens.');
      }
      if (bar) bar.style.width = Math.min(s.everGood ? 100 : 30, run / HR_TIGHT_MS * 100) + '%';   // the bar only fills past 30% once a real pulse has been seen
    }
  }

  // ---- number: from 15 s of steady finger, once a second, on the latest 16 s only ----
  if (run >= 15000 && t - s.lastTry >= 1000) {
    s.lastTry = t;
    let res = SXHR.analyze(s.buf, { windowMs: 16000 }), weak = false;
    if (!(res && res.ok)) { s.lastReason = (res && res.reason) || 'weak'; res = SXHR.analyze(s.buf, { windowMs: 16000, relaxed: true }); weak = !!(res && res.ok); }
    if (res && res.ok) { s.lastOk = t; s.results.push({ bpm: res.bpm, weak: weak, peaks: res.peaks }); if (s.results.length > 8) s.results.shift(); }
    if (run >= HR_TIGHT_MS) {
      const c = SXHR.consensus(s.results, false);
      if (c) { finishHeartRateMeasure({ bpm: c.bpm, peaks: c.peaks, approx: c.approx }); return; }
    }
  }

  // ---- end conditions ----
  if (elapsed >= HR_MAX_MS) {
    const last = SXHR.consensus(s.results, true);
    if (last) { finishHeartRateMeasure({ bpm: last.bpm, peaks: last.peaks, approx: true }); return; }
    finishHeartRateMeasure(null); return;
  }
  if (s.runStart !== null && run >= HR_NOPULSE_MS && !s.everGood) { finishHeartRateMeasure(null); return; }   // covered but no pulse at all: stop instead of scanning to the end
  if (!s.coveredSeen && elapsed >= HR_NOFINGER_MS) finishHeartRateMeasure(null);   // no finger at all: say so now
}

// Why a scan could not finish: a short title and one plain sentence that says what to change.
function hrFailInfo() {
  const s = hrS || hrNewState(), lens = hrLensWord();
  let r;
  if (!s.coveredSeen) r = ['No finger detected', 'Cover the camera ' + lens + ' fully with your fingertip, then try again.'];
  else if (s.everRun < HR_TIGHT_MS) r = ['Finger lifted too soon', 'Keep your fingertip on the lens for the full 20 seconds.'];
  else if (s.satSeen > 30 && s.satFrames / s.satSeen > 0.5) r = ['Camera too bright', 'Press a little lighter, or turn the flash off and use a bright room.'];
  else if (s.lastReason === 'unsteady') r = ['Pulse not steady', 'Rest your elbow on a table, press lightly and stay still without talking.'];
  else if (s.lastReason === 'camera') r = ['Camera too slow', 'Move to a brighter room and try again.'];
  else if (!s.everGood) r = ['No pulse found', 'Cover the lens fully with the soft pad of your fingertip, press lightly and try again.'];
  else r = ['Pulse too faint', 'Press lightly, keep your fingertip flat and stay still.'];
  if (s.flashNote) r[1] = s.flashNote + r[1];
  return r;
}

function finishHeartRateMeasure(res) {
  const alertBox = document.getElementById('hr-pattern-alert');
  const s = hrS || hrNewState();
  // Technical details are for tuning only and never appear on the card. To see them, run localStorage.hrDebug='1' in the browser console.
  if (!res) { try { if (localStorage.getItem('hrDebug') === '1') console.log('[SX heart rate] rgb ' + s.lastRGB + ' | ' + SXHR.diagnose((s.buf && s.buf.t.length > 10) ? s.buf : (s.diagBuf || s.buf)) + ' | ' + s.lastReason); } catch (_e) { /* debug only */ } }
  stopHeartRateCamera();
  if (alertBox) alertBox.style.display = 'none';
  const bar = document.getElementById('hr-bar-fill');

  if (res) {
    const bpm = Math.round(res.bpm);   // whole beats per minute: a camera cannot honestly tell 66.3 from 65.9
    document.getElementById('heartrate').value = bpm;
    // A resting pulse moves a few beats from one minute to the next, so the card also shows the average of the last scans (within 15 minutes).
    // Weak, approximate scans are never kept for the average. If this scan is far from the one before it, the card says so.
    let differs = '', avgLine = '';
    if (!res.approx) {
      let recent = [];
      try { recent = JSON.parse(localStorage.getItem('hrRecent') || '[]').filter(function (x) { return x && isFinite(x.bpm) && Date.now() - x.t < 15 * 60 * 1000; }); } catch (_e) { recent = []; }
      const prev = recent.length ? recent[recent.length - 1] : null;
      if (prev && Math.abs(prev.bpm - bpm) > 10) differs = 'Different from your last scan (' + prev.bpm + ' bpm). Rest for a minute and measure again to confirm.';
      recent.push({ bpm: bpm, t: Date.now() }); recent = recent.slice(-5);
      try { localStorage.setItem('hrRecent', JSON.stringify(recent)); } catch (_e) { /* storage unavailable: no average */ }
      if (recent.length >= 2) avgLine = 'Average of your last ' + recent.length + ' scans: ' + Math.round(recent.reduce(function (a, x) { return a + x.bpm; }, 0) / recent.length) + ' bpm.';
    }
    const lines = [res.approx ? 'The signal was weak. Measure again for a more reliable result.' : 'Added to the Heart rate box.'];
    if (avgLine) lines.push(avgLine);
    if (differs) lines.push(differs);
    lines.push('Camera estimate, not a medical test.');
    hrShown = ''; hrShow('hr-done', (res.approx ? 'About ' : '') + bpm + ' bpm', lines.join('\n'));
    if (bar) bar.style.width = '100%';
    const pattern = analyzeHeartRatePattern(bpm, res.peaks);
    if (pattern.abnormal && alertBox && !res.approx) {   // a weak, approximate reading never raises an alert: it just asks for another scan
      const ttl = document.getElementById('hr-pattern-title'), note = alertBox.querySelector('.hr-alert-note');
      if (ttl) ttl.textContent = 'Your pulse is outside the usual range';
      document.getElementById('hr-pattern-text').textContent = pattern.text;
      if (note) note.textContent = 'This is a camera estimate of pulse rate only. It is not a blood pressure reading or a medical test. If you feel dizzy, faint, short of breath or have chest pain, get medical care now.';
      alertBox.style.display = 'flex';
    }
  } else {
    const fi = hrFailInfo(); hrShown = ''; hrShow('hr-fail', fi[0], fi[1]);
  }
  // The finished card stays until the person taps a button or starts a new scan: it holds the number and the next steps.
}

// ---- Heart rate PATTERN analysis (rate only). Flags a fast or slow pulse and nudges toward a real manual BP reading.
// Never estimates blood pressure itself. Rhythm irregularity is intentionally not judged (it needs real-device tuning).
const HR_TACHY_BPM = 100;   // above the usual resting range of 60 to 100
const HR_BRADY_BPM = 50;    // a pulse in the 50s is common in fit people, so only below 50 interrupts the person
function analyzeHeartRatePattern(bpm, peakTimes) {
  const reasons = []; let text = '';
  if (bpm > HR_TACHY_BPM) {
    reasons.push('fast');
    text = 'Your reading was ' + bpm + ' bpm, faster than the usual resting range of 60 to 100. If you just walked, climbed stairs or had caffeine, rest for 5 minutes and measure again. Checking your blood pressure is still a good idea.';
  } else if (bpm > 0 && bpm < HR_BRADY_BPM) {
    reasons.push('slow');
    text = 'Your reading was ' + bpm + ' bpm, slower than the usual resting range. Some healthy people, such as athletes, have a slow pulse. Rest and measure again, and check your blood pressure.';
  }
  return { abnormal: reasons.length > 0, reasons: reasons, text: text };
}

function focusBpFields() {
  const sysField = document.getElementById('systolic');
  if (sysField) { sysField.scrollIntoView({ behavior: 'smooth', block: 'center' }); sysField.focus(); }
}

function stopHeartRateCamera() {
  hrSession++;
  hrSetFlash(false);   // flash off first, whatever else happens
  hrTrack = null; hrFlashOn = false; hrTorchConfirmed = false;
  hrTorchTimers.forEach(clearTimeout); hrTorchTimers = [];
  if (hrRafId) { cancelAnimationFrame(hrRafId); hrRafId = null; }
  if (hrVfcId) { try { document.getElementById('hr-video').cancelVideoFrameCallback(hrVfcId); } catch (_e) {} hrVfcId = null; }
  if (hrStream) { hrStream.getTracks().forEach(function (t) { t.stop(); }); hrStream = null; }
}

function cancelHeartRateMeasure() {
  stopHeartRateCamera();
  hrS = null;
  document.getElementById('hr-measure-box').style.display = 'none';
  const alertBox = document.getElementById('hr-pattern-alert');
  if (alertBox) alertBox.style.display = 'none';
}

// Closing or leaving the page also turns the camera and flash off.
window.addEventListener('pagehide', function () { if (hrStream || hrTorchTimers.length) stopHeartRateCamera(); });

// Leaving the app mid-scan: turn the flash and camera off straight away.
document.addEventListener('visibilitychange', function () {
  if (document.hidden && (hrStream || hrTorchTimers.length)) {
    stopHeartRateCamera();
    hrShown = ''; hrShow('hr-fail', 'Scan stopped', 'The camera and flash were switched off because you left the app. Tap Try again when you are ready.');
  }
});
