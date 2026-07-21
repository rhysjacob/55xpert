import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import {
  AVAILABLE_MODELS,
  isAllowedModel,
  estimateCostPerCasePence,
  PER_CASE_TOKEN_PROFILE,
  ValidationError,
  ForbiddenError,
} from '@corexpert/core';
import { getModelConfig, setActiveModel, setDebugEnabled } from '../../lib/model-config';

/** Models enriched with the estimated per-assessment cost (GBP pence). */
const modelsWithCost = AVAILABLE_MODELS.map((m) => ({
  ...m,
  estCostPerCasePence: estimateCostPerCasePence(m.pricing),
}));

const updateSchema = z
  .object({
    debugEnabled: z.boolean().optional(),
    activeModel: z.string().min(1).optional(),
  })
  .refine((b) => b.debugEnabled !== undefined || b.activeModel !== undefined, {
    message: 'Provide debugEnabled and/or activeModel',
  });

/**
 * Admin debug panel: read/set the AI triage model. Selecting a model only takes
 * effect while the `/corexpert/{stage}/features/model-debug` SSM toggle is on;
 * with it off, triage always uses the deploy-time default and this endpoint is
 * read-only.
 */
async function modelConfigHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN', 'XPERT');

  const envDefault = process.env['AI_MODEL_ID'] ?? '';
  const method = event.requestContext.http.method;

  if (method === 'GET') {
    const cfg = await getModelConfig(envDefault);
    return ok({ ...cfg, envDefault, availableModels: modelsWithCost, tokenProfile: PER_CASE_TOKEN_PROFILE });
  }

  // PUT — flip the debug toggle and/or change the active model.
  const body = parseBody(event, updateSchema);

  if (body.debugEnabled !== undefined) {
    await setDebugEnabled(body.debugEnabled);
  }

  if (body.activeModel !== undefined) {
    if (!isAllowedModel(body.activeModel)) {
      throw new ValidationError('Model is not in the allowed list');
    }
    // Picking a model is only meaningful with debug on — either already on, or
    // being turned on in this same request.
    const debugNow = body.debugEnabled ?? (await getModelConfig(envDefault)).debugEnabled;
    if (!debugNow) {
      throw new ForbiddenError('Enable debug mode before selecting a model');
    }
    await setActiveModel(body.activeModel);
  }

  const cfg = await getModelConfig(envDefault);
  return ok({ ...cfg, envDefault, availableModels: AVAILABLE_MODELS });
}

export const handler = withErrorHandler(modelConfigHandler);
