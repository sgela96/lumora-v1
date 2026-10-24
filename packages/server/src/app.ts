import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { MulterError } from 'multer';
import { loadUser } from './auth';
import { config } from './config';
import { one } from './db';
import { verifyFileSignature } from './lib/crypto';
import { appRouter, sendFile } from './routes/app';
import { billingRouter, stripeWebhookRouter } from './routes/billing';
import { statusHookRouter } from './routes/center';
import { widgetRouter } from './routes/widget';
import { HttpError, uploadsDir } from './services';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // The embeddable script: cached briefly so fixes roll out fast.
  app.get(['/lumora.js', '/lumora.js.map'], (req, res) => {
    const file = path.join(config.widgetDist, path.basename(req.path));
    if (!existsSync(file)) throw new HttpError(404, 'Widget not built. Run `npm run build`.');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(file);
  });

  app.use('/api/billing/webhook', stripeWebhookRouter());
  app.use('/api/hooks/status', statusHookRouter());
  app.use('/api/widget', widgetRouter());

  app.use(express.json({ limit: '1mb' }));
  app.use(loadUser);
  app.use('/api/billing', billingRouter());
  app.use('/api', appRouter());

  // Signed links used inside tickets (Jira/Slack/GitHub…) — no login required, expire.
  app.get('/files/:ticketId/:file', async (req, res) => {
    const { ticketId, file } = req.params;
    if (!verifyFileSignature(ticketId, file, String(req.query.e ?? ''), String(req.query.s ?? ''))) throw new HttpError(403, 'Link expired or invalid');
    const ticket = one<{ screenshot_file: string | null; recording_file: string | null }>('SELECT screenshot_file, recording_file FROM tickets WHERE id = ?', ticketId);
    if (!ticket || (file !== ticket.screenshot_file && file !== ticket.recording_file)) throw new HttpError(404, 'File not found');
    await sendFile(req, res, path.join(uploadsDir(), ticketId, file));
  });

  // Dashboard (single-page app) and the demo page.
  app.use('/app', express.static(config.dashboardDist, { index: 'index.html', maxAge: '5m' }));
  // Fake backend for the demo page, so it can produce failing requests.
  app.all('/demo/api/{*rest}', (req, res) => {
    if (req.path.includes('/invoices/')) res.status(404).json({ error: 'Invoice not found' });
    else res.status(500).json({ error: 'Internal Server Error' });
  });
  app.use('/demo', express.static(config.demoDir));
  // Marketing website at the root.
  app.use('/', express.static(config.siteDir, { index: 'index.html', maxAge: '5m' }));

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof MulterError) {
      res.status(413).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `Files can be up to ${config.maxUploadMb} MB` : error.message });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });

  return app;
}
