import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments';

export interface AuthStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
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

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'ConsumerClientId', { value: this.consumerClient.userPoolClientId });
    new cdk.CfnOutput(this, 'RepairerClientId', { value: this.repairerClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AdminClientId', { value: this.adminClient.userPoolClientId });
  }
}
