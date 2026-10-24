// Best-effort scrubbing of personal data and secrets from captured text.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 13–19 digits optionally separated by spaces or dashes (card numbers).
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const SECRET_PARAM = /([?&;](?:token|access_token|id_token|refresh_token|api_key|apikey|key|secret|password|pass|pwd|auth|signature|sig|code)=)[^&#\s)'":]*/gi;

export function redactText(input: string): string {
  return input
    .replace(JWT, '[jwt]')
    .replace(BEARER, '$1 [redacted]')
    .replace(SECRET_PARAM, '$1[redacted]')
    .replace(EMAIL, '[email]')
    .replace(CARD, '[card]');
}

/** Redacts secrets in query strings but keeps the URL readable. */
export function redactUrl(url: string): string {
  return url.replace(SECRET_PARAM, '$1[redacted]').replace(EMAIL, '[email]');
}
