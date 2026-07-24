import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { RepairerNetworkLink } from '@corexpert/core';

/**
 * Per-warranty-company repairer networks (TRX-78). Base table keyed by
 * warrantyCompanyId (PK) + organisationId (SK): a company's network lists
 * directly; the organisationId GSI flips it so matching can resolve which
 * companies an org is enabled for.
 */
export class NetworkLinksRepository {
  /** Create or overwrite a link (idempotent upsert). */
  async put(link: RepairerNetworkLink): Promise<void> {
    await docClient.send(new PutCommand({ TableName: TABLES.NETWORK_LINKS, Item: link }));
  }

  /** Toggle a link's enabled flag (admin on/off). Bumps updatedAt. */
  async setEnabled(
    warrantyCompanyId: string,
    organisationId: string,
    enabled: boolean,
  ): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.NETWORK_LINKS,
        Key: { warrantyCompanyId, organisationId },
        UpdateExpression: 'SET enabled = :e, updatedAt = :now',
        ExpressionAttributeValues: { ':e': enabled, ':now': new Date().toISOString() },
      }),
    );
  }

  /** All links for a warranty company (its whole network, enabled or not). */
  async listByCompany(warrantyCompanyId: string): Promise<RepairerNetworkLink[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.NETWORK_LINKS,
        KeyConditionExpression: 'warrantyCompanyId = :c',
        ExpressionAttributeValues: { ':c': warrantyCompanyId },
      }),
    );
    return (result.Items ?? []) as RepairerNetworkLink[];
  }

  /** All links for an organisation (which companies it belongs to). */
  async listByOrganisation(organisationId: string): Promise<RepairerNetworkLink[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.NETWORK_LINKS,
        IndexName: GSI.NETWORK_LINKS_ORG,
        KeyConditionExpression: 'organisationId = :o',
        ExpressionAttributeValues: { ':o': organisationId },
      }),
    );
    return (result.Items ?? []) as RepairerNetworkLink[];
  }

  /**
   * The warranty-company ids an org is linked AND enabled for — the
   * `enabledNetworks` the matcher needs (TRX-78).
   */
  async enabledCompaniesForOrg(organisationId: string): Promise<string[]> {
    const links = await this.listByOrganisation(organisationId);
    return links.filter((l) => l.enabled).map((l) => l.warrantyCompanyId);
  }
}
