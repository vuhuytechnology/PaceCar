import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { seed } from "./seed.js";
const dir = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.PACECAR_DB_FILE
  ? path.resolve(process.env.PACECAR_DB_FILE)
  : path.join(dir, "db.json");
fs.mkdirSync(path.dirname(file), { recursive: true });

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString("hex")}`;
};

const migrateLegacyPasswords = (data) => {
  let changed = false;
  for (const user of data.users || []) {
    if (!user.passwordHash && typeof user.password === "string") {
      user.passwordHash = hashPassword(user.password);
      changed = true;
    }
    if (Object.hasOwn(user, "password")) {
      delete user.password;
      changed = true;
    }
  }
  return changed;
};

const bookingDate = (value, endOfDay = false) => {
  if (typeof value !== "string") return new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
  return new Date(value);
};

const reconcileBookingStatuses = (data, now = new Date()) => {
  let changed = false;
  const nextId = (items) =>
    Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;

  for (const booking of data.bookings || []) {
    const start = bookingDate(booking.startDate);
    const end = bookingDate(booking.endDate, true);
    let nextStatus = null;
    let reason = null;

    if (
      ["Pending", "Accepted", "Deposit Required"].includes(booking.status) &&
      Number.isFinite(start.getTime()) &&
      start < now
    ) {
      nextStatus = "Expired";
      reason = "Booking chưa sẵn sàng trước thời điểm nhận xe";
    } else if (
      ["Contract Signed", "Ready for Check-in"].includes(booking.status) &&
      Number.isFinite(end.getTime()) &&
      end < now
    ) {
      nextStatus = "Expired";
      reason = "Thời gian thuê đã kết thúc nhưng chưa check-in";
    } else if (
      booking.status === "Ongoing" &&
      Number.isFinite(end.getTime()) &&
      end < now
    ) {
      nextStatus = "Check-out Review";
      reason = "Thời gian thuê đã kết thúc; cần đối soát trả xe";
    }

    if (!nextStatus) continue;
    const previous = booking.status;
    const changedAt = now.toISOString();
    booking.status = nextStatus;
    booking.statusReason = reason;
    booking.autoUpdatedAt = changedAt;
    data.auditLogs.push({
      id: nextId(data.auditLogs),
      entity: "booking",
      entityId: booking.id,
      action: "STATUS_AUTO_UPDATED",
      actorId: null,
      detail: `${previous} -> ${nextStatus}: ${reason}`,
      createdAt: changedAt,
    });
    for (const userId of new Set([booking.renterId, booking.ownerId]))
      data.notifications.push({
        id: nextId(data.notifications),
        userId,
        title: "Booking được cập nhật tự động",
        message: `Booking #PC${booking.id} đã tự chuyển từ ${previous} sang ${nextStatus}.`,
        type: "booking",
        read: false,
        createdAt: changedAt,
      });
    changed = true;
  }
  return changed;
};

export function read() {
  if (!fs.existsSync(file))
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = migrateLegacyPasswords(data);
  data.notifications ||= [
    {
      id: 1,
      userId: 4,
      title: "Yêu cầu thuê xe mới",
      message: "Nguyễn Minh An muốn thuê Toyota Vios 2022.",
      type: "booking",
      read: false,
      createdAt: "2026-07-11T09:15:00.000Z",
    },
    {
      id: 2,
      userId: 1,
      title: "Booking đang chờ duyệt",
      message: "Yêu cầu #PC1 đã được gửi đến chủ xe.",
      type: "booking",
      read: false,
      createdAt: "2026-07-10T12:00:00.000Z",
    },
    {
      id: 3,
      userId: 4,
      title: "Cảnh báo GPS",
      message: "Tín hiệu GPS của Hyundai Accent 2022 bị gián đoạn.",
      type: "risk",
      read: false,
      createdAt: "2026-07-11T08:30:00.000Z",
    },
  ];
  data.auditLogs ||= [];
  if (reconcileBookingStatuses(data)) changed = true;
  data.sessions ||= [];
  const storedSessionCount = data.sessions.length;
  const activeSessions = data.sessions
    .filter((session) => new Date(session.expiresAt) > new Date())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const sessionCountByUser = new Map();
  data.sessions = activeSessions.filter((session) => {
    const count = sessionCountByUser.get(session.userId) || 0;
    sessionCountByUser.set(session.userId, count + 1);
    return count < 5;
  });
  if (data.sessions.length !== storedSessionCount) changed = true;
  data.uploadedAssets ||= [];
  data.favorites ||= [];
  data.quotes ||= [];
  data.termsConsents ||= [];
  data.reports ||= [];
  data.commissions ||= [];
  data.promotions ||= [
    {
      id: 1,
      code: "PACECAR10",
      title: "Khởi hành tiết kiệm",
      description: "Giảm 10% tiền thuê cho đơn đủ điều kiện",
      type: "percentage",
      value: 10,
      maxDiscount: 300000,
      minRental: 1000000,
      active: true,
      expiresAt: "2027-12-31T23:59:59.000Z",
    },
    {
      id: 2,
      code: "WEEKEND200",
      title: "Cuối tuần rong chơi",
      description: "Giảm 200.000đ cho đơn từ 3 ngày",
      type: "fixed",
      value: 200000,
      maxDiscount: 200000,
      minDays: 3,
      active: true,
      expiresAt: "2027-12-31T23:59:59.000Z",
    },
  ];
  data.pricingPolicy ||= {
    version: "PC-2026.3",
    platformFeeRate: 0.1,
    insurancePerDay: 80000,
    weekendSurchargeRate: 0.15,
    driverFeePerDay: 350000,
    handoverSupportedFrom: "06:00",
    handoverSupportedUntil: "22:00",
    handoverStandardFrom: "08:00",
    handoverStandardUntil: "20:00",
    handoverOutsideFee: 100000,
    longRentalDiscounts: [
      { minDays: 7, rate: 0.1 },
      { minDays: 3, rate: 0.05 },
    ],
    quoteTtlMinutes: 15,
  };
  if (data.pricingPolicy.driverFeePerDay == null) {
    data.pricingPolicy.driverFeePerDay = 350000;
    changed = true;
  }
  const handoverDefaults = {
    handoverSupportedFrom: "06:00",
    handoverSupportedUntil: "22:00",
    handoverStandardFrom: "08:00",
    handoverStandardUntil: "20:00",
    handoverOutsideFee: 100000,
  };
  for (const [key, value] of Object.entries(handoverDefaults)) {
    if (data.pricingPolicy[key] == null) {
      data.pricingPolicy[key] = value;
      changed = true;
    }
  }
  if (["PC-2026.1", "PC-2026.2"].includes(data.pricingPolicy.version)) {
    data.pricingPolicy.version = "PC-2026.3";
    changed = true;
  }
  const welcomePromotion = data.promotions.find(
    (promotion) => promotion.code === "PACECAR10",
  );
  if (
    welcomePromotion &&
    welcomePromotion.description !== "Giảm 10% tiền thuê cho đơn đủ điều kiện"
  ) {
    welcomePromotion.description = "Giảm 10% tiền thuê cho đơn đủ điều kiện";
    changed = true;
  }
  data.reviews ||= [
    {
      id: 1,
      bookingId: 3,
      carId: 2,
      renterId: 1,
      rating: 5,
      comment: "Xe sạch, chủ xe hỗ trợ rất tốt.",
      createdAt: "2026-06-23T10:00:00.000Z",
    },
    {
      id: 2,
      bookingId: 7,
      carId: 9,
      renterId: 2,
      rating: 4,
      comment: "Xe đúng mô tả, giao nhận nhanh.",
      createdAt: "2026-04-05T10:00:00.000Z",
    },
  ];
  data.riskAlerts ||= [
    {
      id: 1,
      ownerId: 4,
      carId: 1,
      type: "GPS_LOST",
      severity: "High",
      message: "Tín hiệu GPS bị gián đoạn",
      status: "Open",
      createdAt: "2026-07-11T08:30:00.000Z",
    },
    {
      id: 2,
      ownerId: 4,
      bookingId: 2,
      type: "RENTER_RISK",
      severity: "Medium",
      message: "Người thuê có mức rủi ro trung bình",
      status: "Open",
      createdAt: "2026-07-10T08:30:00.000Z",
    },
    {
      id: 3,
      ownerId: 4,
      bookingId: 4,
      type: "LONG_DURATION",
      severity: "Medium",
      message: "Thời gian thuê vượt mức thông thường",
      status: "Resolved",
      createdAt: "2026-07-08T08:30:00.000Z",
    },
  ];
  const defaultHandoverPoints = {
    "Hà Đông, Hà Nội": "Bến xe Yên Nghĩa, Hà Đông",
    "Hòa Lạc, Hà Nội": "Khu công nghệ cao Hòa Lạc",
    "Cầu Giấy, Hà Nội": "Công viên Cầu Giấy",
    "Mỹ Đình, Hà Nội": "Bến xe Mỹ Đình",
    "Nội thành Hà Nội": "Công viên Thống Nhất, Hai Bà Trưng",
    "Tây Hồ, Hà Nội": "Lotte Mall Tây Hồ",
    "Long Biên, Hà Nội": "Aeon Mall Long Biên",
    "Hai Bà Trưng, Hà Nội": "Công viên Thống Nhất, Hai Bà Trưng",
    "Thanh Xuân, Hà Nội": "Royal City, Thanh Xuân",
    "Gia Lâm, Hà Nội": "Vincom Mega Mall Ocean Park",
    "Hoàn Kiếm, Hà Nội": "Nhà hát Lớn Hà Nội",
    "Nội Bài, Hà Nội": "Sảnh đến T1, sân bay Nội Bài",
  };
  // Keep the curated demo catalog current on persistent Render disks while
  // preserving bookings and any owner-created listings.
  const catalogFields = [
    "catalogKey",
    "name",
    "brand",
    "model",
    "year",
    "location",
    "handoverPoint",
    "seats",
    "transmission",
    "fuel",
    "type",
    "pricePerDay",
    "deposit",
    "withDriverAvailable",
    "selfDriveAvailable",
    "imageUrl",
    "imageSourceUrl",
    "imageCredit",
    "description",
  ];
  for (const catalogCar of seed.cars) {
    let storedCar = data.cars.find(
      (car) => car.catalogKey === catalogCar.catalogKey,
    );
    if (!storedCar && catalogCar.id <= 10) {
      const legacyCar = data.cars.find((car) => car.id === catalogCar.id);
      if (legacyCar && [4, 5, 6].includes(legacyCar.ownerId))
        storedCar = legacyCar;
    }
    if (!storedCar) {
      const idTaken = data.cars.some((car) => car.id === catalogCar.id);
      const nextId = Math.max(0, ...data.cars.map((car) => car.id)) + 1;
      data.cars.push({
        ...structuredClone(catalogCar),
        id: idTaken ? nextId : catalogCar.id,
      });
      changed = true;
      continue;
    }
    for (const field of catalogFields) {
      if (storedCar[field] !== catalogCar[field]) {
        storedCar[field] = catalogCar[field];
        changed = true;
      }
    }
    if (
      !Array.isArray(storedCar.photos) ||
      storedCar.photos.length !== 1 ||
      storedCar.photos[0] !== catalogCar.imageUrl
    ) {
      storedCar.photos = [catalogCar.imageUrl];
      changed = true;
    }
  }
  data.cars = data.cars.map((car) => ({
    listingStatus: "Published",
    photos: car.imageUrl ? [car.imageUrl] : [],
    documents: [],
    amenities: [],
    rules: {
      mileageLimit: 300,
      lateFeePerHour: 120000,
      noSmoking: true,
      petsAllowed: false,
    },
    deliveryOptions: {
      ownerDelivery: true,
      pickupAtCar: true,
      deliveryFee: 150000,
    },
    minRentalDays: 1,
    maxRentalDays: 30,
    instantBooking: false,
    updatedAt: car.updatedAt || "2026-07-01T00:00:00.000Z",
    ...car,
    handoverPoint:
      car.handoverPoint || defaultHandoverPoints[car.location] || car.location,
  }));
  data.evidence ||= [];
  for (const evidence of data.evidence) {
    if (
      typeof evidence.notes === "string" &&
      (evidence.notes.includes("\uFFFD") ||
        /[A-Za-zÀ-ỹ]\?[A-Za-zÀ-ỹ]/u.test(evidence.notes))
    ) {
      const original = seed.evidence.find(
        (item) => item.bookingId === evidence.bookingId,
      );
      if (original) {
        evidence.notes = original.notes;
        changed = true;
      }
    }
  }
  if (changed) write(data);
  return data;
}
export function write(data) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
  return data;
}
export function reset() {
  const data = structuredClone(seed);
  migrateLegacyPasswords(data);
  write(data);
}
