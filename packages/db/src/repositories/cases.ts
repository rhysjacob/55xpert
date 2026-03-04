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

  async updateTriageResult(caseId: string, triageResult: Case['triageResult'], status: CaseStatus): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.CASES,
        Key: { caseId },
        UpdateExpression: 'SET triageResult = :triage, #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':triage': triageResult,
          ':status': status,
          ':now': new Date().toISOString(),
        },
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
