/** Format checks shared by the back office forms and the API, so both say the same thing. */
export type FieldFormat = 'text' | 'password' | 'url' | 'email';

export function formatError(format: FieldFormat, value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (format === 'url') {
    try {
      const u = new URL(v);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return `${label} must start with https://`;
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return `${label} needs a full address, like https://example.com/hook`;
      return null;
    } catch {
      return /@/.test(v) && !/^https?:/i.test(v)
        ? `${label} looks like an e-mail address. Enter a web address, like https://example.com/hook`
        : `${label} must be a web address, like https://example.com/hook`;
    }
  }
  if (format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `${label} must be an e-mail address, like you@company.com`;
  return null;
}
