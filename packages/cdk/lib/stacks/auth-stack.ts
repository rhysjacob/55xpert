import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import type { Construct } from 'constructs';
import { AppLambda } from '../constructs/lambda-function';
import type { EnvironmentConfig } from '../config/environments';

export interface AuthStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  usersTable: dynamodb.ITable;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly consumerClient: cognito.UserPoolClient;
  public readonly repairerClient: cognito.UserPoolClient;
  public readonly adminClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config } = props;
    const removal = config.removalPolicy === 'destroy'
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    // Post-confirmation Lambda
    const handlersPath = path.join(__dirname, '../../../api/src/handlers');
    const postConfirmation = new AppLambda(this, 'PostConfirmation', {
      entry: path.join(handlersPath, 'auth/post-confirmation.ts'),
      environment: {
        STAGE: config.stage,
        USERS_TABLE: props.usersTable.tableName,
      },
      description: 'Cognito post-confirmation trigger',
    });
    props.usersTable.grantReadWriteData(postConfirmation.function);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `corexpert-${config.stage}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: removal,
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },
      lambdaTriggers: {
        postConfirmation: postConfirmation.function,
      },
    });

    // Groups
    for (const group of ['consumers', 'repairers', 'xperts', 'admins']) {
      new cognito.CfnUserPoolGroup(this, `Group-${group}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
      });
    }

    // App clients
    this.consumerClient = this.userPool.addClient('ConsumerClient', {
      userPoolClientName: `corexpert-${config.stage}-consumer`,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
    });

    this.repairerClient = this.userPool.addClient('RepairerClient', {
      userPoolClientName: `corexpert-${config.stage}-repairer`,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
    });

    this.adminClient = this.userPool.addClient('AdminClient', {
      userPoolClientName: `corexpert-${config.stage}-admin`,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
    });

    // The post-confirmation Lambda resolves the signup role by looking up the
    // app client's name at runtime. Granting against a wildcard user-pool ARN
    // (rather than this.userPool.userPoolArn) avoids a UserPool -> Lambda ->
    // Client -> UserPool CloudFormation dependency cycle.
    postConfirmation.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:DescribeUserPoolClient',
          'cognito-idp:AdminAddUserToGroup',
        ],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
      }),
    );

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'ConsumerClientId', { value: this.consumerClient.userPoolClientId });
    new cdk.CfnOutput(this, 'RepairerClientId', { value: this.repairerClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AdminClientId', { value: this.adminClient.userPoolClientId });
  }
}
