import type { ReportPayload, WidgetConfig } from '@lumora/shared';

export interface SubmitResult {
  id: string;
  reference: string;
  externalUrl?: string;
}

export class LumoraApi {
  constructor(private base: string, private key: string) {}

  async config(): Promise<WidgetConfig> {
    const res = await fetch(`${this.base}/api/widget/config?key=${encodeURIComponent(this.key)}`, { credentials: 'omit' });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.json();
  }

  async submit(payload: ReportPayload, files: { screenshot?: Blob; recording?: Blob }): Promise<SubmitResult> {
    const form = new FormData();
    form.append('key', this.key);
    form.append('payload', JSON.stringify(payload));
    if (files.screenshot) form.append('screenshot', files.screenshot, 'screenshot.png');
    if (files.recording) {
      const ext = files.recording.type.includes('mp4') ? 'mp4' : 'webm';
      form.append('recording', files.recording, `recording.${ext}`);
    }
    // The key also goes in the URL so the server's rate limit can count per app before reading the upload.
    const res = await fetch(`${this.base}/api/widget/reports?key=${encodeURIComponent(this.key)}`, { method: 'POST', body: form, credentials: 'omit' });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.json();
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
