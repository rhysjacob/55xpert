import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import type { Construct } from 'constructs';
import { AppLambda } from '../constructs/lambda-function';
import type { EnvironmentConfig } from '../config/environments';

export interface ApiStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  userPool: cognito.IUserPool;
  userPoolClientIds: string[];
  casesTable: dynamodb.ITable;
  jobsTable: dynamodb.ITable;
  usersTable: dynamodb.ITable;
  paymentsTable: dynamodb.ITable;
  correctionsTable: dynamodb.ITable;
  warrantyCompaniesTable: dynamodb.ITable;
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
        // idTokens carry the app client ID in their `aud` claim, so the
        // authorizer must accept all three SPA client IDs.
        jwtAudience: props.userPoolClientIds,
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

    const handlersPath = path.join(__dirname, '../../../api/src/handlers');
    const allTables = [props.casesTable, props.jobsTable, props.usersTable, props.paymentsTable, props.correctionsTable, props.warrantyCompaniesTable];

    // AI-model debug configuration (SSM). The toggle gates whether triage may use
    // a UI-selected model instead of the deploy-time default. NOTE: a deploy
    // resets both to these defaults (toggle off, model = configured default) —
    // re-enable and re-pick after deploying if you were mid-experiment.
    const modelDebugToggle = new ssm.StringParameter(this, 'ModelDebugToggle', {
      parameterName: `/corexpert/${config.stage}/features/model-debug`,
      stringValue: 'false',
      description: 'Feature toggle: allow AI triage model override from the admin UI',
    });
    const activeModelParam = new ssm.StringParameter(this, 'ActiveModelParam', {
      parameterName: `/corexpert/${config.stage}/ai/active-model`,
      stringValue: config.aiModelId,
      description: 'AI triage model used while model-debug is enabled',
    });

    // How long an accepted job may sit unpaid before the sweeper returns it to
    // the Xchange. Admin-settable at runtime; see the NOTE above — a deploy
    // resets this to the default.
    const paymentGraceParam = new ssm.StringParameter(this, 'PaymentGraceParam', {
      parameterName: `/corexpert/${config.stage}/jobs/payment-grace-minutes`,
      stringValue: String(config.paymentGraceMinutes),
      description: 'Minutes a repairer has to pay the introduction fee before the job is released',
    });

    const sharedEnv: Record<string, string> = {
      STAGE: config.stage,
      CASES_TABLE: props.casesTable.tableName,
      JOBS_TABLE: props.jobsTable.tableName,
      USERS_TABLE: props.usersTable.tableName,
      PAYMENTS_TABLE: props.paymentsTable.tableName,
      CORRECTIONS_TABLE: props.correctionsTable.tableName,
      WARRANTY_COMPANIES_TABLE: props.warrantyCompaniesTable.tableName,
      IMAGE_BUCKET: props.imagesBucket.bucketName,
      AI_PROVIDER: config.aiProvider,
      AI_MODEL_ID: config.aiModelId,
      WARRANTY_SCHEME: config.warrantyScheme,
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
    // Reg/VIN lookup calls a third-party API whose key lives in Secrets Manager.
    // The value is created out-of-band (never in code/context); we reference it
    // by stage-prefixed name and grant read to only this Lambda.
    const vehicleLookupSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'VehicleLookupApiKey',
      `corexpert/${config.stage}/vehicle-lookup-api`,
    );
    const vehicleLookup = addRoute('VehicleLookup', 'vehicles/lookup.ts', apigw.HttpMethod.POST, '/api/v1/vehicles/lookup');
    vehicleLookupSecret.grantRead(vehicleLookup.function);
    vehicleLookup.function.addEnvironment('VEHICLE_LOOKUP_SECRET_NAME', vehicleLookupSecret.secretName);
    vehicleLookup.function.addEnvironment('ONEAUTO_BASE_URL', config.oneAutoBaseUrl);

    // ===== Triage (async) =====
    // The Bedrock vision call takes ~40-60s, well past the API Gateway ~30s
    // integration timeout, so triage runs in a worker Lambda invoked
    // asynchronously by the submit handler. The frontend polls GET /triage.
    const triageWorker = new AppLambda(this, 'TriageWorker', {
      entry: path.join(handlersPath, 'triage/worker.ts'),
      environment: sharedEnv,
      description: 'Async triage worker (Bedrock damage assessment)',
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
    });
    for (const table of allTables) {
      table.grantReadWriteData(triageWorker.function);
    }
    props.imagesBucket.grantReadWrite(triageWorker.function);

    // Grant Bedrock InvokeModel to the worker. The model is invoked via a
    // cross-region inference profile (e.g. eu.anthropic.claude-sonnet-4-6),
    // which requires permission on both the inference-profile resource and the
    // underlying foundation models in every region the profile may route to.
    triageWorker.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*:${this.account}:inference-profile/${config.aiModelId}`,
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-*',
      ],
    }));

    // The worker may invoke a UI-selected model when debug is on, so it must be
    // able to invoke any allow-listed Claude inference profile or Nova model
    // (Nova is invoked by bare foundation-model id via the Converse API), and to
    // read the model-config SSM parameters. Some models (Fable 5) publish only a
    // global.* profile in this region, so both prefixes are granted.
    triageWorker.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*:${this.account}:inference-profile/eu.anthropic.claude-*`,
        `arn:aws:bedrock:*:${this.account}:inference-profile/global.anthropic.claude-*`,
        'arn:aws:bedrock:*::foundation-model/amazon.nova-*',
        `arn:aws:bedrock:*:${this.account}:inference-profile/*.amazon.nova-*`,
      ],
    }));
    modelDebugToggle.grantRead(triageWorker.function);
    activeModelParam.grantRead(triageWorker.function);

    // Trigger: validates, marks pending, async-invokes the worker, returns fast.
    const triageSubmit = addRoute('TriageSubmit', 'triage/submit.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/triage', {
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
    });
    triageSubmit.function.addEnvironment('TRIAGE_WORKER_FUNCTION', triageWorker.function.functionName);
    triageWorker.function.grantInvoke(triageSubmit.function);

    addRoute('TriageResult', 'triage/result.ts', apigw.HttpMethod.GET, '/api/v1/cases/{caseId}/triage');

    // ===== Jobs (Marketplace) =====
    addRoute('JobPublish', 'jobs/publish.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/publish');
    addRoute('JobsList', 'jobs/list.ts', apigw.HttpMethod.GET, '/api/v1/jobs');
    addRoute('JobsGet', 'jobs/get.ts', apigw.HttpMethod.GET, '/api/v1/jobs/{jobId}');
    addRoute('JobsAccept', 'jobs/accept.ts', apigw.HttpMethod.POST, '/api/v1/jobs/{jobId}/accept');
    addRoute('JobsDetails', 'jobs/details.ts', apigw.HttpMethod.GET, '/api/v1/jobs/{jobId}/details');

    // ===== Repairer =====
    addRoute('RepairerProfile', 'repairers/profile.ts', apigw.HttpMethod.GET, '/api/v1/repairer/profile');
    addRoute('RepairerUpdateProfile', 'repairers/update-profile.ts', apigw.HttpMethod.PUT, '/api/v1/repairer/profile');
    addRoute('RepairerPreferencesGet', 'repairers/preferences.ts', apigw.HttpMethod.GET, '/api/v1/repairer/preferences');
    addRoute('RepairerPreferencesUpdate', 'repairers/preferences.ts', apigw.HttpMethod.PUT, '/api/v1/repairer/preferences');
    addRoute('RepairerMyJobs', 'repairers/my-jobs.ts', apigw.HttpMethod.GET, '/api/v1/repairer/jobs');

    // ===== Xpert Review =====
    addRoute('XpertCasesList', 'xpert/list-cases.ts', apigw.HttpMethod.GET, '/api/v1/xpert/cases');
    addRoute('XpertCaseGet', 'xpert/get-case.ts', apigw.HttpMethod.GET, '/api/v1/xpert/cases/{caseId}');
    addRoute('XpertReview', 'xpert/review.ts', apigw.HttpMethod.POST, '/api/v1/xpert/cases/{caseId}/review');

    // ===== Admin =====
    addRoute('AdminCases', 'admin/cases.ts', apigw.HttpMethod.GET, '/api/v1/admin/cases');
    addRoute('AdminJobs', 'admin/jobs.ts', apigw.HttpMethod.GET, '/api/v1/admin/jobs');
    addRoute('AdminRepairers', 'admin/repairers.ts', apigw.HttpMethod.GET, '/api/v1/admin/repairers');
    addRoute('AdminUpdateRepairer', 'admin/update-repairer.ts', apigw.HttpMethod.PATCH, '/api/v1/admin/repairers/{repairerId}');
    addRoute('AdminDashboard', 'admin/dashboard.ts', apigw.HttpMethod.GET, '/api/v1/admin/dashboard');

    // Admin debug: AI model picker (read + set), gated by the SSM toggle.
    const modelConfigGet = addRoute('AdminModelConfigGet', 'admin/model-config.ts', apigw.HttpMethod.GET, '/api/v1/admin/model-config');
    const modelConfigPut = addRoute('AdminModelConfigUpdate', 'admin/model-config.ts', apigw.HttpMethod.PUT, '/api/v1/admin/model-config');
    for (const fn of [modelConfigGet.function, modelConfigPut.function]) {
      modelDebugToggle.grantRead(fn);
      modelDebugToggle.grantWrite(fn);
      activeModelParam.grantRead(fn);
      activeModelParam.grantWrite(fn);
    }

    // Admin: job marketplace settings (payment grace period).
    const jobSettingsGet = addRoute('AdminJobSettingsGet', 'admin/job-settings.ts', apigw.HttpMethod.GET, '/api/v1/admin/job-settings');
    const jobSettingsPut = addRoute('AdminJobSettingsUpdate', 'admin/job-settings.ts', apigw.HttpMethod.PUT, '/api/v1/admin/job-settings');
    for (const fn of [jobSettingsGet.function, jobSettingsPut.function]) {
      paymentGraceParam.grantRead(fn);
      paymentGraceParam.grantWrite(fn);
    }

    // Admin: warranty companies (tenants) + their rulesets. Onboard/edit at
    // runtime — no deploy needed to add a company with its own rules.
    addRoute('AdminWarrantyCompaniesList', 'admin/warranty-companies.ts', apigw.HttpMethod.GET, '/api/v1/admin/warranty-companies');
    addRoute('AdminWarrantyCompaniesCreate', 'admin/warranty-companies.ts', apigw.HttpMethod.POST, '/api/v1/admin/warranty-companies');
    addRoute('AdminWarrantyCompanyGet', 'admin/warranty-companies.ts', apigw.HttpMethod.GET, '/api/v1/admin/warranty-companies/{companyId}');
    addRoute('AdminWarrantyCompanyUpdate', 'admin/warranty-companies.ts', apigw.HttpMethod.PUT, '/api/v1/admin/warranty-companies/{companyId}');

    // ===== Payments =====
    // Stripe secret (JSON: { secretKey }) lives in Secrets Manager, created
    // out-of-band. Only the checkout Lambda reads it; fetched at runtime by name.
    const stripeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'StripeApiKey',
      `corexpert/${config.stage}/stripe`,
    );
    const paymentCheckout = addRoute('PaymentCreateCheckout', 'payments/create-checkout.ts', apigw.HttpMethod.POST, '/api/v1/payments/create-checkout');
    stripeSecret.grantRead(paymentCheckout.function);
    paymentCheckout.function.addEnvironment('STRIPE_SECRET_NAME', stripeSecret.secretName);
    // Stripe redirects back to the repairer app after checkout; without this it
    // falls back to http://localhost:3001.
    paymentCheckout.function.addEnvironment('FRONTEND_URL', config.frontendUrl);

    // Inbound Stripe events arrive via Amazon EventBridge (the Stripe partner
    // event source), not an HTTP webhook — no public endpoint, no signing
    // secret, and EventBridge gives retries/DLQ + fan-out. Wired only once the
    // partner source name is configured (created in the Stripe dashboard).
    if (config.stripeEventSourceName) {
      const stripeEvents = new AppLambda(this, 'StripeEventProcessor', {
        entry: path.join(handlersPath, 'payments/webhook.ts'),
        environment: sharedEnv,
        description: 'Process Stripe events delivered via EventBridge',
      });
      for (const table of allTables) {
        table.grantReadWriteData(stripeEvents.function);
      }

      // Naming an event bus after the partner source associates the two.
      const stripeBus = new events.CfnEventBus(this, 'StripeEventBus', {
        name: config.stripeEventSourceName,
        eventSourceName: config.stripeEventSourceName,
      });
      const stripeRule = new events.Rule(this, 'StripeEventRule', {
        eventBus: events.EventBus.fromEventBusName(this, 'StripeBusRef', config.stripeEventSourceName),
        description: 'Route Stripe checkout events to the processor',
        eventPattern: {
          detailType: ['checkout.session.completed', 'checkout.session.expired'],
        },
        targets: [new eventsTargets.LambdaFunction(stripeEvents.function)],
      });
      // The referenced bus must exist before the rule attaches to it.
      stripeRule.node.addDependency(stripeBus);
    }

    // ===== Scheduled sweep: release accepted-but-unpaid jobs =====
    // Stripe's checkout.session.expired webhook only fires for repairers who
    // actually started checkout; this catches those who never did, whose jobs
    // would otherwise stay ACCEPTED and unpaid forever.
    const releaseUnpaid = new AppLambda(this, 'JobsReleaseUnpaid', {
      entry: path.join(handlersPath, 'jobs/release-unpaid.ts'),
      environment: sharedEnv,
      description: 'Scheduled: return accepted-but-unpaid jobs to the Xchange',
      timeout: cdk.Duration.minutes(2),
    });
    for (const table of allTables) {
      table.grantReadWriteData(releaseUnpaid.function);
    }
    paymentGraceParam.grantRead(releaseUnpaid.function);

    new events.Rule(this, 'ReleaseUnpaidSchedule', {
      description: 'Sweep accepted-but-unpaid jobs back to OPEN',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new eventsTargets.LambdaFunction(releaseUnpaid.function)],
    });

    new cdk.CfnOutput(this, 'ReleaseUnpaidFunctionName', {
      value: releaseUnpaid.function.functionName,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.apiEndpoint });
  }
}
