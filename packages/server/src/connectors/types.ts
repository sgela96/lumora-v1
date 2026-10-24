import type { IntegrationType, ReportPayload } from '@lumora/shared';
import type { Attachment } from '../lib/ticket';

export interface ConnectorField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'email';
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface LocalFile {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export interface DeliveryContext {
  ticketId: string;
  reference: string;
  title: string;
  /** Markdown, including attachment links. */
  description: string;
  category?: string;
  payload: ReportPayload;
  aiSummary?: string;
  files: LocalFile[];
  attachments: Attachment[];
  dashboardUrl: string;
}

export interface DeliveryResult {
  externalId?: string;
  url?: string;
}

export type ConnectorConfig = Record<string, string>;

export interface Connector {
  type: IntegrationType;
  label: string;
  description: string;
  fields: ConnectorField[];
  send(ctx: DeliveryContext, config: ConnectorConfig): Promise<DeliveryResult>;
  /** Cheap authenticated call to validate credentials from the dashboard. */
  test(config: ConnectorConfig): Promise<string>;
}
