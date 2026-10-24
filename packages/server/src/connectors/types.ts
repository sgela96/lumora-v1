import type { IntegrationType, ReportPayload, TicketStatus } from '@lumora/shared';
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
  /** Machine id passed back to fetchStatus() (issue key, sys_id, record id…). */
  externalId?: string;
  /** Human reference shown in Lumora when it differs from externalId ("#42", case number…). */
  displayId?: string;
  url?: string;
}

export interface ExternalStatus {
  /** Lumora's normalized workflow status. */
  status: TicketStatus;
  /** The status as the remote tool names it ("In Review", "Pending", "Closed"…). */
  label: string;
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
  /**
   * Reads the current status of a ticket this connector created (externalId as returned by
   * send()). Absent for destinations without a workflow (webhook, Slack, e-mail).
   */
  fetchStatus?(config: ConnectorConfig, externalId: string): Promise<ExternalStatus>;
  /** Creates the status webhook in the remote tool, pointing at `url`. Returns the remote hook id. */
  registerStatusWebhook?(config: ConnectorConfig, url: string): Promise<{ id: string; note?: string }>;
  unregisterStatusWebhook?(config: ConnectorConfig, id: string): Promise<void>;
  /** Steps to add the status webhook by hand, for tools whose API can't create it. */
  webhookGuide?: string[];
}
