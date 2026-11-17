// Verifies a Firebase ID token inside a Cloudflare Worker (no libraries, no cost).
// Use it in the SOS, AI and scanner Workers so only signed-in Sentra-X users can call them.
//
//   import { verifyFirebaseIdToken } from './verify-firebase-token.js';
//   const user = await verifyFirebaseIdToken(body.idToken, 'sentra-x');
//   if (!user) return new Response('Unauthorized', { status: 401 });   // user.uid is the caller
//
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cache = { keys: null, at: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson(s) { return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))); }

async function getKeys(fetchFn) {
  const now = Date.now();
  if (cache.keys && now - cache.at < 60 * 60 * 1000) return cache.keys;
  const res = await fetchFn(JWKS_URL);
  if (!res.ok) throw new Error('Could not load signing keys');
  cache = { keys: (await res.json()).keys || [], at: now };
  return cache.keys;
}

export async function verifyFirebaseIdToken(idToken, projectId, fetchFn = fetch) {
  try {
    if (typeof idToken !== 'string') return null;
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const header = b64urlToJson(parts[0]);
    const payload = b64urlToJson(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;

    const keys = await getKeys(fetchFn);
    const jwk = keys.find(function (k) { return k.kid === header.kid; });
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId) return null;
    if (payload.iss !== 'https://securetoken.google.com/' + projectId) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.iat !== 'number' || payload.iat > now + 300) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return { uid: payload.sub, email: payload.email || null };
  } catch (_e) {
    return null;
  }
}
export function _resetKeyCacheForTests() { cache = { keys: null, at: 0 }; }
