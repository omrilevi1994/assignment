import { describe, expect, it } from "vitest";
import { COMPANY_FIELDS, CompanyProfileSchema } from "@/domain/company";

const profile = {
  company_name: "Asteron Systems",
  company_type: "Fictional multinational industrial-technology company",
  business: "Designs and manufactures connected industrial equipment.",
  primary_markets: "European Union; North America",
  manufacturing_footprint: "Owned manufacturing in Poland and Malaysia.",
  revenue_mix: "65% hardware; 25% software; 10% aftermarket.",
  strategic_priorities: "Grow recurring software revenue.",
  critical_dependencies: "Advanced semiconductors; hyperscale cloud.",
  key_exposures: "Semiconductor supply constraints; cloud outages.",
  risk_posture: "Moderate risk appetite, low tolerance for interruption.",
  decision_horizon: "6-24 months.",
  chat_user: "A strategy manager at Asteron Systems.",
};

/** Returns a copy of `obj` without `key`, typed loosely on purpose for negative tests. */
function without<T extends object>(obj: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...obj };
  delete copy[key];
  return copy;
}

describe("CompanyProfileSchema", () => {
  it("accepts a complete profile", () => {
    expect(CompanyProfileSchema.parse(profile)).toEqual(profile);
  });

  it("rejects a profile with a missing field", () => {
    expect(CompanyProfileSchema.safeParse(without(profile, "key_exposures")).success).toBe(false);
  });

  it("rejects an empty field value", () => {
    expect(CompanyProfileSchema.safeParse({ ...profile, risk_posture: "" }).success).toBe(false);
  });

  it("lists the twelve profile fields in workbook order", () => {
    expect(COMPANY_FIELDS).toEqual(Object.keys(profile));
  });
});
