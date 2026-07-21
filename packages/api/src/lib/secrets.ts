import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

/** Warm-invocation cache: secret name → resolved value. */
const cache = new Map<string, string>();

/**
 * Fetch a secret string from AWS Secrets Manager, cached for the lifetime of the
 * Lambda execution environment (secrets rarely rotate mid-invocation, and this
 * avoids a GetSecretValue call on every request).
 *
 * The secret VALUE never lives in code or environment — only its name is passed
 * in via env (e.g. VEHICLE_LOOKUP_SECRET_NAME).
 */
export async function getSecret(secretName: string): Promise<string> {
  const cached = cache.get(secretName);
  if (cached !== undefined) return cached;

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  const value = result.SecretString;
  if (value === undefined) {
    throw new Error(`Secret ${secretName} has no string value`);
  }

  cache.set(secretName, value);
  return value;
}
