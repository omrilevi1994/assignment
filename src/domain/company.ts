import { z } from "zod";

/** Profile fields in the order they appear in the company workbook. */
export const COMPANY_FIELDS = [
  "company_name",
  "company_type",
  "business",
  "primary_markets",
  "manufacturing_footprint",
  "revenue_mix",
  "strategic_priorities",
  "critical_dependencies",
  "key_exposures",
  "risk_posture",
  "decision_horizon",
  "chat_user",
] as const;

export type CompanyField = (typeof COMPANY_FIELDS)[number];

/**
 * The company profile. It is context for analysis, never evidence that an
 * event occurred; answers may cite a field but may not treat it as a fact
 * about the outside world.
 */
export const CompanyProfileSchema = z.object(
  Object.fromEntries(COMPANY_FIELDS.map((field) => [field, z.string().min(1)])) as Record<
    CompanyField,
    z.ZodString
  >,
);

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
