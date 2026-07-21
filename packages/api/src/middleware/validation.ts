import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ZodSchema } from 'zod';
import { ValidationError } from '@corexpert/core';

/** Parse and validate the request body against a Zod schema. */
export function parseBody<T>(event: APIGatewayProxyEventV2, schema: ZodSchema<T>): T {
  if (!event.body) {
    throw new ValidationError('Request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError('Validation failed', result.error.flatten());
  }

  return result.data;
}

/** Extract a path parameter, throwing if not found. */
export function getPathParam(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw new ValidationError(`Missing path parameter: ${name}`);
  }
  return value;
}

/** Extract query string parameters with optional defaults. */
export function getQueryParam(
  event: APIGatewayProxyEventV2,
  name: string,
  defaultValue?: string,
): string | undefined {
  return event.queryStringParameters?.[name] ?? defaultValue;
}
