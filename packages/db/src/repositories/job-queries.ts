import { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { JobQuery } from '@corexpert/core';

/**
 * Repairer "refer to an expert" queries (TRX-57). A job's thread is a GSI query;
 * the admin/Xpert queue is a small scan sorted newest-first.
 */
export class JobQueriesRepository {
  async create(query: JobQuery): Promise<void> {
    await docClient.send(new PutCommand({ TableName: TABLES.JOB_QUERIES, Item: query }));
  }

  async getById(queryId: string): Promise<JobQuery | undefined> {
    const result = await docClient.send(new GetCommand({ TableName: TABLES.JOB_QUERIES, Key: { queryId } }));
    return result.Item as JobQuery | undefined;
  }

  /** A single job's query thread, newest first. */
  async listByJob(jobId: string): Promise<JobQuery[]> {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.JOB_QUERIES,
      IndexName: GSI.JOB_QUERIES_JOB,
      KeyConditionExpression: 'jobId = :j',
      ExpressionAttributeValues: { ':j': jobId },
    }));
    return ((result.Items ?? []) as JobQuery[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** All queries, newest first (admin/Xpert queue). */
  async list(limit = 500): Promise<JobQuery[]> {
    const result = await docClient.send(new ScanCommand({ TableName: TABLES.JOB_QUERIES, Limit: limit }));
    return ((result.Items ?? []) as JobQuery[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(queryId: string, patch: Partial<Pick<JobQuery, 'status' | 'response' | 'answeredBy' | 'answeredAt' | 'updatedAt'>>): Promise<void> {
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
      TableName: TABLES.JOB_QUERIES,
      Key: { queryId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }
}
