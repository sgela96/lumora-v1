import { createHash } from 'node:crypto';
import type { ReportPayload } from '@lumora/shared';

export interface IssueSignature {
  /** Stable hash: reports with the same root symptom share it. */
  fingerprint: string;
  /** Human label of the group ("TypeError: Cannot read properties of undefined…"). */
  label: string;
}

/**
 * Groups similar reports into one "issue": the first console error wins, then the first failed
 * request, then category + page. Volatile parts (ids, numbers, URLs, quoted values) are stripped
 * so the same bug reported by many users lands in the same group.
 */
export function issueSignature(payload: ReportPayload, category?: string | null): IssueSignature {
  const error = payload.console?.find((e) => e.level === 'error');
  if (error) {
    const label = firstLine(error.message.replace(/^(Uncaught\s+(\(in promise\)\s+)?)+/i, ''));
    return { fingerprint: hash(`err:${normalize(label)}`), label: truncate(stripLocation(label)) };
  }
  const failed = payload.network?.find((n) => !n.ok);
  if (failed) {
    const route = normalizePath(pathOf(failed.url));
    const label = `${failed.method} ${route} → ${failed.status || 'network error'}`;
    return { fingerprint: hash(`net:${label}`), label };
  }
  const page = normalizePath(pathOf(payload.environment?.url ?? ''));
  const label = `${category || 'Report'} on ${page || 'unknown page'}`;
  return { fingerprint: hash(`page:${label.toLowerCase()}`), label };
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0];
  }
}

/** /orders/8812/items/af3c… → /orders/:id/items/:id */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f-]{8,}$/i.test(seg) || /^[A-Za-z0-9_-]{20,}$/.test(seg) ? ':id' : seg))
    .join('/');
}

function normalize(message: string): string {
  return stripLocation(message)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/(["'`]).*?\1/g, 'STR')
    .replace(/\b[0-9a-f]{8,}\b/g, 'ID')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLocation(message: string): string {
  return message.replace(/\s*\((?:https?:|file:|webpack:)[^)]*\)\s*$/, '').trim();
}

function firstLine(text: string): string {
  return text.split('\n')[0].trim();
}

function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
