import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@corexpert/db';

/** Scan every item of a table (paged), projecting the given attributes. */
export async function scanAll<T>(table: string, projection: string, names?: Record<string, string>): Promise<T[]> {
  const items: T[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: projection,
      ...(names ? { ExpressionAttributeNames: names } : {}),
      ExclusiveStartKey: key,
    }));
    items.push(...((res.Items ?? []) as T[]));
    key = res.LastEvaluatedKey;
  } while (key);
  return items;
}

/** YYYY-MM from an ISO timestamp. */
export const monthKey = (iso?: string): string | undefined => (iso ? iso.slice(0, 7) : undefined);

/** Whole hours between two ISO timestamps (b − a). */
export const hoursBetween = (a: string, b: string): number =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

/** The last 12 calendar months as YYYY-MM keys, oldest → newest, from a base ISO date. */
export function last12Months(nowIso: string): string[] {
  const [y, m] = nowIso.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
