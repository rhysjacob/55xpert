import type { APIGatewayProxyResultV2 } from 'aws-lambda';

/** Build a JSON response with the given status code and body. */
export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

/** 200 OK with data. */
export function ok<T>(data: T): APIGatewayProxyResultV2 {
  return jsonResponse(200, { success: true, data });
}

/** 201 Created with data. */
export function created<T>(data: T): APIGatewayProxyResultV2 {
  return jsonResponse(201, { success: true, data });
}

/** 204 No Content. */
export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204 };
}
