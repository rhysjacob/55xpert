import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES } from '../tables';
import type { RepairerOrganisation, RepairerStatus, RepairerCapability } from '@corexpert/core';

/**
 * Repairer organisations (TRX-37/49/52) — the company that groups repairer
 * users, and where capability + coverage + registration status live. Small,
 * admin-managed cardinality, so a Scan is fine for listing.
 */
export class OrganisationsRepository {
  async create(org: RepairerOrganisation): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.ORGANISATIONS,
        Item: org,
        ConditionExpression: 'attribute_not_exists(organisationId)',
      }),
    );
  }

  async getById(organisationId: string): Promise<RepairerOrganisation | undefined> {
    const result = await docClient.send(
      new GetCommand({ TableName: TABLES.ORGANISATIONS, Key: { organisationId } }),
    );
    return result.Item as RepairerOrganisation | undefined;
  }

  async list(): Promise<RepairerOrganisation[]> {
    const result = await docClient.send(new ScanCommand({ TableName: TABLES.ORGANISATIONS }));
    return (result.Items ?? []) as RepairerOrganisation[];
  }

  /** Patch mutable fields (name, status, capability, primary contact). Bumps updatedAt. */
  async update(
    organisationId: string,
    patch: Partial<Pick<RepairerOrganisation, 'name' | 'status' | 'capability' | 'primaryContactUserId'>>,
  ): Promise<void> {
    const sets: string[] = ['updatedAt = :now'];
    const values: Record<string, unknown> = { ':now': new Date().toISOString() };
    const names: Record<string, string> = {};
    if (patch.name !== undefined) {
      sets.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = patch.name;
    }
    if (patch.status !== undefined) {
      sets.push('#status = :status');
      names['#status'] = 'status';
      values[':status'] = patch.status satisfies RepairerStatus;
    }
    if (patch.capability !== undefined) {
      sets.push('capability = :capability');
      values[':capability'] = patch.capability satisfies RepairerCapability;
    }
    if (patch.primaryContactUserId !== undefined) {
      sets.push('primaryContactUserId = :pc');
      values[':pc'] = patch.primaryContactUserId;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.ORGANISATIONS,
        Key: { organisationId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(organisationId)',
      }),
    );
  }
}
