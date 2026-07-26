import { PutCommand, ScanCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { Complaint } from '@corexpert/core';

/**
 * Complaints logged against repairers (TRX-24). Low volume, admin-managed — a
 * Scan powers the admin list; the org GSI supports an org-scoped lookup.
 */
export class ComplaintsRepository {
  async create(complaint: Complaint): Promise<void> {
    await docClient.send(new PutCommand({ TableName: TABLES.COMPLAINTS, Item: complaint }));
  }

  async getById(complaintId: string): Promise<Complaint | undefined> {
    const result = await docClient.send(new GetCommand({ TableName: TABLES.COMPLAINTS, Key: { complaintId } }));
    return result.Item as Complaint | undefined;
  }

  /** All complaints, newest first. */
  async list(limit = 500): Promise<Complaint[]> {
    const result = await docClient.send(new ScanCommand({ TableName: TABLES.COMPLAINTS, Limit: limit }));
    const items = (result.Items ?? []) as Complaint[];
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Complaints against one organisation, newest first (org GSI). */
  async listByOrganisation(organisationId: string): Promise<Complaint[]> {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.COMPLAINTS,
      IndexName: GSI.COMPLAINTS_ORG,
      KeyConditionExpression: 'organisationId = :o',
      ExpressionAttributeValues: { ':o': organisationId },
      ScanIndexForward: false,
    }));
    return (result.Items ?? []) as Complaint[];
  }

  /** Patch mutable fields (status assessment, note). */
  async update(complaintId: string, patch: Partial<Pick<Complaint, 'status' | 'note' | 'resolvedAt' | 'updatedAt'>>): Promise<void> {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const sets: string[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      names[`#${k}`] = k;
      values[`:${k}`] = v;
      sets.push(`#${k} = :${k}`);
    }
    if (!sets.length) return;
    await docClient.send(new UpdateCommand({
      TableName: TABLES.COMPLAINTS,
      Key: { complaintId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }
}
