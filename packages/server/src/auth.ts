import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { one, run } from './db';
import { randomToken, sha256 } from './lib/crypto';
import { HttpError } from './services';

const COOKIE = 'lumora_session';
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  accountId: string;
  email: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function startSession(res: Response, userId: string): void {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    expires,
    path: '/',
  });
}

export function endSession(req: Request, res: Response): void {
  const token = readCookie(req, COOKIE);
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function loadUser(req: Request, _res: Response, next: NextFunction): void {
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = one<{ id: string; account_id: string; email: string; name: string; expires_at: string }>(
      `SELECT u.id, u.account_id, u.email, u.name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      sha256(token),
    );
    if (row && new Date(row.expires_at) > new Date()) req.user = { id: row.id, accountId: row.account_id, email: row.email, name: row.name };
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Please sign in'));
  next();
}

/**
 * CSRF guard for cookie-authenticated endpoints: state-changing requests must be JSON,
 * which a cross-site HTML form cannot send without a CORS preflight.
 */
export function requireJsonForMutations(req: Request, _res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return next(new HttpError(415, 'Expected application/json'));
  }
  next();
}
