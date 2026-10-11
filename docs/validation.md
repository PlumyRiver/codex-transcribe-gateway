# Validation boundaries

## Automated validation

The standalone suite uses synthetic credentials, generated signing keys and mocked OpenAI responses. It exercises local HTTP requests, multipart validation, PKCE/state/nonce, signed identity verification, account/workspace restrictions, encrypted persistence after reopening the store, single-owner exclusion, concurrent token refresh, callback replay rejection, model reporting, concurrency admission, cooldown and no audio retry.

CI runs the suite on Node.js 22 and 24, builds the container, checks Compose syntax and scans tracked files for private artifacts and configured credential patterns. The scan is a release aid, not a mathematical proof that arbitrary future contributions contain no secret.

The native patch was applied to a clean checkout of its pinned commit. All nine transcription test functions in the Go service and handler packages passed. Applying or compiling a patch does not establish upstream account access.

## Standalone live smoke (2026-10-12, Taiwan time)

The extracted standalone gateway transcribed a short, known synthetic English recording correctly in one request: 200 response, 1,781 ms client latency. It used a still-valid access token read from an already-authorized owner, only in memory. No refresh token was copied or refreshed, no API key was used, and the existing owner was unchanged. The result is recorded in `live-smoke.json` without account identifiers or credentials.

The provider omitted its model ID, so `reportedModel` is null and `modelVerification` is `unreported`. This checks the new standalone request/response path, not a fresh browser authorization or entitlement for another account. Encrypted restart and refresh coordination were tested separately using synthetic credentials.

## Historical source integration

Before extraction, the source integration obtained a correct known-sentence transcript locally and on a backend using a Codex OAuth access token at the public audio endpoint. It also repeated the request after a backend restart without the local service running. The provider did not report a model ID, so that evidence supports successful transcription with a requested model, not independently verified model identity.

A different account returned `billing_not_active`. These are account-specific observations, not guarantees for new users. No original credentials, customer logs or private deployment receipts are shipped here.

## Your acceptance test

Authorize your own account, submit a real known-content recording, compare its text, and repeat after restarting persistent storage. Record latency, requested/reported model and safe error category. Test refresh as the sole credential owner. Do not publish the audio or transcript unless you intend to share it.

A failed access check should stop the experiment until there is new evidence or a completed official verification step. This project contains no Cloudflare challenge solver, desktop Cookie copier, device-attestation spoof or alternate paid API fallback.
