# Codex Transcribe Gateway

[繁體中文](README.zh-TW.md)

A small, self-hosted HTTP service for audio-file transcription with an **independent OAuth grant**. Extracted from a working Sub2API integration, without its customer database, billing system, private infrastructure or credentials.

- `POST /v1/audio/transcriptions`, multipart audio, requested model `gpt-transcribe`.
- Public upstream endpoint: `https://api.openai.com/v1/audio/transcriptions`.
- Browser OAuth with PKCE, state, nonce and signed ID-token verification.
- Encrypted credentials on persistent storage; serialized refresh; one refresh owner.
- Default concurrency **10** and a **five-minute cooldown** after upstream 401/403/429/5xx failures. No automatic audio replay.
- Reports the upstream model only when upstream actually supplies it.
- Optional transcription-only patch for pinned Sub2API v0.2.10.

**Compatibility:** successful OAuth sign-in does not guarantee audio access. This integration uses the existing public Codex OAuth client ID. It is experimental, not an official OpenAI integration contract. Some accounts return `billing_not_active` or access denied. An API-key fallback is not implemented. Missing upstream model identity remains `unreported`; specifying a model is not proof that it was used.

## Quick start — Node.js 22+

```sh
git clone https://github.com/PlumyRiver/codex-transcribe-gateway.git
cd codex-transcribe-gateway
npm ci --ignore-scripts
npm run init
npm run login
npm start
```

Open the **localhost link printed by login**, then complete the official OpenAI sign-in page. The code exchanges and stores credentials directly; never paste a callback URL or token into chat or an issue. The flow expires after ten minutes.

`init` creates fresh random `.env` keys with restricted permissions and refuses to overwrite an existing file. Login never reads or modifies your normal Codex login/configuration. Stop the gateway before replacing its OAuth grant.

In another terminal:

```sh
npm run smoke -- /path/to/your-speech.wav
```

Use an audio recording with a known spoken sentence and check the returned text. A 200 response alone is not an acceptance test. To save output, create a `private/` directory and pass a new file name as the second argument.

## Docker and remote servers

```sh
npm run init
docker compose build
docker compose run --rm --service-ports login
docker compose up -d gateway
```

The image does not contain `.env` or credentials. Credentials live in the named `credentials` volume; the same `CREDENTIALS_KEY` is required after a restart. Ports are published on host loopback only.

For a remote server, forward the OAuth callback from your laptop:

```sh
ssh -L 1455:127.0.0.1:1455 user@your-server
```

Run the Docker login command **in that SSH session**, and open its printed localhost link on your laptop. Once authorized, close the SSH tunnel: the backend can refresh its own credentials and transcribe independently. For reauthorization, first run `docker compose stop gateway`; restart it after login completes.

Expose the API through your own HTTPS reverse proxy if required. Keep the login callback private. See [deployment](docs/deployment.md) for persistence, restarts and serverless limitations.

## API

Use `Authorization: Bearer <your GATEWAY_TOKEN>` on every API request. This is your local gateway key, not the upstream OAuth token.

```sh
curl http://127.0.0.1:8080/v1/audio/transcriptions \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -F 'model=gpt-transcribe' \
  -F 'file=@speech.wav'
```

The curl example assumes your shell already has `GATEWAY_TOKEN`; `npm run smoke` loads it from `.env` for you. Accepted files: WAV, MP3, MP4, M4A, MPEG, MPGA, FLAC, OGG, WebM; maximum 25 MiB. JSON output only. Optional hints: `language`, `prompt`, up to four `languages[]`, and up to 992 `keywords[]` (80 characters each). The gateway forwards supported hints; upstream acceptance can vary.

Typical response when the provider does **not** identify its model:

```json
{
  "text": "Your transcript.",
  "usage": { "duration": 3 },
  "requestedModel": "gpt-transcribe",
  "reportedModel": null,
  "modelVerification": "unreported",
  "provider": "codex-oauth"
}
```

`usage` is the provider's optional response, not an invented quota or dollar cost. The subscription/API billing treatment and entitlement belong to the upstream account; this repository does not promise free or unlimited use.

`GET /healthz` is a public process-liveness check. Authenticated `GET /status` reports concurrency and cooldown, not transcription entitlement. The legacy client path `/internal/sub2api/v1/audio/transcriptions` is also accepted.

## Operations and troubleshooting

| Response | Meaning / next step |
|---|---|
| `unauthorized` | Check your gateway key. No upstream audio was sent. |
| `gateway_busy` | Local concurrency is full. No upstream audio was sent. |
| `login_required`, refresh errors | Stop the gateway, authorize again, restart. Do not copy another running owner's refresh token. |
| `upstream_challenge_required` / HTML | An upstream challenge was returned. This project does not solve or bypass it. |
| `upstream_access_denied` | OAuth alone did not grant this audio request. Investigate account/workspace access. |
| `billing_not_active` | This account is not currently eligible for this request; repeated login is not an established fix. |
| `upstream_rate_limited` | Respect upstream limits and the local cooldown. |
| `upstream_cooldown` | No audio is forwarded during the remaining cooldown. |
| `unexpected_upstream_model` | The provider identified a different model; the gateway rejected it. |

The default ten requests are an **operator limit**, not a measured universal account limit. Limit is per process; run one instance for this file-backed deployment. Do not clone a live refresh grant into independent stores.

## Existing Sub2API users

```sh
node scripts/prepare-upstream.mjs
```

This downloads the pinned public commit into ignored `upstream/`, verifies it, and applies only `patches/sub2api-transcription.patch`. Read [Sub2API integration](docs/sub2api.md) before building. The standalone Node server does not require Sub2API, PostgreSQL or Redis.

## Development and evidence

```sh
npm test
npm run scan
```

Tests use synthetic credentials and mocked OpenAI endpoints. They cover real local HTTP upload handling, callbacks, signed identities, encrypted persistence, refresh concurrency, replay protection, error classification and cooldown. They do not create OpenAI accounts or establish access for a new account. See [validation](docs/validation.md).

OAuth references: [OpenAI authentication](https://learn.chatgpt.com/docs/auth) and [ChatGPT plan inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). Official login guidance does not establish universal transcription entitlement.

LGPL-3.0-or-later. See [NOTICE](NOTICE) and [LICENSE](LICENSE).
