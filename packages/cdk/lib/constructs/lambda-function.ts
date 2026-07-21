import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface AppLambdaProps {
  entry: string;
  handler?: string;
  memorySize?: number;
  timeout?: cdk.Duration;
  environment?: Record<string, string>;
  description?: string;
}

/**
 * Reusable Lambda construct with standard configuration for all COREXPERT handlers.
 */
export class AppLambda extends Construct {
  public readonly function: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AppLambdaProps) {
    super(scope, id);

    this.function = new nodejs.NodejsFunction(this, 'Handler', {
      entry: props.entry,
      handler: props.handler ?? 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        ...props.environment,
      },
      description: props.description,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        esbuildArgs: { '--tree-shaking': 'true' },
        // ESM output has no `require`, `__dirname`, or `__filename`, but some
        // CommonJS dependencies (e.g. jimp -> node-fetch -> whatwg-url, and
        // @jimp/plugin-print) reference them at load time. Shim all three so
        // those modules load instead of crashing ("Dynamic require of X is not
        // supported" / "__dirname is not defined in ES module scope").
        banner:
          'import{createRequire as __cr}from"module";import{fileURLToPath as __ftu}from"url";import{dirname as __dn}from"path";const require=__cr(import.meta.url);const __filename=__ftu(import.meta.url);const __dirname=__dn(__filename);',
      },
    });
  }
}
