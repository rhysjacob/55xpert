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
  organisationsTable: dynamodb.ITable;
  networkLinksTable: dynamodb.ITable;
  ingestionsTable: dynamodb.ITable;
  leadsTable: dynamodb.ITable;
  complaintsTable: dynamodb.ITable;
  jobQueriesTable: dynamodb.ITable;
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
        allowOrigins: config.appOrigins,
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

    // ─── Table groups for least-privilege IAM grants ───────────────────────
    // Each handler gets only the tables it actually accesses. Admin handlers
    // that span many tables use the full set; narrower handlers get only what
    // they need. This limits blast radius if a single Lambda is compromised.

    // App domain-event bus. Producers emit (e.g. job.published); decoupled
    // consumers (notifications) subscribe via rules — nothing sends email/etc
    // inline from a request path (TRX-60).
    const appEventBus = new events.EventBus(this, 'AppEventBus', {
      eventBusName: `corexpert-${config.stage}-events`,
    });

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

    const sharedEnv: Record<string, string> = {
      STAGE: config.stage,
      CASES_TABLE: props.casesTable.tableName,
      JOBS_TABLE: props.jobsTable.tableName,
      USERS_TABLE: props.usersTable.tableName,
      PAYMENTS_TABLE: props.paymentsTable.tableName,
      CORRECTIONS_TABLE: props.correctionsTable.tableName,
      WARRANTY_COMPANIES_TABLE: props.warrantyCompaniesTable.tableName,
      ORGANISATIONS_TABLE: props.organisationsTable.tableName,
      NETWORK_LINKS_TABLE: props.networkLinksTable.tableName,
      INGESTIONS_TABLE: props.ingestionsTable.tableName,
      IMAGE_BUCKET: props.imagesBucket.bucketName,
      EVENT_BUS_NAME: appEventBus.eventBusName,
      FROM_EMAIL: config.notificationsFromEmail,
      FRONTEND_URL: config.frontendUrl,
      LEADS_EMAIL: config.leadsEmail,
      EXPERT_QUEUE_EMAIL: config.expertQueueEmail,
      ADMIN_URL: config.adminUrl,
      // WhatsApp via Twilio (TRX-61). Credentials never live in source: the
      // identifiers come from a Secrets Manager JSON secret and the API-key
      // secret from another — all resolved at deploy via CloudFormation dynamic
      // references. Blank secret names keep the channel dormant.
      TWILIO_WHATSAPP_TEMPLATE_SID: config.twilioWhatsAppTemplateSid,
      ...(config.twilioConfigSecretName
        ? {
            TWILIO_ACCOUNT_SID: `{{resolve:secretsmanager:${config.twilioConfigSecretName}:SecretString:accountSid}}`,
            TWILIO_API_KEY_SID: `{{resolve:secretsmanager:${config.twilioConfigSecretName}:SecretString:apiKeySid}}`,
            TWILIO_WHATSAPP_FROM: `{{resolve:secretsmanager:${config.twilioConfigSecretName}:SecretString:from}}`,
          }
        : {}),
      ...(config.twilioAuthTokenSecretName
        ? { TWILIO_AUTH_TOKEN: `{{resolve:secretsmanager:${config.twilioAuthTokenSecretName}:SecretString}}` }
        : {}),
      AI_PROVIDER: config.aiProvider,
      AI_MODEL_ID: config.aiModelId,
      WARRANTY_SCHEME: config.warrantyScheme,
      DEFAULT_WARRANTY_COMPANY_ID: config.defaultWarrantyCompanyId,
      CONFIDENCE_THRESHOLD: config.confidenceThreshold.toString(),
      INTRODUCTION_FEE: config.introductionFee.toString(),
    };

    // Helper to create a Lambda + route with scoped table grants.
    const addRoute = (
      id: string,
      entry: string,
      method: apigw.HttpMethod,
      routePath: string,
      opts?: {
        auth?: boolean;
        memorySize?: number;
        timeout?: cdk.Duration;
        /** Tables this handler reads from. */
        readTables?: dynamodb.ITable[];
        /** Tables this handler writes to (implies read). */
        writeTables?: dynamodb.ITable[];
        /** Grant S3 image bucket access (default: false). */
        s3?: boolean;
        /** Grant EventBridge PutEvents (default: false). */
        events?: boolean;
      },
    ): AppLambda => {
      const fn = new AppLambda(this, id, {
        entry: path.join(handlersPath, entry),
        environment: sharedEnv,
        description: `${method} ${routePath}`,
        memorySize: opts?.memorySize,
        timeout: opts?.timeout,
      });

      for (const table of opts?.readTables ?? []) {
        table.grantReadData(fn.function);
      }
      for (const table of opts?.writeTables ?? []) {
        table.grantReadWriteData(fn.function);
      }
      if (opts?.s3) {
        props.imagesBucket.grantReadWrite(fn.function);
      }
      if (opts?.events) {
        appEventBus.grantPutEventsTo(fn.function);
      }

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

    // Public marketing lead capture (TRX-71) — no auth; honeypot-guarded.
    addRoute('LeadsSubmit', 'leads/submit.ts', apigw.HttpMethod.POST, '/api/v1/leads', { auth: false, writeTables: [props.leadsTable] });

    // ===== Cases =====
    addRoute('CasesCreate', 'cases/create.ts', apigw.HttpMethod.POST, '/api/v1/cases', { writeTables: [props.casesTable] });
    addRoute('CasesGet', 'cases/get.ts', apigw.HttpMethod.GET, '/api/v1/cases/{caseId}', { readTables: [props.casesTable] });
    addRoute('CasesList', 'cases/list.ts', apigw.HttpMethod.GET, '/api/v1/cases', { readTables: [props.casesTable] });
    addRoute('CasesUpdate', 'cases/update.ts', apigw.HttpMethod.PATCH, '/api/v1/cases/{caseId}', { writeTables: [props.casesTable] });

    // ===== Images =====
    addRoute('ImagesPresignedUrl', 'images/presigned-url.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/images/presigned-url', { readTables: [props.casesTable], s3: true });
    addRoute('ImagesConfirm', 'images/confirm.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/images/confirm', { writeTables: [props.casesTable] });

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
    // Triage worker: reads cases + images, writes triage result, auto-publishes
    // (jobs + cases + ingestions + warranty companies for feedback), and the
    // matching lib reads orgs + network links.
    props.casesTable.grantReadWriteData(triageWorker.function);
    props.jobsTable.grantReadWriteData(triageWorker.function);
    props.warrantyCompaniesTable.grantReadData(triageWorker.function);
    props.ingestionsTable.grantReadWriteData(triageWorker.function);
    props.organisationsTable.grantReadData(triageWorker.function);
    props.networkLinksTable.grantReadData(triageWorker.function);
    props.usersTable.grantReadData(triageWorker.function);
    props.imagesBucket.grantReadWrite(triageWorker.function);
    appEventBus.grantPutEventsTo(triageWorker.function);

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
      writeTables: [props.casesTable],
    });
    triageSubmit.function.addEnvironment('TRIAGE_WORKER_FUNCTION', triageWorker.function.functionName);
    triageWorker.function.grantInvoke(triageSubmit.function);

    addRoute('TriageResult', 'triage/result.ts', apigw.HttpMethod.GET, '/api/v1/cases/{caseId}/triage', { readTables: [props.casesTable] });

    // ===== Jobs (Marketplace) =====
    addRoute('JobPublish', 'jobs/publish.ts', apigw.HttpMethod.POST, '/api/v1/cases/{caseId}/publish', {
      writeTables: [props.casesTable, props.jobsTable, props.ingestionsTable],
      readTables: [props.warrantyCompaniesTable],
      events: true,
    });
    addRoute('JobsList', 'jobs/list.ts', apigw.HttpMethod.GET, '/api/v1/jobs', {
      readTables: [props.jobsTable, props.usersTable, props.organisationsTable, props.networkLinksTable],
    });
    addRoute('JobsGet', 'jobs/get.ts', apigw.HttpMethod.GET, '/api/v1/jobs/{jobId}', {
      readTables: [props.jobsTable, props.casesTable],
    });
    const jobsAccept = addRoute('JobsAccept', 'jobs/accept.ts', apigw.HttpMethod.POST, '/api/v1/jobs/{jobId}/accept', {
      writeTables: [props.jobsTable, props.casesTable],
      readTables: [props.usersTable, props.organisationsTable, props.networkLinksTable],
    });
    addRoute('JobsDetails', 'jobs/details.ts', apigw.HttpMethod.GET, '/api/v1/jobs/{jobId}/details', {
      readTables: [props.jobsTable, props.casesTable],
      s3: true,
    });

    // Post-acceptance "refer to expert" queries (TRX-57).
    addRoute('RepairerJobQueryCreate', 'repairers/job-query-create.ts', apigw.HttpMethod.POST, '/api/v1/repairer/jobs/{jobId}/queries', {
      readTables: [props.jobsTable, props.usersTable],
      writeTables: [props.jobQueriesTable],
      events: true,
    });
    addRoute('RepairerJobQueriesList', 'repairers/job-queries-list.ts', apigw.HttpMethod.GET, '/api/v1/repairer/jobs/{jobId}/queries', {
      readTables: [props.jobQueriesTable],
    });
    addRoute('AdminWhatsAppTest', 'admin/whatsapp-test.ts', apigw.HttpMethod.POST, '/api/v1/admin/whatsapp-test');
    addRoute('AdminQueriesList', 'admin/queries-list.ts', apigw.HttpMethod.GET, '/api/v1/admin/queries', {
      readTables: [props.jobQueriesTable],
    });
    // Responding emails the repairer directly (best-effort), so grant SES send.
    const queryRespond = addRoute('AdminQueryRespond', 'admin/query-respond.ts', apigw.HttpMethod.PATCH, '/api/v1/admin/queries/{queryId}', {
      writeTables: [props.jobQueriesTable],
      readTables: [props.usersTable],
    });
    queryRespond.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
    }));

    // Notifications: consume job.published off the app bus and email matched
    // repairers (TRX-60). Decoupled — not an HTTP route. Read-only on data; SES
    // send granted separately. FROM must be a verified SES identity.
    const jobPublishedNotifier = new AppLambda(this, 'JobPublishedNotifier', {
      entry: path.join(handlersPath, 'notifications/job-published.ts'),
      environment: sharedEnv,
      description: 'Email matched repairers when a job is published (TRX-60)',
      timeout: cdk.Duration.seconds(120),
    });
    props.jobsTable.grantReadData(jobPublishedNotifier.function);
    props.usersTable.grantReadData(jobPublishedNotifier.function);
    props.organisationsTable.grantReadData(jobPublishedNotifier.function);
    props.networkLinksTable.grantReadData(jobPublishedNotifier.function);
    jobPublishedNotifier.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
    }));
    new events.Rule(this, 'JobPublishedRule', {
      eventBus: appEventBus,
      eventPattern: { source: ['corexpert.app'], detailType: ['job.published'] },
      targets: [new eventsTargets.LambdaFunction(jobPublishedNotifier.function)],
    });

    // Notifications: consume job.query.raised and email the Xpert team (TRX-57).
    const jobQueryNotifier = new AppLambda(this, 'JobQueryRaisedNotifier', {
      entry: path.join(handlersPath, 'notifications/job-query-raised.ts'),
      environment: sharedEnv,
      description: 'Email the Xpert team when a repairer refers a job to an expert (TRX-57)',
      timeout: cdk.Duration.seconds(60),
    });
    props.jobQueriesTable.grantReadData(jobQueryNotifier.function);
    jobQueryNotifier.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
    }));
    new events.Rule(this, 'JobQueryRaisedRule', {
      eventBus: appEventBus,
      eventPattern: { source: ['corexpert.app'], detailType: ['job.query.raised'] },
      targets: [new eventsTargets.LambdaFunction(jobQueryNotifier.function)],
    });

    // Scheduled sweeper: expire OPEN jobs past their expiry — 48h for ingested
    // warranty-company jobs, 7 days for consumer jobs — and hand ingested ones
    // back to the company (TRX-10). Hourly; not an HTTP route.
    const expirySweep = new AppLambda(this, 'JobExpirySweep', {
      entry: path.join(handlersPath, 'jobs/expiry-sweep.ts'),
      environment: sharedEnv,
      description: 'Scheduled sweep: expire lapsed OPEN jobs (TRX-10)',
      timeout: cdk.Duration.seconds(120),
    });
    props.jobsTable.grantReadWriteData(expirySweep.function);
    props.casesTable.grantReadWriteData(expirySweep.function);
    props.warrantyCompaniesTable.grantReadData(expirySweep.function);
    props.ingestionsTable.grantReadWriteData(expirySweep.function);
    new events.Rule(this, 'JobExpirySweepSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new eventsTargets.LambdaFunction(expirySweep.function)],
    });

    // ===== Repairer =====
    addRoute('RepairerProfile', 'repairers/profile.ts', apigw.HttpMethod.GET, '/api/v1/repairer/profile', {
      readTables: [props.usersTable],
    });
    addRoute('RepairerUpdateProfile', 'repairers/update-profile.ts', apigw.HttpMethod.PUT, '/api/v1/repairer/profile', {
      writeTables: [props.usersTable],
    });
    addRoute('RepairerPreferencesGet', 'repairers/preferences.ts', apigw.HttpMethod.GET, '/api/v1/repairer/preferences', {
      readTables: [props.usersTable],
    });
    addRoute('RepairerPreferencesUpdate', 'repairers/preferences.ts', apigw.HttpMethod.PUT, '/api/v1/repairer/preferences', {
      writeTables: [props.usersTable],
    });
    addRoute('RepairerMyJobs', 'repairers/my-jobs.ts', apigw.HttpMethod.GET, '/api/v1/repairer/jobs', {
      readTables: [props.jobsTable],
    });
    // Repairer's own MI (TRX-67).
    addRoute('RepairerMI', 'repairers/mi.ts', apigw.HttpMethod.GET, '/api/v1/repairer/mi', {
      timeout: cdk.Duration.seconds(30),
      readTables: [props.usersTable, props.jobsTable],
    });
    // Repairer self-manages their org's capability + coverage (TRX-18).
    addRoute('RepairerOrgGet', 'repairers/organisation.ts', apigw.HttpMethod.GET, '/api/v1/repairer/organisation', {
      readTables: [props.usersTable, props.organisationsTable],
    });
    addRoute('RepairerOrgUpdate', 'repairers/organisation.ts', apigw.HttpMethod.PUT, '/api/v1/repairer/organisation', {
      readTables: [props.usersTable],
      writeTables: [props.organisationsTable],
    });
    // Multi-step repairer onboarding (business, coverage, capabilities, T&Cs).
    addRoute('RepairerOnboarding', 'repairers/onboarding.ts', apigw.HttpMethod.PUT, '/api/v1/repairer/onboarding', {
      writeTables: [props.usersTable, props.organisationsTable],
    });
    // Invite a teammate into the org (TRX-52): creates a Cognito login + member.
    const repairerInvite = addRoute('RepairerInvite', 'repairers/invite.ts', apigw.HttpMethod.POST, '/api/v1/repairer/organisation/members', {
      readTables: [props.organisationsTable],
      writeTables: [props.usersTable],
    });
    repairerInvite.function.addEnvironment('USER_POOL_ID', props.userPool.userPoolId);
    repairerInvite.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminAddUserToGroup'],
      resources: [props.userPool.userPoolArn],
    }));

    // ===== Xpert Review =====
    addRoute('XpertCasesList', 'xpert/list-cases.ts', apigw.HttpMethod.GET, '/api/v1/xpert/cases', {
      readTables: [props.casesTable],
    });
    addRoute('XpertCaseGet', 'xpert/get-case.ts', apigw.HttpMethod.GET, '/api/v1/xpert/cases/{caseId}', {
      readTables: [props.casesTable],
      s3: true,
    });
    addRoute('XpertReview', 'xpert/review.ts', apigw.HttpMethod.POST, '/api/v1/xpert/cases/{caseId}/review', {
      writeTables: [props.casesTable, props.correctionsTable, props.jobsTable, props.ingestionsTable],
      readTables: [props.warrantyCompaniesTable],
      events: true,
    });

    // ===== Admin =====
    addRoute('AdminCases', 'admin/cases.ts', apigw.HttpMethod.GET, '/api/v1/admin/cases', {
      readTables: [props.casesTable],
    });
    addRoute('AdminJobs', 'admin/jobs.ts', apigw.HttpMethod.GET, '/api/v1/admin/jobs', {
      readTables: [props.jobsTable],
    });
    addRoute('AdminRepairers', 'admin/repairers.ts', apigw.HttpMethod.GET, '/api/v1/admin/repairers', {
      readTables: [props.usersTable],
    });
    addRoute('AdminUpdateRepairer', 'admin/update-repairer.ts', apigw.HttpMethod.PATCH, '/api/v1/admin/repairers/{repairerId}', {
      writeTables: [props.usersTable],
    });
    addRoute('AdminDashboard', 'admin/dashboard.ts', apigw.HttpMethod.GET, '/api/v1/admin/dashboard', {
      readTables: [props.casesTable, props.jobsTable, props.usersTable],
    });
    addRoute('AdminLeads', 'admin/leads.ts', apigw.HttpMethod.GET, '/api/v1/admin/leads', {
      readTables: [props.leadsTable],
    });

    // Complaints log (TRX-24).
    addRoute('AdminComplaintsList', 'admin/complaints-list.ts', apigw.HttpMethod.GET, '/api/v1/admin/complaints', {
      readTables: [props.complaintsTable],
    });
    addRoute('AdminComplaintsCreate', 'admin/complaints-create.ts', apigw.HttpMethod.POST, '/api/v1/admin/complaints', {
      writeTables: [props.complaintsTable],
    });
    addRoute('AdminComplaintsUpdate', 'admin/complaints-update.ts', apigw.HttpMethod.PATCH, '/api/v1/admin/complaints/{complaintId}', {
      writeTables: [props.complaintsTable],
    });
    // Portfolio MI: funnel, trend, time-to-accept, financials, leaderboards (TRX-25/26/28/29).
    addRoute('AdminMI', 'admin/mi.ts', apigw.HttpMethod.GET, '/api/v1/admin/mi', {
      timeout: cdk.Duration.seconds(30),
      readTables: [props.casesTable, props.jobsTable, props.usersTable, props.organisationsTable],
    });
    // Coverage heatmap: job demand vs repairer coverage per area (TRX-30).
    addRoute('AdminCoverage', 'admin/coverage.ts', apigw.HttpMethod.GET, '/api/v1/admin/coverage', {
      timeout: cdk.Duration.seconds(30),
      readTables: [props.jobsTable, props.organisationsTable],
    });

    // Admin: repairer organisations (TRX-37/49) + manual job push override (TRX-20).
    addRoute('AdminOrgsList', 'admin/organisations.ts', apigw.HttpMethod.GET, '/api/v1/admin/organisations', {
      readTables: [props.organisationsTable, props.usersTable],
    });
    addRoute('AdminOrgsCreate', 'admin/organisations.ts', apigw.HttpMethod.POST, '/api/v1/admin/organisations', {
      writeTables: [props.organisationsTable],
      readTables: [props.usersTable],
    });
    addRoute('AdminOrgGet', 'admin/organisations.ts', apigw.HttpMethod.GET, '/api/v1/admin/organisations/{organisationId}', {
      readTables: [props.organisationsTable, props.usersTable],
    });
    addRoute('AdminOrgUpdate', 'admin/organisations.ts', apigw.HttpMethod.PUT, '/api/v1/admin/organisations/{organisationId}', {
      writeTables: [props.organisationsTable],
      readTables: [props.usersTable],
    });
    addRoute('AdminPushJob', 'admin/push-job.ts', apigw.HttpMethod.POST, '/api/v1/admin/jobs/{jobId}/push', {
      writeTables: [props.jobsTable],
      readTables: [props.organisationsTable],
    });
    // One-off geocode backfill for existing orgs + open jobs (postcodes.io).
    addRoute('AdminGeocodeBackfill', 'admin/geocode-backfill.ts', apigw.HttpMethod.POST, '/api/v1/admin/geocode-backfill', {
      timeout: cdk.Duration.seconds(120),
      writeTables: [props.organisationsTable, props.jobsTable],
    });
    addRoute('AdminTenantBackfill', 'admin/tenant-backfill.ts', apigw.HttpMethod.POST, '/api/v1/admin/tenant-backfill', {
      timeout: cdk.Duration.seconds(120),
      writeTables: [props.casesTable, props.jobsTable],
      readTables: [props.warrantyCompaniesTable],
    });

    // Admin debug: AI model picker (read + set), gated by the SSM toggle.
    const modelConfigGet = addRoute('AdminModelConfigGet', 'admin/model-config.ts', apigw.HttpMethod.GET, '/api/v1/admin/model-config');
    const modelConfigPut = addRoute('AdminModelConfigUpdate', 'admin/model-config.ts', apigw.HttpMethod.PUT, '/api/v1/admin/model-config');
    for (const fn of [modelConfigGet.function, modelConfigPut.function]) {
      modelDebugToggle.grantRead(fn);
      modelDebugToggle.grantWrite(fn);
      activeModelParam.grantRead(fn);
      activeModelParam.grantWrite(fn);
    }

    // Admin: warranty companies (tenants) + their rulesets. Onboard/edit at
    // runtime — no deploy needed to add a company with its own rules.
    addRoute('AdminWarrantyCompaniesList', 'admin/warranty-companies.ts', apigw.HttpMethod.GET, '/api/v1/admin/warranty-companies', {
      readTables: [props.warrantyCompaniesTable],
    });
    addRoute('AdminWarrantyCompaniesCreate', 'admin/warranty-companies.ts', apigw.HttpMethod.POST, '/api/v1/admin/warranty-companies', {
      writeTables: [props.warrantyCompaniesTable],
    });
    addRoute('AdminWarrantyCompanyGet', 'admin/warranty-companies.ts', apigw.HttpMethod.GET, '/api/v1/admin/warranty-companies/{companyId}', {
      readTables: [props.warrantyCompaniesTable],
    });
    addRoute('AdminWarrantyCompanyUpdate', 'admin/warranty-companies.ts', apigw.HttpMethod.PUT, '/api/v1/admin/warranty-companies/{companyId}', {
      writeTables: [props.warrantyCompaniesTable],
    });

    // Admin: a company's repairer network — add/toggle links + list (TRX-78).
    addRoute('AdminNetworkList', 'admin/network-links.ts', apigw.HttpMethod.GET, '/api/v1/admin/warranty-companies/{companyId}/network', {
      readTables: [props.networkLinksTable, props.organisationsTable],
    });
    addRoute('AdminNetworkUpsert', 'admin/network-links.ts', apigw.HttpMethod.PUT, '/api/v1/admin/warranty-companies/{companyId}/network', {
      writeTables: [props.networkLinksTable],
      readTables: [props.organisationsTable],
    });
    // Admin: issue/rotate a company's ingestion API key (TRX-14/79).
    addRoute('AdminIngestKey', 'admin/warranty-company-key.ts', apigw.HttpMethod.POST, '/api/v1/admin/warranty-companies/{companyId}/ingest-key', {
      writeTables: [props.warrantyCompaniesTable],
    });

    // ===== Warranty-company job ingestion (system-to-system, API-key auth) =====
    // No Cognito JWT — authenticated in-handler by the x-api-key header, so the
    // gateway authorizer is off (auth:false). Mapping a real company's payload
    // onto this canonical contract is TRX-15 (external, blocked).
    const ingestSubmit = addRoute('IngestSubmit', 'ingest/submit.ts', apigw.HttpMethod.POST, '/api/v1/ingest/jobs', {
      auth: false,
      writeTables: [props.casesTable, props.ingestionsTable],
      readTables: [props.warrantyCompaniesTable],
    });
    ingestSubmit.function.addEnvironment('TRIAGE_WORKER_FUNCTION', triageWorker.function.functionName);
    triageWorker.function.grantInvoke(ingestSubmit.function);
    addRoute('IngestStatus', 'ingest/status.ts', apigw.HttpMethod.GET, '/api/v1/ingest/jobs', {
      auth: false,
      readTables: [props.ingestionsTable, props.warrantyCompaniesTable],
    });

    // ===== Payments (Stripe) =====
    // Stripe secret (JSON: { secretKey }) lives in Secrets Manager, created
    // out-of-band; fetched at runtime by name.
    const stripeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'StripeApiKey',
      `corexpert/${config.stage}/stripe`,
    );

    // Accepting a job adds the match fee to the repairer's monthly invoice, so
    // the accept Lambda (registered above) needs the Stripe key.
    stripeSecret.grantRead(jobsAccept.function);
    jobsAccept.function.addEnvironment('STRIPE_SECRET_NAME', stripeSecret.secretName);

    // Repairer subscription — Checkout (subscription mode) that captures the
    // card and starts the £60/month subscription.
    const subscribe = addRoute('RepairerSubscribe', 'repairers/subscribe.ts', apigw.HttpMethod.POST, '/api/v1/repairer/subscription', {
      readTables: [props.usersTable],
    });
    stripeSecret.grantRead(subscribe.function);
    subscribe.function.addEnvironment('STRIPE_SECRET_NAME', stripeSecret.secretName);
    subscribe.function.addEnvironment('STRIPE_PRICE_ID', config.stripePriceId);
    subscribe.function.addEnvironment('FRONTEND_URL', config.frontendUrl);

    // Manage billing — a Stripe-hosted Billing Portal (invoices, card, cancel).
    const billingPortal = addRoute('RepairerBillingPortal', 'repairers/billing-portal.ts', apigw.HttpMethod.POST, '/api/v1/repairer/billing-portal', {
      readTables: [props.usersTable],
    });
    stripeSecret.grantRead(billingPortal.function);
    billingPortal.function.addEnvironment('STRIPE_SECRET_NAME', stripeSecret.secretName);
    billingPortal.function.addEnvironment('FRONTEND_URL', config.frontendUrl);

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
      props.usersTable.grantReadWriteData(stripeEvents.function);

      // Naming an event bus after the partner source associates the two.
      const stripeBus = new events.CfnEventBus(this, 'StripeEventBus', {
        name: config.stripeEventSourceName,
        eventSourceName: config.stripeEventSourceName,
      });
      const stripeRule = new events.Rule(this, 'StripeEventRule', {
        eventBus: events.EventBus.fromEventBusName(this, 'StripeBusRef', config.stripeEventSourceName),
        description: 'Route Stripe checkout + subscription events to the processor',
        eventPattern: {
          detailType: [
            'checkout.session.completed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
            'invoice.payment_failed',
          ],
        },
        targets: [new eventsTargets.LambdaFunction(stripeEvents.function)],
      });
      // The referenced bus must exist before the rule attaches to it.
      stripeRule.node.addDependency(stripeBus);
    }

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.apiEndpoint });
  }
}
