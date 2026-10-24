import type { IntegrationType } from '@lumora/shared';
import { email, slack, webhook } from './basic';
import { freshdesk, github, jira, linear, salesforce, zendesk } from './helpdesks';
import type { Connector } from './types';

export const CONNECTORS: Record<IntegrationType, Connector> = {
  webhook,
  slack,
  email,
  jira,
  zendesk,
  freshdesk,
  github,
  linear,
  salesforce,
};

export function getConnector(type: string): Connector | undefined {
  return (CONNECTORS as Record<string, Connector>)[type];
}

/** Public description for the dashboard (no functions). */
export function connectorCatalog() {
  return Object.values(CONNECTORS).map(({ type, label, description, fields }) => ({ type, label, description, fields }));
}
