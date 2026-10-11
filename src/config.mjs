import path from 'node:path';
export const MODEL = 'gpt-transcribe';
export const AUDIO_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
export const ISSUER = 'https://auth.openai.com';
export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'; // Public OAuth client ID, not a secret.
export const REDIRECT_URI = 'http://localhost:1455/auth/callback';
export const MAX_AUDIO = 25 * 1024 * 1024;
export const MAX_UPLOAD = MAX_AUDIO + 1024 * 1024;
export const error = (code, status = 503) => Object.assign(new Error(code), {code, status});
function integer(env, key, fallback, min, max) {
  const n = Number(env[key] || fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw error('invalid_' + key.toLowerCase());
  return n;
}
export function config(env = process.env) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.GATEWAY_TOKEN || '')) throw error('gateway_token_required');
  if (!/^[a-f0-9]{64}$/i.test(env.CREDENTIALS_KEY || '')) throw error('credentials_key_required');
  return {
    token: env.GATEWAY_TOKEN, encryptionKey: Buffer.from(env.CREDENTIALS_KEY, 'hex'),
    dataDir: path.resolve(env.DATA_DIR || './data'), host: env.HOST || '127.0.0.1',
    port: integer(env, 'PORT', 8080, 1, 65535), concurrency: integer(env, 'MAX_CONCURRENCY', 10, 1, 100),
    timeoutMs: integer(env, 'REQUEST_TIMEOUT_MS', 120000, 1000, 180000),
    cooldownMs: integer(env, 'UPSTREAM_COOLDOWN_MS', 300000, 1000, 3600000),
    expectedEmail: env.EXPECTED_EMAIL?.trim() || '', expectedWorkspace: env.EXPECTED_WORKSPACE_ID?.trim() || ''
  };
}
