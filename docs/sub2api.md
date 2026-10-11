# Optional native Sub2API patch

Upstream: https://github.com/Wei-Shaw/sub2api

Pin: `v0.2.10`, commit `2f3fed2fdb0787141294cec81487a5df30426f7f`.

Run `node scripts/prepare-upstream.mjs` from the repository root. It creates a fresh ignored checkout, verifies the exact commit and applies the patch. It refuses to reset an existing checkout. Build that checkout using its upstream build instructions and Go version.

The patch contains six files: a transcription service and tests, a handler and tests, an OAuth-only account capability, and protected route registration. It preserves native account selection, key authentication, user/account concurrency, and usage-recording hooks. It excludes the unrelated Live/DeviceCheck, image generation and multi-account scheduling modifications.

In the native admin UI, authorize **your own OpenAI OAuth account**, create an OpenAI group, enable its existing `AllowLive` gate and explicitly set the STT price to zero. Permit `gpt-transcribe` in the model allowlist and associate your API key/account with this group. Zero is the internal relay tariff in this patch, not a promise about upstream billing. Do not run an API-key account through this OAuth-only path.

Call `/v1/audio/transcriptions` with a native Sub2API API key and **explicit** `model=gpt-transcribe`. That model selects the public audio endpoint with the account's OAuth bearer. The patch also retains a legacy `codex-transcribe` dictation alias, which uses a different private endpoint and is not part of the standalone gateway's default flow. Do not substitute it for a confirmed GPT Transcribe result.

An upstream 403 is not evidence that a local authentication guard should be removed. A group/key configuration error, OAuth failure, account eligibility rejection, rate limit and HTML security challenge are different failure layers.

The standalone Node server has independent encrypted file storage. The native patch uses Sub2API's own account database and refresh system. Choose one architecture/credential owner; do not copy a rotating grant into both.
