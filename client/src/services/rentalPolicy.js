export const HANDOVER_POLICY = {
  supportedFrom: "00:00",
  supportedUntil: "23:59",
  standardFrom: "08:00",
  standardUntil: "20:00",
  outsideHoursFee: 100000,
};

export const RENTAL_POLICY = {
  version: "PC-2026.4",
  dailyMileageAllowanceKm: 250,
  extraMileageFeePerKm: 3000,
  longRentalMinDays: 5,
  longRentalDiscountRate: 0.05,
  deliveryFeePerKm: 10000,
  batteryShortfallFeePerPercent: 2000,
  pickupCollateralCash: 15000000,
  weekendReturnDeadline: "21:00",
  weekendLateFeePerHour: 50000,
};

const minutes = (value) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

export function validateHandoverTimes(startTime, endTime) {
  const start = minutes(startTime);
  const end = minutes(endTime);
  const earliest = minutes(HANDOVER_POLICY.supportedFrom);
  const latest = minutes(HANDOVER_POLICY.supportedUntil);
  if (start == null || end == null)
    return "Vui lòng chọn đủ giờ nhận và trả xe";
  if (start < earliest || start > latest || end < earliest || end > latest)
    return `PaceCar hỗ trợ bàn giao từ ${HANDOVER_POLICY.supportedFrom} đến ${HANDOVER_POLICY.supportedUntil}`;
  return "";
}
