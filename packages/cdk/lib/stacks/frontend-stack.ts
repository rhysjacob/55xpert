import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments';

export interface FrontendStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

/** One SPA: the workspace directory it builds from, and its construct id. */
interface SpaDefinition {
  id: string;
  /** Directory under apps/, e.g. 'consumer'. */
  app: string;
}

const SPAS: SpaDefinition[] = [
  { id: 'Consumer', app: 'consumer' },
  { id: 'Repairer', app: 'repairer' },
  { id: 'Admin', app: 'admin' },
];

/**
 * Static hosting for the three SPAs: one private bucket + CloudFront
 * distribution each, fronted by Origin Access Control.
 *
 * The apps must be built before synth — Vite inlines VITE_* at build time, so
 * the bundles cannot be parameterised from CloudFormation tokens here. Run
 * `pnpm build:web` first; synth fails with a pointed error if dist/ is missing.
 */
export class FrontendStack extends cdk.Stack {
  public readonly distributionDomains: Record<string, string> = {};

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { config } = props;
    const destroy = config.removalPolicy === 'destroy';
    const removal = destroy ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;

    for (const spa of SPAS) {
      const distPath = path.join(__dirname, '..', '..', '..', '..', 'apps', spa.app, 'dist');

      if (!fs.existsSync(path.join(distPath, 'index.html'))) {
        throw new Error(
          `Missing build output for the ${spa.app} app at ${distPath}. ` +
            `Run \`pnpm build:web\` (or \`cd apps/${spa.app} && pnpm build\`) before deploying.`,
        );
      }

      const bucket = new s3.Bucket(this, `${spa.id}Bucket`, {
        bucketName: `corexpert-${config.stage}-web-${spa.app}-${this.account}`,
        removalPolicy: removal,
        autoDeleteObjects: destroy,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
      });

      const distribution = new cloudfront.Distribution(this, `${spa.id}Distribution`, {
        comment: `corexpert-${config.stage} ${spa.app}`,
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        // Client-side routing: React Router owns every path, so unmatched keys
        // must serve the shell rather than an S3 error document.
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(0),
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      });

      // Fingerprinted assets are immutable; index.html must never be cached or
      // clients pin to a stale bundle after a deploy.
      const assets = new s3deploy.BucketDeployment(this, `${spa.id}Assets`, {
        sources: [s3deploy.Source.asset(distPath, { exclude: ['index.html'] })],
        destinationBucket: bucket,
        distribution,
        distributionPaths: ['/*'],
        prune: true,
        cacheControl: [
          s3deploy.CacheControl.setPublic(),
          s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
          s3deploy.CacheControl.immutable(),
        ],
      });

      const shell = new s3deploy.BucketDeployment(this, `${spa.id}Shell`, {
        sources: [s3deploy.Source.asset(distPath, { exclude: ['*', '!index.html'] })],
        destinationBucket: bucket,
        prune: false,
        cacheControl: [
          s3deploy.CacheControl.setPublic(),
          s3deploy.CacheControl.maxAge(cdk.Duration.seconds(0)),
          s3deploy.CacheControl.mustRevalidate(),
        ],
      });
      // Assets deployment prunes; it must land before the shell is re-uploaded.
      shell.node.addDependency(assets);

      this.distributionDomains[spa.app] = distribution.distributionDomainName;

      new cdk.CfnOutput(this, `${spa.id}Url`, {
        value: `https://${distribution.distributionDomainName}`,
        description: `${spa.app} app URL`,
      });
      new cdk.CfnOutput(this, `${spa.id}DistributionId`, {
        value: distribution.distributionId,
      });
    }
  }
}
