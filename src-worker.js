// Sentra-X main Worker entry point — merges the WebAuthn (fingerprint/face
// unlock) API into the same Worker that already serves the static site
// (per wrangler.toml's [assets] block). Any request that isn't one of the
// /api/webauthn/* routes below falls straight through to the static site,
// completely unchanged from how it worked before this file existed.
//
// IMPORTANT — the /api/webauthn/* handlers below have NOT been run or
// tested by the assistant that wrote them (this sandbox has no network
// access to install @simplewebauthn/server or run wrangler). Written
// carefully against that library's documented v10 API shape, but library
// APIs shift between versions — treat this as a solid first draft that
// needs real testing (a real phone, a real deploy) before trusting it with
// real users. The one spot flagged inline below as most likely to need a
// small adjustment is verification.registrationInfo.credential's exact
// shape.
//
// The PIN-unlock feature added alongside this (see auth.js) is intentionally
// NOT part of this Worker at all — it never leaves the device, so there is
// nothing server-side for it to touch here.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hmacKey(env) {
  const keyData = new TextEncoder().encode(env.WEBAUTHN_STATE_SECRET);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function toB64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function createStateToken(env, payloadObj) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, payloadBytes);
  return toB64url(payloadBytes) + '.' + toB64url(new Uint8Array(sig));
}
async function verifyStateToken(env, token) {
  const [payloadB64, sigB64] = String(token || '').split('.');
  if (!payloadB64 || !sigB64) throw new Error('Malformed state token.');
  const payloadBytes = fromB64url(payloadB64);
  const key = await hmacKey(env);
  const valid = await crypto.subtle.verify('HMAC', key, fromB64url(sigB64), payloadBytes);
  if (!valid) throw new Error('State token signature check failed.');
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  if (!payload.exp || Date.now() > payload.exp) throw new Error('State token expired — please try again.');
  return payload;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function importServiceAccountKey(pem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
async function signJWT(header, payload, privateKey) {
  const encHeader = toB64url(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = toB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = encHeader + '.' + encPayload;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signingInput));
  return signingInput + '.' + toB64url(new Uint8Array(sig));
}

let cachedAccessToken = null;
async function getGoogleAccessToken(env) {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
  }
  const privateKey = await importServiceAccountKey(env.FIREBASE_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJWT(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    privateKey
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google OAuth token exchange failed: ' + JSON.stringify(data));
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function firestoreGet(env, path) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore GET failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}
async function firestorePatch(env, path, fields) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error('Firestore PATCH failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}

async function mintFirebaseCustomToken(env, uid) {
  const privateKey = await importServiceAccountKey(env.FIREBASE_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  return signJWT(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      sub: env.FIREBASE_CLIENT_EMAIL,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid: uid,
    },
    privateKey
  );
}

async function handleWebAuthn(request, env, url) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body = {};
  const rawText = await request.text();
  if (rawText) {
    try { body = JSON.parse(rawText); } catch (_e) { return jsonResponse({ error: 'Invalid JSON body.' }, 400); }
  }

  if (url.pathname === '/api/webauthn/register-options') {
    const { uid, email } = body;
    if (!uid || !email) return jsonResponse({ error: 'uid and email are required.' }, 400);

    const existingDoc = await firestoreGet(env, `webauthnUsers/${uid}`);
    const existingCredentialIds = (existingDoc?.fields?.credentialIds?.arrayValue?.values || []).map(v => v.stringValue);

    const options = await generateRegistrationOptions({
      rpName: 'Sentra-X',
      rpID: env.RP_ID,
      userID: new TextEncoder().encode(uid),
      userName: email,
      attestationType: 'none',
      excludeCredentials: existingCredentialIds.map(id => ({ id })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });

    const stateToken = await createStateToken(env, { challenge: options.challenge, uid, exp: Date.now() + 5 * 60 * 1000 });
    return jsonResponse({ ...options, stateToken });
  }

  if (url.pathname === '/api/webauthn/register-verify') {
    const { uid, stateToken, ...credentialResponse } = body;
    const state = await verifyStateToken(env, stateToken);
    if (state.uid !== uid) return jsonResponse({ verified: false, error: 'UID mismatch.' }, 400);

    const verification = await verifyRegistrationResponse({
      response: credentialResponse,
      expectedChallenge: state.challenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return jsonResponse({ verified: false, error: 'Registration could not be verified.' });
    }

    // NOTE: this is the one spot most likely to need a small tweak
    // depending on the exact @simplewebauthn/server version installed —
    // v10's documented shape is registrationInfo.credential.{id, publicKey,
    // counter}. If a type/shape error shows up here during testing, check
    // the installed version's actual return shape against its README and
    // adjust this destructuring accordingly.
    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKeyB64 = toB64url(credential.publicKey);

    await firestorePatch(env, `webauthnCredentials/${credentialId}`, {
      uid: { stringValue: uid },
      publicKey: { stringValue: publicKeyB64 },
      counter: { integerValue: String(credential.counter) },
    });

    const userDoc = await firestoreGet(env, `webauthnUsers/${uid}`);
    const existingIds = (userDoc?.fields?.credentialIds?.arrayValue?.values || []).map(v => v.stringValue);
    const updatedIds = existingIds.includes(credentialId) ? existingIds : existingIds.concat([credentialId]);
    await firestorePatch(env, `webauthnUsers/${uid}`, {
      credentialIds: { arrayValue: { values: updatedIds.map(id => ({ stringValue: id })) } },
    });

    return jsonResponse({ verified: true });
  }

  if (url.pathname === '/api/webauthn/login-options') {
    const options = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      userVerification: 'required',
    });
    const stateToken = await createStateToken(env, { challenge: options.challenge, exp: Date.now() + 5 * 60 * 1000 });
    return jsonResponse({ ...options, stateToken });
  }

  if (url.pathname === '/api/webauthn/login-verify') {
    const { stateToken, ...credentialResponse } = body;
    const state = await verifyStateToken(env, stateToken);

    const credDoc = await firestoreGet(env, `webauthnCredentials/${credentialResponse.id}`);
    if (!credDoc) return jsonResponse({ error: 'Unrecognized credential.' }, 400);
    const uid = credDoc.fields.uid.stringValue;
    const publicKey = fromB64url(credDoc.fields.publicKey.stringValue);
    const counter = parseInt(credDoc.fields.counter.integerValue, 10);

    const verification = await verifyAuthenticationResponse({
      response: credentialResponse,
      expectedChallenge: state.challenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
      credential: { id: credentialResponse.id, publicKey, counter },
    });

    if (!verification.verified) return jsonResponse({ error: 'Login could not be verified.' }, 400);

    await firestorePatch(env, `webauthnCredentials/${credentialResponse.id}`, {
      uid: { stringValue: uid },
      publicKey: { stringValue: credDoc.fields.publicKey.stringValue },
      counter: { integerValue: String(verification.authenticationInfo.newCounter) },
    });

    const token = await mintFirebaseCustomToken(env, uid);
    return jsonResponse({ token });
  }

  return jsonResponse({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/webauthn/')) {
      try {
        return await handleWebAuthn(request, env, url);
      } catch (err) {
        console.error('Sentra-X WebAuthn error:', err && err.message);
        return jsonResponse({ error: err && err.message ? err.message : 'Something went wrong.' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
