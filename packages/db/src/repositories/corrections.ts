import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { Correction } from '@corexpert/core';

/**
 * Store of Xpert corrections — the labelled AI-vs-human dataset used for evals
 * and (later) retrieval-based few-shot prompting.
 */
export class CorrectionsRepository {
  async create(correction: Correction): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.CORRECTIONS,
        Item: correction,
        ConditionExpression: 'attribute_not_exists(correctionId)',
      }),
    );
  }

  async listByCase(caseId: string): Promise<Correction[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.CORRECTIONS,
        IndexName: GSI.CORRECTIONS_CASE,
        KeyConditionExpression: 'caseId = :caseId',
        ExpressionAttributeValues: { ':caseId': caseId },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []) as Correction[];
  }
}
