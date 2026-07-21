export interface EnvironmentConfig {
  stage: string;
  region: string;
  removalPolicy: 'destroy' | 'retain';
  introductionFee: number; // pence
  confidenceThreshold: number;
  aiProvider: string;
  aiModelId: string;
  /** OneAutoAPI base URL (sandbox for dev, production for prod). */
  oneAutoBaseUrl: string;
  /** Active warranty ruleset id (see packages/core/src/schemes). */
  warrantyScheme: string;
  /**
   * Minutes a repairer has to pay the introduction fee after accepting, before
   * the job is released back to the Xchange. Seeds the SSM parameter; admins can
   * change it at runtime without a redeploy.
   */
  paymentGraceMinutes: number;
}

export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  dev: {
    stage: 'dev',
    region: 'eu-west-2',
    removalPolicy: 'destroy',
    introductionFee: 2500, // £25
    confidenceThreshold: 0.7,
    aiProvider: 'bedrock-claude',
    aiModelId: 'eu.anthropic.claude-sonnet-4-6',
    // Dev uses sandbox: the live Experian AutoCheck subscription/key returns 403
    // until activated in the OneAutoAPI dashboard. Flip to api.oneautoapi.com then.
    oneAutoBaseUrl: 'https://sandbox.oneautoapi.com',
    warrantyScheme: 'company-2025',
    paymentGraceMinutes: 30,
  },
  prod: {
    stage: 'prod',
    region: 'eu-west-2',
    removalPolicy: 'retain',
    introductionFee: 2500,
    confidenceThreshold: 0.7,
    aiProvider: 'bedrock-claude',
    aiModelId: 'eu.anthropic.claude-sonnet-4-6',
    oneAutoBaseUrl: 'https://api.oneautoapi.com',
    warrantyScheme: 'company-2025',
    paymentGraceMinutes: 30,
  },
};
