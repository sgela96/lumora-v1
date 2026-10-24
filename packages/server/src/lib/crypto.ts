import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

const encryptionKey = () => createHash('sha256').update(`enc:${config.secret}`).digest();

/** AES-256-GCM for integration credentials at rest. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Signed, expiring links to attachments, so ticket systems can show them without a login. */
export function signFileUrl(ticketId: string, file: string, ttlDays = 90): string {
  const expires = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const sig = createHmac('sha256', config.secret).update(`${ticketId}/${file}/${expires}`).digest('base64url');
  return `${config.publicUrl}/files/${ticketId}/${encodeURIComponent(file)}?e=${expires}&s=${sig}`;
}

export function verifyFileSignature(ticketId: string, file: string, expires: string, sig: string): boolean {
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now() / 1000) return false;
  const expected = createHmac('sha256', config.secret).update(`${ticketId}/${file}/${expires}`).digest();
  const given = Buffer.from(sig, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
