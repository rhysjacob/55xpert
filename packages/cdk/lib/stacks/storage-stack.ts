import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments';

export interface StorageStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class StorageStack extends cdk.Stack {
  public readonly imagesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { config } = props;
    const removal = config.removalPolicy === 'destroy'
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: `corexpert-${config.stage}-images-${this.account}`,
      removalPolicy: removal,
      autoDeleteObjects: config.removalPolicy === 'destroy',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          // Restricted to the known SPA origins (+ localhost in dev), not '*' (TRX-72).
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: config.appOrigins,
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          id: 'cleanup-incomplete-uploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
    });

    new cdk.CfnOutput(this, 'ImagesBucketName', { value: this.imagesBucket.bucketName });
    new cdk.CfnOutput(this, 'ImagesBucketArn', { value: this.imagesBucket.bucketArn });
  }
}
