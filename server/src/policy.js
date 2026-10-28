// Terms and commission policy constants.
// Terms: the operator entity, effective date and privacy policy are NOT yet
// decided (see docs/TICH_HOP_TAI_LIEU.md), so the version stays a draft.
export const TERMS_VERSION = "PC-TERMS-2026.2-DRAFT";
export const TERMS_STATUS = "draft";

// Commission: proposal only. Tiers apply one rate to the whole base (not
// progressive). Rates are in basis points to keep the math in integers.
export const COMMISSION_POLICY_VERSION = "PC-COMM-2026.0-PROPOSED";
export const COMMISSION_TIERS = [
  { minInclusive: 0, maxExclusive: 1_000_000, rateBps: 500 },
  { minInclusive: 1_000_000, maxExclusive: 2_000_000, rateBps: 400 },
  { minInclusive: 2_000_000, maxExclusive: Infinity, rateBps: 300 },
];
export const COMMISSION_ROUNDING = "half-up-vnd";
export const COMMISSION_BASIS = "baseRental";
// Not confirmed by the business: which booking statuses count as "successful".
export const COMMISSION_ELIGIBLE_STATUSES = ["Completed"];
const MAX_BASE = 1_000_000_000_000;

export const commissionTrialEnabled = () =>
  String(process.env.COMMISSION_TRIAL_ENABLED || "").toLowerCase() === "true";

export function commissionFor(baseAmount) {
  if (
    typeof baseAmount !== "number" ||
    !Number.isSafeInteger(baseAmount) ||
    baseAmount < 0 ||
    baseAmount > MAX_BASE
  )
    throw new RangeError("Giá trị cơ sở tính hoa hồng không hợp lệ");
  const tier = COMMISSION_TIERS.find(
    (item) => baseAmount >= item.minInclusive && baseAmount < item.maxExclusive,
  );
  return {
    policyVersion: COMMISSION_POLICY_VERSION,
    basis: COMMISSION_BASIS,
    baseAmount,
    rateBps: tier.rateBps,
    rate: tier.rateBps / 10000,
    rounding: COMMISSION_ROUNDING,
    amount: Math.floor((baseAmount * tier.rateBps + 5000) / 10000),
  };
}
