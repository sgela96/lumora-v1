import type { Router, Request } from 'express';
import { startSession } from '../auth';
import { config } from '../config';
import { all, one, run, transaction } from '../db';
import { hashPassword, id, randomToken, sha256 } from '../lib/crypto';
import { inviteMail, inviteUrl, sendMail } from '../lib/mail';
import { accountLimits, getAccount, HttpError, ROLES, type Role } from '../services';

// The organization: who's in it, their role, invitations and seats.
// Owner: everything, including roles and organization-wide defaults. Admin: invites and removes people.

const INVITE_DAYS = 7;
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

interface InviteRow {
  id: string;
  account_id: string;
  email: string;
  role: Role;
  token_hash: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
}

function canManage(req: Request): boolean {
  return req.user!.role === 'owner' || req.user!.role === 'admin';
}

function requireManager(req: Request): void {
  if (!canManage(req)) throw new HttpError(403, 'Only the owner or an admin can manage people');
}

function seatsUsed(accountId: string): number {
  const members = one<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE account_id = ?', accountId)!.n;
  const invites = one<{ n: number }>('SELECT COUNT(*) AS n FROM invites WHERE account_id = ? AND expires_at > ?', accountId, new Date().toISOString())!.n;
  return members + invites;
}

function organization(req: Request) {
  const account = getAccount(req.user!.accountId);
  const limits = accountLimits(account);
  const members = all<{ id: string; name: string; email: string; role: Role; last_seen_at: string | null; created_at: string }>(
    "SELECT id, name, email, role, last_seen_at, created_at FROM users WHERE account_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at",
    account.id,
  );
  const invites = all<InviteRow & { inviter: string | null }>(
    'SELECT i.*, u.name AS inviter FROM invites i LEFT JOIN users u ON u.id = i.invited_by WHERE i.account_id = ? ORDER BY i.created_at DESC',
    account.id,
  );
  return {
    id: account.id,
    name: account.name,
    createdAt: account.created_at,
    seats: { used: seatsUsed(account.id), limit: limits.seats },
    you: { id: req.user!.id, role: req.user!.role, canManage: canManage(req) },
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, lastSeenAt: m.last_seen_at, joinedAt: m.created_at })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, invitedBy: i.inviter, sentAt: i.created_at, expiresAt: i.expires_at, expired: i.expires_at <= new Date().toISOString() })),
    emailAvailable: !!config.smtp.url,
  };
}

/** Routes that need a signed-in user. */
export function orgRoutes(router: Router): void {
  router.get('/org', (req, res) => {
    res.json(organization(req));
  });

  router.patch('/org', (req, res) => {
    requireManager(req);
    const name = str(req.body?.name, 100);
    if (!name) throw new HttpError(400, 'Give the organization a name');
    run('UPDATE accounts SET name = ? WHERE id = ?', name, req.user!.accountId);
    res.json(organization(req));
  });

  router.post('/org/invites', async (req, res) => {
    requireManager(req);
    const account = getAccount(req.user!.accountId);
    const email = str(req.body?.email, 200).toLowerCase();
    const role = (str(req.body?.role, 20) || 'member') as Role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid e-mail');
    if (role === 'owner' || !ROLES.includes(role)) throw new HttpError(400, 'Invite people as an admin or a member');
    if (role === 'admin' && req.user!.role !== 'owner') throw new HttpError(403, 'Only the owner can invite admins');
    const existing = one<{ account_id: string }>('SELECT account_id FROM users WHERE email = ?', email);
    if (existing) throw new HttpError(409, existing.account_id === account.id ? 'This person is already in your organization' : 'This e-mail already has a Lumora account in another organization');
    // Re-inviting the same e-mail replaces the pending invitation (and doesn't use another seat).
    run('DELETE FROM invites WHERE account_id = ? AND email = ?', account.id, email);
    const limit = accountLimits(account).seats;
    if (seatsUsed(account.id) >= limit) throw new HttpError(402, `Your plan includes ${limit} seats. Upgrade to invite more people.`, 'upgrade');

    const token = randomToken();
    const inviteId = id('inv');
    run(
      'INSERT INTO invites (id, account_id, email, role, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      inviteId,
      account.id,
      email,
      role,
      sha256(token),
      req.user!.id,
      new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(),
    );
    void sendMail(inviteMail(email, account.name, req.user!.name, token));
    // The link is returned too, so it can be shared by hand when e-mail isn't set up.
    res.status(201).json({ id: inviteId, link: inviteUrl(token), organization: organization(req) });
  });

  /** A fresh link (and e-mail) for a pending invitation; the old link stops working. */
  router.post('/org/invites/:id/resend', async (req, res) => {
    requireManager(req);
    const invite = one<InviteRow>('SELECT * FROM invites WHERE id = ? AND account_id = ?', String(req.params.id), req.user!.accountId);
    if (!invite) throw new HttpError(404, 'Invitation not found');
    const token = randomToken();
    run('UPDATE invites SET token_hash = ?, expires_at = ?, created_at = datetime(\'now\') WHERE id = ?', sha256(token), new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(), invite.id);
    void sendMail(inviteMail(invite.email, getAccount(invite.account_id).name, req.user!.name, token));
    res.json({ link: inviteUrl(token), organization: organization(req) });
  });

  router.delete('/org/invites/:id', (req, res) => {
    requireManager(req);
    run('DELETE FROM invites WHERE id = ? AND account_id = ?', String(req.params.id), req.user!.accountId);
    res.json(organization(req));
  });

  router.patch('/org/members/:id', (req, res) => {
    if (req.user!.role !== 'owner') throw new HttpError(403, 'Only the owner can change roles');
    const member = one<{ id: string; role: Role }>('SELECT id, role FROM users WHERE id = ? AND account_id = ?', String(req.params.id), req.user!.accountId);
    if (!member) throw new HttpError(404, 'Person not found');
    const role = str(req.body?.role, 20) as Role;
    if (!ROLES.includes(role)) throw new HttpError(400, 'Unknown role');
    if (role === 'owner') {
      // Handing over ownership: the current owner becomes an admin.
      if (member.id === req.user!.id) throw new HttpError(400, 'You already own this organization');
      transaction(() => {
        run("UPDATE users SET role = 'admin' WHERE id = ?", req.user!.id);
        run("UPDATE users SET role = 'owner' WHERE id = ?", member.id);
      });
      req.user!.role = 'admin';
    } else {
      if (member.id === req.user!.id) throw new HttpError(400, 'Make someone else the owner first');
      run('UPDATE users SET role = ? WHERE id = ?', role, member.id);
    }
    res.json(organization(req));
  });

  router.delete('/org/members/:id', (req, res) => {
    requireManager(req);
    const member = one<{ id: string; role: Role }>('SELECT id, role FROM users WHERE id = ? AND account_id = ?', String(req.params.id), req.user!.accountId);
    if (!member) throw new HttpError(404, 'Person not found');
    if (member.role === 'owner') throw new HttpError(400, 'The owner can’t be removed');
    if (member.id === req.user!.id) throw new HttpError(400, 'You can’t remove yourself');
    if (member.role === 'admin' && req.user!.role !== 'owner') throw new HttpError(403, 'Only the owner can remove an admin');
    // Sessions go with the user (ON DELETE CASCADE): they are signed out right away.
    run('DELETE FROM users WHERE id = ?', member.id);
    res.json(organization(req));
  });
}

/** Routes for people who aren't signed in yet: look at an invitation and accept it. */
export function invitePublicRoutes(router: Router): void {
  const findInvite = (token: unknown) => {
    const invite = one<InviteRow>('SELECT * FROM invites WHERE token_hash = ?', sha256(String(token ?? '')));
    if (!invite || invite.expires_at <= new Date().toISOString()) throw new HttpError(404, 'This invitation has expired or was already used. Ask for a new one.');
    return invite;
  };

  router.get('/invites/:token', (req, res) => {
    const invite = findInvite(req.params.token);
    const inviter = invite.invited_by ? one<{ name: string }>('SELECT name FROM users WHERE id = ?', invite.invited_by) : null;
    res.json({ email: invite.email, organization: getAccount(invite.account_id).name, invitedBy: inviter?.name ?? null, role: invite.role });
  });

  router.post('/invites/:token/accept', async (req, res) => {
    const invite = findInvite(req.params.token);
    const name = str(req.body?.name, 100);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!name) throw new HttpError(400, 'Tell us your name');
    if (password.length < 8) throw new HttpError(400, 'Password must have at least 8 characters');
    if (one('SELECT 1 FROM users WHERE email = ?', invite.email)) throw new HttpError(409, 'An account with this e-mail already exists. Sign in instead.');
    const userId = id('usr');
    const passwordHash = await hashPassword(password);
    transaction(() => {
      run('INSERT INTO users (id, account_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)', userId, invite.account_id, invite.email, name, passwordHash, invite.role);
      run('DELETE FROM invites WHERE id = ?', invite.id);
    });
    startSession(res, userId);
    res.status(201).json({ ok: true });
  });
}
