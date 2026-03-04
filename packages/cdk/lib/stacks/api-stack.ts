import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import type { Construct } from 'constructs';
import { AppLambda } from '../constructs/lambda-function';
import type { EnvironmentConfig } from '../config/environments';

export interface ApiStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  userPool: cognito.IUserPool;
  casesTable: dynamodb.ITable;
  jobsTable: dynamodb.ITable;
  usersTable: dynamodb.ITable;
  paymentsTable: dynamodb.ITable;
  imagesBucket: s3.IBucket;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config } = props;

    // JWT Authorizer
    const authorizer = new apigwAuthorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${config.region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: ['placeholder'], // Will be updated with actual client IDs
      },
    );

    // HTTP API
    this.api = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `corexpert-${config.stage}-api`,
      corsPreflight: {
        allowOrigins: ['*'], // Restrict in production
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.PATCH,
          apigw.CorsHttpMethod.DELETE,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const handlersPath = path.join(__dirname, '../../../../api/src/handlers');

    const sharedEnv: Record<string, string> = {
      STAGE: config.stage,
      CASES_TABLE: props.casesTable.tableName,
      JOBS_TABLE: props.jobsTable.tableName,
      USERS_TABLE: props.usersTable.tableName,
      PAYMENTS_TABLE: props.paymentsTable.tableName,
      IMAGES_BUCKET: props.imagesBucket.bucketName,
      AI_PROVIDER: config.aiProvider,
      AI_MODEL_ID: config.aiModelId,
      CONFIDENCE_THRESHOLD: config.confidenceThreshold.toString(),
      INTRODUCTION_FEE: config.introductionFee.toString(),
    };

    // Health check (no auth)
    const healthLambda = new AppLambda(this, 'Health', {
      entry: path.join(handlersPath, 'health.ts'),
      environment: sharedEnv,
      description: 'Health check endpoint',
    });

    this.api.addRoutes({
      path: '/api/v1/health',
      methods: [apigw.HttpMethod.GET],
      integration: new apigwIntegrations.HttpLambdaIntegration(
        'HealthIntegration',
        healthLambda.function,
      ),
    });

    // Grant DynamoDB access to all Lambdas that need it
    const allTables = [props.casesTable, props.jobsTable, props.usersTable, props.paymentsTable];
    for (const table of allTables) {
      table.grantReadWriteData(healthLambda.function);
    }

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.apiEndpoint });
  }
}
