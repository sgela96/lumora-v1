import { readFile } from 'node:fs/promises';
import type { LocalFile } from './types';

export class ConnectorError extends Error {}

/** fetch() that throws a readable error including the remote API's message. */
export async function request<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ConnectorError(`Could not reach ${new URL(url).host}: ${error instanceof Error ? error.message : error}`);
  }
  const text = await res.text();
  if (!res.ok) throw new ConnectorError(`${new URL(url).host} answered ${res.status}: ${summarize(text)}`);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function summarize(body: string): string {
  try {
    const json = JSON.parse(body);
    const msg = json.errorMessages?.join(', ') || json.errors && JSON.stringify(json.errors) || json.error?.message || json.error_description || json.message || json.error || json.description;
    if (msg) return String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 300);
    if (Array.isArray(json) && json[0]?.message) return String(json[0].message).slice(0, 300);
  } catch {
    // not JSON
  }
  return body.slice(0, 300) || 'no details';
}

export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

export async function fileBlob(file: LocalFile): Promise<Blob> {
  return new Blob([await readFile(file.path)], { type: file.mime });
}

export function required(config: Record<string, string>, ...keys: string[]): void {
  const missing = keys.filter((k) => !config[k]?.trim());
  if (missing.length) throw new ConnectorError(`Missing configuration: ${missing.join(', ')}`);
}

export function normalizeBaseUrl(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new ConnectorError('URL must use https');
  return url.origin;
}
