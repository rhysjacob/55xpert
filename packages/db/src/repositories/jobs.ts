import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { Job, JobStatus, JobAcceptance } from '@corexpert/core';

export class JobsRepository {
  async create(job: Job): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.JOBS,
        Item: job,
        ConditionExpression: 'attribute_not_exists(jobId)',
      }),
    );
  }

  async getById(jobId: string): Promise<Job | undefined> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.JOBS,
        Key: { jobId },
      }),
    );
    return result.Item as Job | undefined;
  }

  async getByCaseId(caseId: string): Promise<Job | undefined> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.JOBS,
        IndexName: GSI.JOBS_CASE,
        KeyConditionExpression: 'caseId = :caseId',
        ExpressionAttributeValues: { ':caseId': caseId },
        Limit: 1,
      }),
    );
    return result.Items?.[0] as Job | undefined;
  }

  async listByStatus(
    status: JobStatus,
    limit = 20,
    lastKey?: Record<string, unknown>,
  ): Promise<{ items: Job[]; lastKey?: Record<string, unknown> }> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.JOBS,
        IndexName: GSI.JOBS_STATUS_PUBLISHED,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      }),
    );
    return {
      items: (result.Items ?? []) as Job[],
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Accept a job using a conditional write (fastest finger wins).
   * Returns true if accepted, false if already taken.
   */
  /**
   * Release an acceptance that was never paid for, returning the job to the
   * Xchange.
   *
   * Conditional on the job still being ACCEPTED by the same acceptance (matched
   * on acceptedAt) and still carrying no paymentId — the Stripe success webhook
   * sets `acceptance.paymentId`, so a payment landing between the sweep read and
   * this write fails the condition and the paid job is left alone.
   *
   * Returns true if released, false if it was paid or re-accepted meanwhile.
   */
  async releaseUnpaidAcceptance(jobId: string, acceptedAt: string): Promise<boolean> {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.JOBS,
          Key: { jobId },
          UpdateExpression: 'SET #status = :open, acceptance = :empty, updatedAt = :now',
          ConditionExpression:
            '#status = :accepted AND acceptance.acceptedAt = :acceptedAt AND attribute_not_exists(acceptance.paymentId)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':open': 'OPEN',
            ':accepted': 'ACCEPTED',
            ':acceptedAt': acceptedAt,
            ':empty': null,
            ':now': new Date().toISOString(),
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }

  /** Record the Stripe match-fee invoice-item id on an accepted job. */
  async setMatchFeeInvoiceItem(jobId: string, invoiceItemId: string): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.JOBS,
        Key: { jobId },
        UpdateExpression: 'SET acceptance.matchFeeInvoiceItemId = :id, updatedAt = :now',
        ExpressionAttributeValues: { ':id': invoiceItemId, ':now': new Date().toISOString() },
      }),
    );
  }

  /**
   * Manually push a job to one or more organisations (admin override, TRX-20).
   * Sets the full pushed-org list; those orgs then see the job regardless of
   * automatic matching. Only valid while the job is still OPEN.
   */
  async setPushedOrganisations(jobId: string, organisationIds: string[]): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.JOBS,
        Key: { jobId },
        UpdateExpression: 'SET pushedOrganisationIds = :ids, updatedAt = :now',
        ConditionExpression: '#status = :open',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':ids': organisationIds,
          ':open': 'OPEN',
          ':now': new Date().toISOString(),
        },
      }),
    );
  }

  /**
   * Expire an OPEN job (TRX-10 sweeper). Conditional on it still being OPEN so
   * a job accepted between the sweep read and this write is left alone. Returns
   * true if it was expired, false if it was no longer OPEN.
   */
  async expireJob(jobId: string): Promise<boolean> {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.JOBS,
          Key: { jobId },
          UpdateExpression: 'SET #status = :expired, updatedAt = :now',
          ConditionExpression: '#status = :open',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':expired': 'EXPIRED', ':open': 'OPEN', ':now': new Date().toISOString() },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async acceptJob(jobId: string, acceptance: JobAcceptance): Promise<boolean> {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.JOBS,
          Key: { jobId },
          UpdateExpression: 'SET #status = :accepted, acceptance = :acceptance',
          ConditionExpression: '#status = :open',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':accepted': 'ACCEPTED',
            ':open': 'OPEN',
            ':acceptance': acceptance,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }
}
