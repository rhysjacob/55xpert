import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES } from '../tables';
import type { WarrantyCompany } from '@corexpert/core';

/**
 * Warranty companies (tenants) and their rulesets. Small, admin-managed table —
 * a Scan is fine for listing at this cardinality.
 */
export class WarrantyCompaniesRepository {
  async create(company: WarrantyCompany): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.WARRANTY_COMPANIES,
        Item: company,
        ConditionExpression: 'attribute_not_exists(warrantyCompanyId)',
      }),
    );
  }

  async getById(warrantyCompanyId: string): Promise<WarrantyCompany | undefined> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.WARRANTY_COMPANIES,
        Key: { warrantyCompanyId },
      }),
    );
    return result.Item as WarrantyCompany | undefined;
  }

  async list(): Promise<WarrantyCompany[]> {
    const result = await docClient.send(new ScanCommand({ TableName: TABLES.WARRANTY_COMPANIES }));
    return (result.Items ?? []) as WarrantyCompany[];
  }

  /** Patch mutable fields (name, status, scheme). Bumps updatedAt. */
  async update(
    warrantyCompanyId: string,
    patch: Partial<Pick<WarrantyCompany, 'name' | 'status' | 'scheme'>>,
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
      values[':status'] = patch.status;
    }
    if (patch.scheme !== undefined) {
      sets.push('scheme = :scheme');
      values[':scheme'] = patch.scheme;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.WARRANTY_COMPANIES,
        Key: { warrantyCompanyId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(warrantyCompanyId)',
      }),
    );
  }
}
