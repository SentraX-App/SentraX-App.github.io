/*
 * passport-scan.js — Sentra-X Medical Passport Document Scanner
 * ========================================
 * Lets someone photograph or upload an existing photo of a real medical
 * document (lab report, prescription, discharge note, vaccination card)
 * and have a vision-capable AI model (via a dedicated Cloudflare Worker)
 * extract fields into the SAME form already used for manual passport
 * entry — nothing new to save, no new merge logic. Extracted fields are
 * always shown for review/edit before anything touches the real form,
 * since OCR/vision extraction from real-world documents — especially
 * handwritten prescriptions — will sometimes misread something, and this
 * is health data. Nothing is ever auto-saved unreviewed.
 *
 * After confirming, the person is asked whether to keep the document
 * photo itself (stored separately from their personal profile photo,
 * under passport.scannedDocuments) or discard it now that the details
 * are captured — matching the explicit design decision to let the user
 * choose data retention here.
 *
 * Isolated from everything else, same pattern as store.js/rewards.js —
 * a new file, self-created overlay, a couple of hook-in lines elsewhere.
 * The actual save path is 100% the existing savePassport() function in
 * script.js — this module only ever fills the existing #pp-* inputs and
 * then calls that function, so the tested save/merge logic never changes.
 */

(function () {
  'use strict';

  // Paste your deployed Cloudflare Worker URL here once set up (see the
  // header comment in sentrax-passport-scan.js for the one setup step —
  // just a Workers AI binding, no Firestore/secrets needed). Leave blank
  // and the Scan button is simply hidden — manual entry still works fully
  // either way.
  const SCAN_WORKER_URL = 'https://sentrax-passport-scan.alecedoh1994.workers.dev/';

  const MAX_IMAGE_DIMENSION = 1600; // downscale before upload — faster, cheaper, plenty for OCR
  const MAX_STORED_DOCUMENTS = 5;

  const FIELD_LABELS = {
    age: 'Age', sex: 'Sex', bloodGroup: 'Blood Group', genotype: 'Genotype',
    allergies: 'Allergies', conditions: 'Chronic Conditions', history: 'Medical History',
    vaccinations: 'Vaccinations', height: 'Height (cm)', weight: 'Weight (kg)',
    physician: 'Primary Physician', insurance: 'Insurance Info', emergencyContact: 'Emergency Contact'
  };

  function esc(str) {
    return (typeof escapeHtml === 'function') ? escapeHtml(str) : String(str == null ? '' : str);
  }

  // ---- Image capture + client-side downscale before upload -------------
  function fileToResizedJpegBase64(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.onload = function () {
        img.onerror = function () { reject(new Error('Could not read that image.')); };
        img.onload = function () {
          let w = img.width, h = img.height;
          if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
            const scale = MAX_IMAGE_DIMENSION / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Overlay shell (reuses the app's established sheet look) ---------
  function ensureOverlay() {
    let overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pp-scan-overlay';
      overlay.className = 'mkt-sheet-backdrop';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function sheetShell(title, bodyHtml, showClose) {
    return '<div class="mkt-sheet">' +
      '<div class="mkt-sheet-handle"></div>' +
      '<div class="mkt-sheet-header"><h3>' + title + '</h3>' +
      (showClose === false ? '' : '<button class="mkt-sheet-close" onclick="SentraXPassportScan.close()">✕</button>') +
      '</div>' +
      '<div class="mkt-sheet-body">' + bodyHtml + '</div>' +
      '</div>';
  }

  function openScan() {
    if (!SCAN_WORKER_URL) return;
    const overlay = ensureOverlay();
    renderPickStep();
    overlay.style.display = 'block';
  }

  function close() {
    const overlay = document.getElementById('pp-scan-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ---- Step 1: pick a photo ---------------------------------------------
  function renderPickStep() {
    const overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) return;
    overlay.innerHTML = sheetShell('Scan a Document',
      '<p style="font-size:13px;color:#94a3b8;margin:0 0 14px;">Take a photo or choose an existing one of a lab report, prescription, discharge note, or vaccination card. You\'ll review everything it finds before anything is saved.</p>' +
      '<input type="file" id="pp-scan-file-input" accept="image/*" style="display:none;" onchange="SentraXPassportScan.handleFile(this)">' +
      '<label for="pp-scan-file-input" class="rwd-redeem-btn" style="display:block;text-align:center;cursor:pointer;">📷 Choose or Take a Photo</label>' +
      '<div id="pp-scan-error" style="color:#fca5a5;font-size:13px;margin-top:10px;min-height:16px;"></div>');
  }

  function handleFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    fileToResizedJpegBase64(file).then(function (dataUrl) {
      renderScanningStep(dataUrl);
      return callScanWorker(dataUrl);
    }).then(function (result) {
      if (!result) return; // renderScanningStep already showed an error
      if (!result.foundAnything) {
        renderNoResultStep(result.dataUrl);
      } else {
        renderReviewStep(result.fields, result.dataUrl);
      }
    }).catch(function (err) {
      const errEl = document.getElementById('pp-scan-error');
      if (errEl) errEl.textContent = err.message || 'Something went wrong reading that photo.';
    });
  }

  function renderScanningStep(dataUrl) {
    const overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) return;
    overlay.innerHTML = sheetShell('Reading Document…',
      '<img src="' + dataUrl + '" alt="" style="width:100%;border-radius:12px;margin-bottom:14px;max-height:220px;object-fit:cover;">' +
      '<p style="text-align:center;font-size:13px;color:#94a3b8;">Looking for passport details — this takes a few seconds…</p>', false);
  }

  function callScanWorker(dataUrl) {
    return fetch(SCAN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.error) throw new Error(data.error || 'Could not read that document.');
        data.dataUrl = dataUrl;
        return data;
      });
    }).catch(function (err) {
      renderErrorStep(err.message || 'Could not reach the scanner. Check your connection and try again.');
      return null;
    });
  }

  function renderErrorStep(message) {
    const overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) return;
    overlay.innerHTML = sheetShell('Scan Failed',
      '<p style="font-size:13px;color:#fca5a5;margin-bottom:14px;">' + esc(message) + '</p>' +
      '<button onclick="SentraXPassportScan.retry()">Try Again</button>');
  }

  function renderNoResultStep(dataUrl) {
    const overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) return;
    overlay.innerHTML = sheetShell('Nothing Found',
      '<p style="font-size:13px;color:#94a3b8;margin-bottom:14px;">This didn\'t look like it had any readable passport details — try a clearer, well-lit photo, or add details manually instead.</p>' +
      '<button onclick="SentraXPassportScan.retry()">Try Another Photo</button>');
  }

  function retry() {
    renderPickStep();
  }

  // ---- Step 2: review & edit before anything is saved -------------------
  let reviewDataUrl = null;

  function renderReviewStep(fields, dataUrl) {
    reviewDataUrl = dataUrl;
    const overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) return;

    const rows = Object.keys(FIELD_LABELS).map(function (key) {
      const val = fields[key] || '';
      return '<label style="font-size:11.5px;color:#93c5fd;display:block;margin-top:10px;">' + FIELD_LABELS[key] + '</label>' +
        '<input type="text" id="pp-scan-field-' + key + '" value="' + esc(val) + '" placeholder="Not found — add manually if needed">';
    }).join('');

    overlay.innerHTML = sheetShell('Review What Was Found',
      '<p style="font-size:12.5px;color:#94a3b8;margin:0 0 6px;">Check each field against the document — fix anything that\'s wrong or fill in what was missed. Nothing is saved until you confirm.</p>' +
      rows +
      '<button onclick="SentraXPassportScan.confirm()" style="margin-top:16px;">Use These Details</button>' +
      '<button class="secondary" onclick="SentraXPassportScan.retry()" style="margin-top:8px;">Scan a Different Photo</button>');
  }

  // ---- Step 3: hand off to the EXISTING passport form + save function --
  function confirm() {
    Object.keys(FIELD_LABELS).forEach(function (key) {
      const src = document.getElementById('pp-scan-field-' + key);
      const dest = document.getElementById('pp-' + toFieldId(key));
      if (src && dest) dest.value = src.value.trim();
    });

    if (typeof savePassport === 'function') savePassport();
    renderKeepOrDiscardStep(reviewDataUrl);
  }

  // Maps a couple of field names to their actual #pp-* input ids where
  // they don't match 1:1 (bloodGroup -> pp-bloodgroup, genotype ->
  // pp-genotype are already lowercase matches; the rest already line up).
  function toFieldId(key) {
    if (key === 'bloodGroup') return 'bloodgroup';
    return key;
  }

  // ---- Step 4: explicit keep-or-discard choice for the document photo --
  function renderKeepOrDiscardStep(dataUrl) {
    const overlay = document.getElementById('pp-scan-overlay');
    if (!overlay) return;
    overlay.innerHTML = sheetShell('Details Saved ✅',
      '<p style="font-size:13px;color:#cbd5e1;margin-bottom:14px;">Your passport has been updated. Keep this document photo attached for reference, or discard it now that the details are saved?</p>' +
      '<button onclick="SentraXPassportScan.keepDocument()">📎 Keep the Photo</button>' +
      '<button class="secondary" onclick="SentraXPassportScan.discardDocument()" style="margin-top:8px;">🗑️ Discard the Photo</button>', false);
    // stash for the two handlers below without re-threading it through every function signature
    overlay.dataset.pendingDoc = dataUrl;
  }

  function keepDocument() {
    const overlay = document.getElementById('pp-scan-overlay');
    const dataUrl = overlay ? overlay.dataset.pendingDoc : null;
    if (dataUrl) {
      const passport = JSON.parse(localStorage.getItem('passport') || '{}');
      const docs = Array.isArray(passport.scannedDocuments) ? passport.scannedDocuments : [];
      docs.unshift({ id: 'doc-' + Date.now(), dataUrl: dataUrl, addedAt: Date.now() });
      passport.scannedDocuments = docs.slice(0, MAX_STORED_DOCUMENTS);
      localStorage.setItem('passport', JSON.stringify(passport));
      if (typeof syncToFirestore === 'function') {
        try { syncToFirestore({ passport: passport }); } catch (e) { /* offline is fine, saved locally */ }
      }
    }
    close();
  }

  function discardDocument() {
    close();
  }

  if (typeof window !== 'undefined') {
    window.SentraXPassportScan = {
      open: openScan,
      close: close,
      handleFile: handleFile,
      retry: retry,
      confirm: confirm,
      keepDocument: keepDocument,
      discardDocument: discardDocument,
      isConfigured: function () { return !!SCAN_WORKER_URL; }
    };
  }

  function initButtonVisibility() {
    const btn = document.getElementById('pp-scan-btn');
    if (btn && !SCAN_WORKER_URL) btn.style.display = 'none';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initButtonVisibility);
  } else {
    initButtonVisibility();
  }
})();
