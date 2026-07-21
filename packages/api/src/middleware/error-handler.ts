import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@corexpert/core';
import { jsonResponse } from '../lib/response';

type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

/**
 * Wraps a Lambda handler with error handling.
 * Catches AppError instances and returns structured JSON error responses.
 */
export function withErrorHandler(handler: Handler): Handler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof AppError) {
        return jsonResponse(error.statusCode, {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }

      console.error('Unhandled error:', error);
      return jsonResponse(500, {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  };
}
