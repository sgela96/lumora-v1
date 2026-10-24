import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works both from src/ (tsx) and dist/ (bundled).
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

const isProduction = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(env('LUMORA_DATA_DIR', path.join(repoRoot, 'data')));

/** In development a secret is generated once and kept in the data dir, so stored credentials survive restarts. */
function resolveSecret(): string {
  const fromEnv = env('LUMORA_SECRET');
  if (fromEnv) return fromEnv;
  if (isProduction) throw new Error('LUMORA_SECRET must be set in production (used to encrypt integration credentials).');
  const file = path.join(dataDir, '.dev-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const generated = randomBytes(32).toString('hex');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  isProduction,
  port: Number(env('PORT', '3000')),
  /** Public URL of this server, used in snippets and in attachment links sent to ticket systems. */
  publicUrl: env('LUMORA_PUBLIC_URL', `http://localhost:${env('PORT', '3000')}`).replace(/\/$/, ''),
  /** 32+ random chars; encrypts integration credentials and signs attachment links. */
  secret: resolveSecret(),
  dataDir,
  widgetDist: path.join(repoRoot, 'packages', 'widget', 'dist'),
  dashboardDist: path.join(repoRoot, 'packages', 'dashboard', 'dist'),
  demoDir: path.join(repoRoot, 'demo'),
  maxUploadMb: Number(env('LUMORA_MAX_UPLOAD_MB', '100')),
  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
    prices: {
      free: '',
      pro: env('STRIPE_PRICE_PRO'),
      business: env('STRIPE_PRICE_BUSINESS'),
    },
    addonPrices: {
      ai: env('STRIPE_PRICE_ADDON_AI'),
      helpdesks: env('STRIPE_PRICE_ADDON_HELPDESKS'),
      long_recordings: env('STRIPE_PRICE_ADDON_LONG_RECORDINGS'),
      extra_app: env('STRIPE_PRICE_ADDON_EXTRA_APP'),
      extra_reports: env('STRIPE_PRICE_ADDON_EXTRA_REPORTS'),
    },
  },
  smtp: {
    url: env('SMTP_URL'),
    from: env('SMTP_FROM', 'Lumora <reports@lumora.app>'),
  },
  /** Speech-to-text for AI Powered voice transcripts: 'deepgram' or 'openai'. */
  transcription: {
    provider: env('LUMORA_STT_PROVIDER', 'deepgram'),
    deepgramKey: env('DEEPGRAM_API_KEY'),
    openaiKey: env('OPENAI_API_KEY'),
  },
  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('LUMORA_AI_MODEL', 'claude-opus-5-5'),
  },
  trialDays: Number(env('LUMORA_TRIAL_DAYS', '14')),
};

export const billingEnabled = () => !!config.stripe.secretKey;
