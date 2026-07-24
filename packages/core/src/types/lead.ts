/** Which marketing form a lead came from. */
export const LeadType = {
  /** Customer "register interest" (warranty/fleet/broker/insurer/MGA). */
  REGISTER_INTEREST: 'REGISTER_INTEREST',
  /** "Speak to a member of our team" contact form. */
  CONTACT: 'CONTACT',
} as const;
export type LeadType = (typeof LeadType)[keyof typeof LeadType];

/**
 * A captured marketing lead (TRX-71). Common fields are lifted out for listing;
 * the full form submission is kept in `data` so each form can carry its own
 * shape without a schema change.
 */
export interface Lead {
  leadId: string;
  type: LeadType;
  name?: string;
  email: string;
  phone?: string;
  organisation?: string;
  /** The full, form-specific submission. */
  data: Record<string, unknown>;
  createdAt: string;
}
