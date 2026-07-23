import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '../client';
import { TABLES, GSI } from '../tables';
import type { User, UserRole, RepairerProfile } from '@corexpert/core';

export class UsersRepository {
  async create(user: User): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.USERS,
        Item: user,
        ConditionExpression: 'attribute_not_exists(userId)',
      }),
    );
  }

  async getById(userId: string): Promise<User | undefined> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.USERS,
        Key: { userId },
      }),
    );
    return result.Item as User | undefined;
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: GSI.USERS_EMAIL,
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
        Limit: 1,
      }),
    );
    return result.Items?.[0] as User | undefined;
  }

  async listByRole(
    role: UserRole,
    limit = 50,
    lastKey?: Record<string, unknown>,
  ): Promise<{ items: User[]; lastKey?: Record<string, unknown> }> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: GSI.USERS_ROLE,
        KeyConditionExpression: '#role = :role',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':role': role },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      }),
    );
    return {
      items: (result.Items ?? []) as User[],
      lastKey: result.LastEvaluatedKey,
    };
  }

  /** All users belonging to a repairer organisation (members). */
  async listByOrganisation(organisationId: string): Promise<User[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: GSI.USERS_ORG,
        KeyConditionExpression: 'organisationId = :o',
        ExpressionAttributeValues: { ':o': organisationId },
      }),
    );
    return (result.Items ?? []) as User[];
  }

  /**
   * Set a repairer's subscription id + status (read-modify-write on the nested
   * profile). No-op if the user has no repairer profile.
   */
  async setRepairerSubscription(
    userId: string,
    subscriptionId: string,
    status: NonNullable<RepairerProfile['subscriptionStatus']>,
  ): Promise<void> {
    const user = await this.getById(userId);
    if (!user?.repairer) return;
    const repairer: RepairerProfile = {
      ...user.repairer,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: status,
    };
    await this.update(userId, { repairer });
  }

  async update(userId: string, updates: Partial<User>): Promise<void> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'userId') continue;
      const attrName = `#${key}`;
      const attrValue = `:${key}`;
      expressions.push(`${attrName} = ${attrValue}`);
      names[attrName] = key;
      values[attrValue] = value;
    }

    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }
}
