import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { Payment, PaymentStatus } from '@corexpert/core';

export class PaymentsRepository {
  async create(payment: Payment): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.PAYMENTS,
        Item: payment,
      }),
    );
  }

  async getById(paymentId: string): Promise<Payment | undefined> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.PAYMENTS,
        Key: { paymentId },
      }),
    );
    return result.Item as Payment | undefined;
  }

  async getByStripePaymentIntentId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.PAYMENTS,
        IndexName: GSI.PAYMENTS_STRIPE,
        KeyConditionExpression: 'stripePaymentIntentId = :id',
        ExpressionAttributeValues: { ':id': stripePaymentIntentId },
        Limit: 1,
      }),
    );
    return result.Items?.[0] as Payment | undefined;
  }

  async getByJobId(jobId: string): Promise<Payment | undefined> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.PAYMENTS,
        IndexName: GSI.PAYMENTS_JOB,
        KeyConditionExpression: 'jobId = :jobId',
        ExpressionAttributeValues: { ':jobId': jobId },
        Limit: 1,
      }),
    );
    return result.Items?.[0] as Payment | undefined;
  }

  async updateStatus(paymentId: string, status: PaymentStatus, paidAt?: string): Promise<void> {
    const updateParts = ['#status = :status'];
    const values: Record<string, unknown> = { ':status': status };
    if (paidAt) {
      updateParts.push('paidAt = :paidAt');
      values[':paidAt'] = paidAt;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.PAYMENTS,
        Key: { paymentId },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
      }),
    );
  }
}
