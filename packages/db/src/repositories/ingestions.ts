import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { docClient } from '../client';
import { TABLES } from '../tables';
import type { IngestionRecord, IngestionStatus, RejectionReason } from '@corexpert/core';

/**
 * Ingested-job records (TRX-14/79/36). Keyed by warrantyCompanyId (PK) +
 * externalRef (SK): the composite is the dedupe key, and a company's feed is a
 * direct query. Holds the status/reason the company polls back.
 */
export class IngestionsRepository {
  /**
   * Claim an externalRef for a company. Conditional on the pair not already
   * existing — returns false if this is a duplicate re-send (TRX-5 dedupe).
   */
  async claim(record: IngestionRecord): Promise<boolean> {
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.INGESTIONS,
          Item: record,
          ConditionExpression: 'attribute_not_exists(warrantyCompanyId) AND attribute_not_exists(externalRef)',
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return false;
      throw err;
    }
  }

  async get(warrantyCompanyId: string, externalRef: string): Promise<IngestionRecord | undefined> {
    const result = await docClient.send(
      new GetCommand({ TableName: TABLES.INGESTIONS, Key: { warrantyCompanyId, externalRef } }),
    );
    return result.Item as IngestionRecord | undefined;
  }

  /** A company's ingestion feed, newest first (TRX-36 feedback). */
  async listByCompany(warrantyCompanyId: string, limit = 50): Promise<IngestionRecord[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.INGESTIONS,
        KeyConditionExpression: 'warrantyCompanyId = :c',
        ExpressionAttributeValues: { ':c': warrantyCompanyId },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (result.Items ?? []) as IngestionRecord[];
  }

  /** Update status (+ caseId, or rejection reason/detail). Bumps updatedAt. */
  async setStatus(
    warrantyCompanyId: string,
    externalRef: string,
    status: IngestionStatus,
    extra?: { caseId?: string; rejectionReason?: RejectionReason; rejectionDetail?: string },
  ): Promise<void> {
    const sets = ['#status = :s', 'updatedAt = :now'];
    const values: Record<string, unknown> = { ':s': status, ':now': new Date().toISOString() };
    if (extra?.caseId !== undefined) {
      sets.push('caseId = :caseId');
      values[':caseId'] = extra.caseId;
    }
    if (extra?.rejectionReason !== undefined) {
      sets.push('rejectionReason = :rr');
      values[':rr'] = extra.rejectionReason;
    }
    if (extra?.rejectionDetail !== undefined) {
      sets.push('rejectionDetail = :rd');
      values[':rd'] = extra.rejectionDetail;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.INGESTIONS,
        Key: { warrantyCompanyId, externalRef },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
      }),
    );
  }
}
