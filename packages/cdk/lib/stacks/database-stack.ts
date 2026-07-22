import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments';

export interface DatabaseStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class DatabaseStack extends cdk.Stack {
  public readonly casesTable: dynamodb.Table;
  public readonly jobsTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;
  public readonly paymentsTable: dynamodb.Table;
  public readonly correctionsTable: dynamodb.Table;
  public readonly warrantyCompaniesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { config } = props;
    const removal = config.removalPolicy === 'destroy'
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    // Cases table
    this.casesTable = new dynamodb.Table(this, 'CasesTable', {
      tableName: `corexpert-${config.stage}-cases`,
      partitionKey: { name: 'caseId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.casesTable.addGlobalSecondaryIndex({
      indexName: 'userId-createdAt-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.casesTable.addGlobalSecondaryIndex({
      indexName: 'status-createdAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Jobs table
    this.jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: `corexpert-${config.stage}-jobs`,
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.jobsTable.addGlobalSecondaryIndex({
      indexName: 'status-publishedAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'publishedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.jobsTable.addGlobalSecondaryIndex({
      indexName: 'caseId-index',
      partitionKey: { name: 'caseId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Users table
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `corexpert-${config.stage}-users`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'role-createdAt-index',
      partitionKey: { name: 'role', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Payments table
    this.paymentsTable = new dynamodb.Table(this, 'PaymentsTable', {
      tableName: `corexpert-${config.stage}-payments`,
      partitionKey: { name: 'paymentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });
    this.paymentsTable.addGlobalSecondaryIndex({
      indexName: 'stripePaymentIntentId-index',
      partitionKey: { name: 'stripePaymentIntentId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.paymentsTable.addGlobalSecondaryIndex({
      indexName: 'jobId-index',
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Corrections table — labelled AI-vs-Xpert decisions (evals / future RAG).
    this.correctionsTable = new dynamodb.Table(this, 'CorrectionsTable', {
      tableName: `corexpert-${config.stage}-corrections`,
      partitionKey: { name: 'correctionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.correctionsTable.addGlobalSecondaryIndex({
      indexName: 'caseId-createdAt-index',
      partitionKey: { name: 'caseId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Warranty companies (tenants) + their rulesets. Small, admin-managed.
    this.warrantyCompaniesTable = new dynamodb.Table(this, 'WarrantyCompaniesTable', {
      tableName: `corexpert-${config.stage}-warranty-companies`,
      partitionKey: { name: 'warrantyCompanyId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
  }
}
