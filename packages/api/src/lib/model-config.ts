import { SSMClient, GetParametersCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

/**
 * Runtime AI-model configuration, backed by SSM Parameter Store.
 *
 * Two parameters (per stage):
 *  - `/corexpert/{stage}/features/model-debug` — feature toggle ("true"/"false").
 *    When off, triage always uses the deploy-time AI_MODEL_ID env default.
 *  - `/corexpert/{stage}/ai/active-model` — the model id used while debug is on.
 *
 * This lets an admin switch the triage model from the UI without a redeploy,
 * gated behind the SSM toggle. All reads fail safe: any SSM error falls back to
 * the env default so triage never breaks because of a config lookup.
 */

const STAGE = process.env['STAGE'] ?? 'dev';
export const MODEL_DEBUG_PARAM = `/corexpert/${STAGE}/features/model-debug`;
export const ACTIVE_MODEL_PARAM = `/corexpert/${STAGE}/ai/active-model`;

const ssm = new SSMClient({});

export interface ModelConfig {
  debugEnabled: boolean;
  activeModel: string;
}

/** Read the toggle + active model. Falls back to `envDefault` on any error. */
export async function getModelConfig(envDefault: string): Promise<ModelConfig> {
  try {
    const res = await ssm.send(
      new GetParametersCommand({ Names: [MODEL_DEBUG_PARAM, ACTIVE_MODEL_PARAM] }),
    );
    const byName = new Map((res.Parameters ?? []).map((p) => [p.Name, p.Value ?? '']));
    const debugEnabled = (byName.get(MODEL_DEBUG_PARAM) ?? 'false').toLowerCase() === 'true';
    const activeModel = byName.get(ACTIVE_MODEL_PARAM) || envDefault;
    return { debugEnabled, activeModel };
  } catch {
    return { debugEnabled: false, activeModel: envDefault };
  }
}

/**
 * Resolve the model id triage should use: the active model when debug is on,
 * otherwise the deploy-time env default.
 */
export async function resolveTriageModel(envDefault: string): Promise<string> {
  const cfg = await getModelConfig(envDefault);
  return cfg.debugEnabled ? cfg.activeModel : envDefault;
}

/** Persist a new active model (admin-only; caller must validate the id). */
export async function setActiveModel(modelId: string): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: ACTIVE_MODEL_PARAM,
      Value: modelId,
      Type: 'String',
      Overwrite: true,
    }),
  );
}

/** Turn the model-debug feature toggle on/off (admin-only). */
export async function setDebugEnabled(enabled: boolean): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: MODEL_DEBUG_PARAM,
      Value: enabled ? 'true' : 'false',
      Type: 'String',
      Overwrite: true,
    }),
  );
}
