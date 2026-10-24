import { INTEGRATION_CATEGORIES, type IntegrationCategory, type IntegrationType } from '@lumora/shared';
import { email, slack, webhook } from './basic';
import { freshservice, hubspot, servicenow } from './enterprise';
import { freshdesk, github, jira, linear, salesforce, zendesk } from './helpdesks';
import { asana, azureDevops, clickup, gitlab, shortcut, trello, youtrack } from './trackers';
import type { Connector } from './types';

export const CONNECTORS: Record<IntegrationType, Connector> = {
  webhook,
  slack,
  email,
  jira,
  azure_devops: azureDevops,
  github,
  gitlab,
  linear,
  clickup,
  asana,
  shortcut,
  youtrack,
  trello,
  zendesk,
  freshdesk,
  hubspot,
  salesforce,
  servicenow,
  freshservice,
};

export function getConnector(type: string): Connector | undefined {
  return (CONNECTORS as Record<string, Connector>)[type];
}

function categoryOf(type: IntegrationType): IntegrationCategory {
  const entry = (Object.entries(INTEGRATION_CATEGORIES) as [IntegrationCategory, { types: IntegrationType[] }][]).find(([, c]) => c.types.includes(type));
  return entry?.[0] ?? 'messaging';
}

/** Public description for the dashboard (no functions). */
export function connectorCatalog() {
  return Object.values(CONNECTORS).map(({ type, label, description, fields, fetchStatus }) => ({
    type,
    label,
    description,
    fields,
    category: categoryOf(type),
    syncsStatus: typeof fetchStatus === 'function',
  }));
}
