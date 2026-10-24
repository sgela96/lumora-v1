import { unlink } from 'node:fs/promises';
import os from 'node:os';
import type { ReportPayload, WidgetConfig } from '@lumora/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { one, run } from '../db';
import {
  accountLimits,
  accountPlan,
  createTicket,
  effectiveSettings,
  getAccount,
  HttpError,
  monthlyUsage,
  originAllowed,
  type ProjectRow,
  type UploadedFile,
} from '../services';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 2, fields: 5, fieldSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      (file.fieldname === 'screenshot' && file.mimetype === 'image/png') ||
      (file.fieldname === 'recording' && /^video\/(webm|mp4)/.test(file.mimetype));
    cb(null, ok);
  },
});

/** Simple fixed-window rate limit per IP + key, so a public key can't be used to flood an inbox. */
const hits = new Map<string, { count: number; reset: number }>();
function rateLimit(limit: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.query.key ?? req.body?.key ?? ''}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
    else if (++entry.count > limit) return next(new HttpError(429, 'Too many reports, please try again in a few minutes'));
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

function findProject(key: unknown): ProjectRow {
  if (typeof key !== 'string' || !key.startsWith('pk_')) throw new HttpError(400, 'Invalid widget key');
  const project = one<ProjectRow>('SELECT * FROM projects WHERE public_key = ?', key);
  if (!project) throw new HttpError(404, 'Unknown widget key');
  return project;
}

/** The widget runs on customer sites, so CORS is open but checked against the project's allowed origins. */
function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

export function widgetRouter(): Router {
  const router = Router();
  router.use(cors);

  router.get('/config', rateLimit(120, 60_000), (req, res) => {
    const project = findProject(req.query.key);
    if (!originAllowed(project, req.headers.origin)) throw new HttpError(403, 'This site is not allowed to use this widget key');
    const account = getAccount(project.account_id);
    markInstalled(project, req.headers.origin);
    const body: WidgetConfig = { projectName: project.name, plan: accountPlan(account), settings: effectiveSettings(project, accountLimits(account)) };
    // Revalidated on every load (cheap thanks to the ETag) so dashboard changes show up immediately.
    res.setHeader('Cache-Control', 'no-cache');
    res.json(body);
  });

  router.post(
    '/reports',
    rateLimit(10, 10 * 60_000),
    upload.fields([
      { name: 'screenshot', maxCount: 1 },
      { name: 'recording', maxCount: 1 },
    ]),
    async (req, res) => {
      const uploaded = (req.files ?? {}) as Record<string, UploadedFile[]>;
      const files = { screenshot: uploaded.screenshot?.[0], recording: uploaded.recording?.[0] };
      try {
        const project = findProject(req.body?.key);
        if (!originAllowed(project, req.headers.origin)) throw new HttpError(403, 'This site is not allowed to use this widget key');
        const account = getAccount(project.account_id);
        if (monthlyUsage(account.id) >= accountLimits(account).reportsPerMonth) throw new HttpError(429, 'This site reached its monthly report limit');

        const payload = parsePayload(req.body?.payload);
        const ticket = await createTicket(project, account, payload, files);
        res.status(201).json(ticket);
      } finally {
        // Files not moved into a ticket folder are temp files to clean up.
        await Promise.all(Object.values(files).map((f) => (f ? unlink(f.path).catch(() => {}) : undefined)));
      }
    },
  );

  return router;
}

/** The first time the widget loads on the customer's own site, the setup wizard can tick "Installed". */
function markInstalled(project: ProjectRow, origin: string | undefined): void {
  if (!origin || origin === new URL(config.publicUrl).origin) return; // dashboard preview / demo page
  if (project.installed_at && project.installed_origin === origin) return;
  run('UPDATE projects SET installed_at = COALESCE(installed_at, ?), installed_origin = ? WHERE id = ?', new Date().toISOString(), origin, project.id);
}

function parsePayload(raw: unknown): ReportPayload {
  if (typeof raw !== 'string') throw new HttpError(400, 'Missing payload');
  let data: ReportPayload;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid payload');
  }
  if (!data || typeof data !== 'object' || typeof data.fields !== 'object' || !data.fields) throw new HttpError(400, 'Invalid payload');
  if (!['screenshot', 'recording', 'describe'].includes(data.kind)) data.kind = 'describe';
  data.reporter = typeof data.reporter === 'object' && data.reporter ? data.reporter : {};
  data.metadata = typeof data.metadata === 'object' && data.metadata ? data.metadata : {};
  for (const [k, v] of Object.entries(data.fields)) {
    if (typeof v === 'string') data.fields[k] = v.slice(0, 10_000);
    else if (typeof v !== 'boolean') delete data.fields[k];
  }
  for (const list of ['console', 'network', 'breadcrumbs', 'recordingActions'] as const) {
    if (data[list] !== undefined && !Array.isArray(data[list])) delete data[list];
    else if (data[list]) (data as unknown as Record<string, unknown[]>)[list] = data[list]!.slice(-300);
  }
  return data;
}
