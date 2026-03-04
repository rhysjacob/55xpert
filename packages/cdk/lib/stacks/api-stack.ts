import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
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
        jwtAudience: ['placeholder'], // Updated with actual client IDs
      },
    );

    // HTTP API
    this.api = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `corexpert-${config.stage}-api`,
      corsPreflight: {
        allowOrigins: ['*'],
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
    const allTables = [props.casesTable, props.jobsTable, props.usersTable, props.paymentsTable];

    const sharedEnv: Record<string, string> = {
      STAGE: config.stage,
      CASES_TABLE: props.casesTable.tableName,
      JOBS_TABLE: props.jobsTable.tableName,
      USERS_TABLE: props.usersTable.tableName,
      PAYMENTS_TABLE: props.paymentsTable.tableName,
      IMAGE_BUCKET: props.imagesBucket.bucketName,
      AI_PROVIDER: config.aiProvider,
      AI_MODEL_ID: config.aiModelId,
      CONFIDENCE_THRESHOLD: config.confidenceThreshold.toString(),
      INTRODUCTION_FEE: config.introductionFee.toString(),
    };

    // Helper to create a Lambda + route
    const addRoute = (
      id: string,
      entry: string,
      method: apigw.HttpMethod,
      routePath: string,
      opts?: { auth?: boolean; memorySize?: number; timeout?: cdk.Duration },
    ): AppLambda => {
      const fn = new AppLambda(this, id, {
        entry: path.join(handlersPath, entry),
        environment: sharedEnv,
        description: `${method} ${routePath}`,
        memorySize: opts?.memorySize,
        timeout: opts?.timeout,
      });

      for (const table of allTables) {
        table.grantReadWriteData(fn.function);
      }
      props.imagesBucket.grantReadWrite(fn.function);

      this.api.addRoutes({
        path: routePath,
        methods: [method],
        integration: new apigwIntegrations.HttpLambdaIntegration(`${id}Integration`, fn.function),
        authorizer: opts?.auth !== false ? authorizer : undefined,
      });

      return fn;
    };

    // ===== Health (no auth) =====
    addRoute('Health', 'health.ts', apigw.HttpMethod.GET, '/api/v1/health', { auth: false });

    // ===== Cases =====
    addRoute('CasesCreate', 'cases/create.ts', apigw.HttpMethod.POST, '/api/v1/cases');
    addRoute('CasesGet', 'cases/get.ts', apigw.HttpMethod.GET, '/api/v1/cases/{caseId}');
    addRoute('CasesList', 'cases/list.ts', apigw.HttpMethod.GET, '/api/v1/cases');
    addRoute('CasesUpdate', 'cases/update.ts', apigw.HttpMethod.PATCH, '/api/v1/cases/{caseId}');

    // ===== Images =====
    addRoute('ImagesPresignedUrl', 'images/presigned-url.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/images/presigned-url');
    addRoute('ImagesConfirm', 'images/confirm.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/images/confirm');

    // ===== Vehicle Lookup =====
    addRoute('VehicleLookup', 'vehicles/lookup.ts', apigw.HttpMethod.POST, '/api/v1/vehicles/lookup');

    // ===== Triage =====
    const triageSubmit = addRoute('TriageSubmit', 'triage/submit.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/triage', {
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
    });

    // Grant Bedrock InvokeModel to triage Lambda
    triageSubmit.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [`arn:aws:bedrock:${config.region}::foundation-model/${config.aiModelId}`],
    }));

    addRoute('TriageResult', 'triage/result.ts', apigw.HttpMethod.GET, '/api/v1/cases/{caseId}/triage');

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.apiEndpoint });
  }
}
