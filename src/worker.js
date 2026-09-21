// Sentra-X Worker entry point. Serves the static site (see wrangler.toml's
// [assets] block). Fingerprint/face unlock (WebAuthn) has been removed —
// PIN unlock runs entirely on-device, so no server-side routes are needed.

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
