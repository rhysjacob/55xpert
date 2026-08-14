import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { Case, CaseStatus } from '@corexpert/core';

export class CasesRepository {
  async create(caseData: Case): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.CASES,
        Item: caseData,
        ConditionExpression: 'attribute_not_exists(caseId)',
      }),
    );
  }

  async getById(caseId: string): Promise<Case | undefined> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.CASES,
        Key: { caseId },
      }),
    );
    return result.Item as Case | undefined;
  }

  async listByUser(
    userId: string,
    limit = 20,
    lastKey?: Record<string, unknown>,
  ): Promise<{ items: Case[]; lastKey?: Record<string, unknown> }> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.CASES,
        IndexName: GSI.CASES_USER_CREATED,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      }),
    );
    return {
      items: (result.Items ?? []) as Case[],
      lastKey: result.LastEvaluatedKey,
    };
  }

  async listByStatus(
    status: CaseStatus,
    limit = 20,
    lastKey?: Record<string, unknown>,
  ): Promise<{ items: Case[]; lastKey?: Record<string, unknown> }> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.CASES,
        IndexName: GSI.CASES_STATUS_CREATED,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      }),
    );
    return {
      items: (result.Items ?? []) as Case[],
      lastKey: result.LastEvaluatedKey,
    };
  }

  async updateStatus(caseId: string, status: CaseStatus): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.CASES,
        Key: { caseId },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':now': new Date().toISOString(),
        },
      }),
    );
  }

  /**
   * Record that the consumer asked for their case to be allocated to one of the
   * warranty company's sites. Returns the timestamp that is now on the case —
   * the existing one if it had already been requested, so a double-click (or a
   * retried request) cannot raise the hand-off twice.
   */
  async markSiteAllocationRequested(caseId: string): Promise<string> {
    const now = new Date().toISOString();
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.CASES,
          Key: { caseId },
          UpdateExpression: 'SET siteAllocationRequestedAt = :now, updatedAt = :now',
          ConditionExpression: 'attribute_not_exists(siteAllocationRequestedAt)',
          ExpressionAttributeValues: { ':now': now },
        }),
      );
      return now;
    } catch (err) {
      if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
      const existing = await this.getById(caseId);
      return existing?.siteAllocationRequestedAt ?? now;
    }
  }

  async updateTriageResult(
    caseId: string,
    triageResult: Case['triageResult'],
    status: CaseStatus,
    /** Optional: overwrite the images array too (e.g. with forensics attached). */
    images?: Case['images'],
  ): Promise<void> {
    const values: Record<string, unknown> = {
      ':triage': triageResult,
      ':status': status,
      ':now': new Date().toISOString(),
    };
    let expr = 'SET triageResult = :triage, #status = :status, updatedAt = :now';
    if (images) {
      expr += ', images = :images';
      values[':images'] = images;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.CASES,
        Key: { caseId },
        UpdateExpression: expr,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
      }),
    );
  }

  async addImage(caseId: string, image: Case['images'][number]): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.CASES,
        Key: { caseId },
        UpdateExpression: 'SET images = list_append(if_not_exists(images, :empty), :img), updatedAt = :now',
        ExpressionAttributeValues: {
          ':img': [image],
          ':empty': [],
          ':now': new Date().toISOString(),
        },
      }),
    );
  }
}
