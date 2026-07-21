/** UK postcode regex (basic validation). */
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function isValidPostcode(postcode: string): boolean {
  return UK_POSTCODE_REGEX.test(postcode.trim());
}

/** Basic UK registration plate format validation. */
const UK_REG_REGEX = /^[A-Z]{2}\d{2}\s?[A-Z]{3}$/i;

export function isValidRegistration(reg: string): boolean {
  return UK_REG_REGEX.test(reg.trim());
}

/** Validate email format. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/** Generate a case reference number. Format: CX-YYYYMMDD-XXXX */
export function generateCaseReference(): string {
  const date = new Date();
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CX-${dateStr}-${random}`;
}
