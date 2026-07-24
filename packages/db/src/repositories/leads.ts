import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES } from '../tables';
import type { Lead } from '@corexpert/core';

/**
 * Captured marketing leads (TRX-71). Low volume, admin-managed — a Scan is fine
 * for the admin list.
 */
export class LeadsRepository {
  async create(lead: Lead): Promise<void> {
    await docClient.send(new PutCommand({ TableName: TABLES.LEADS, Item: lead }));
  }

  /** All leads, newest first. */
  async list(limit = 200): Promise<Lead[]> {
    const result = await docClient.send(new ScanCommand({ TableName: TABLES.LEADS, Limit: limit }));
    const items = (result.Items ?? []) as Lead[];
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
