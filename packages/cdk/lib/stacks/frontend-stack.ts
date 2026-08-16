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

/** An extra consumer distribution per white-label client. `brand` must match a
 *  brand id in apps/consumer/src/branding/brands.ts. */
interface WhiteLabelDefinition {
  id: string;
  brand: string;
}

const WHITE_LABELS: WhiteLabelDefinition[] = [
  { id: 'ConsumerPrecision', brand: 'precision' },
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
    const buckets: Record<string, s3.Bucket> = {};
    const distPaths: Record<string, string> = {};
    const shells: Record<string, s3deploy.BucketDeployment> = {};

    for (const spa of SPAS) {
      const distPath = path.join(__dirname, '..', '..', '..', '..', 'apps', spa.app, 'dist');
      distPaths[spa.app] = distPath;

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

      const distribution = this.spaDistribution(
        `${spa.id}Distribution`,
        bucket,
        `corexpert-${config.stage} ${spa.app}`,
      );

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
      shells[spa.app] = shell;

      this.distributionDomains[spa.app] = distribution.distributionDomainName;

      new cdk.CfnOutput(this, `${spa.id}Url`, {
        value: `https://${distribution.distributionDomainName}`,
        description: `${spa.app} app URL`,
      });
      new cdk.CfnOutput(this, `${spa.id}DistributionId`, {
        value: distribution.distributionId,
      });

      buckets[spa.app] = bucket;
    }

    // White-label consumer portals. Each gets its own CloudFront distribution
    // over the SAME bucket and the SAME bundle — the SPA picks its brand from
    // the hostname at runtime (apps/consumer/src/branding/brands.ts), so a new
    // client costs a distribution and a config entry, not a second build.
    // A custom domain later means adding domainNames + an ACM cert (us-east-1)
    // to the distribution below; nothing else changes.
    const consumerBucket = buckets['consumer'];
    if (!consumerBucket) {
      throw new Error('Consumer bucket missing — white-label distributions cannot be created.');
    }

    const consumerDistPath = distPaths['consumer'];
    const consumerShell = shells['consumer'];
    if (!consumerDistPath || !consumerShell) {
      throw new Error('Consumer build output missing — white-label distributions cannot be created.');
    }

    for (const label of WHITE_LABELS) {
      const distribution = this.spaDistribution(
        `${label.id}Distribution`,
        consumerBucket,
        `corexpert-${config.stage} consumer (${label.brand})`,
      );

      // Each white-label portal is its own CloudFront distribution over the
      // shared consumer bucket, so it has its own edge cache — and only the
      // distribution handed to a BucketDeployment gets invalidated. Without
      // this, a release invalidated the main consumer distribution and left
      // every white-label portal to expire on its own.
      //
      // In practice index.html is served max-age=0/must-revalidate and the
      // assets are content-hashed, so a portal does pick up a new release
      // without an invalidation. This is the belt to that pair of braces: it
      // makes the guarantee explicit rather than dependent on those headers
      // staying exactly as they are.
      //
      // Re-uploads index.html only (prune: false), which is what carries the
      // asset hashes; the fingerprinted files are already in the bucket from
      // the consumer deployment above.
      const invalidation = new s3deploy.BucketDeployment(this, `${label.id}Shell`, {
        sources: [s3deploy.Source.asset(consumerDistPath, { exclude: ['*', '!index.html'] })],
        destinationBucket: consumerBucket,
        distribution,
        distributionPaths: ['/*'],
        prune: false,
        cacheControl: [
          s3deploy.CacheControl.setPublic(),
          s3deploy.CacheControl.maxAge(cdk.Duration.seconds(0)),
          s3deploy.CacheControl.mustRevalidate(),
        ],
      });
      // Must follow the consumer deployment, which prunes the bucket.
      invalidation.node.addDependency(consumerShell);

      this.distributionDomains[`consumer-${label.brand}`] = distribution.distributionDomainName;

      new cdk.CfnOutput(this, `${label.id}Url`, {
        value: `https://${distribution.distributionDomainName}`,
        description: `consumer app URL, ${label.brand} brand`,
      });
      new cdk.CfnOutput(this, `${label.id}DistributionId`, {
        value: distribution.distributionId,
      });
    }
  }

  /**
   * A CloudFront distribution fronting an SPA bucket via Origin Access Control.
   * Shared by the per-app distributions and the white-label ones so their
   * caching and routing behaviour cannot drift apart.
   */
  private spaDistribution(
    id: string,
    bucket: s3.IBucket,
    comment: string,
  ): cloudfront.Distribution {
    return new cloudfront.Distribution(this, id, {
      comment,
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
  }
}
