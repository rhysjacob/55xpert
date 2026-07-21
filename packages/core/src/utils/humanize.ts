/**
 * Turn a SNAKE_CASE / UPPER_CASE enum value into a human-readable Title Case
 * label, e.g. `SMART_REPAIR` → "Smart Repair", `PAINT_DAMAGE` → "Paint Damage".
 * For labels that need special punctuation (e.g. "Repair & Paint"), use an
 * explicit label map instead.
 */
export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
