import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { read, write } from "./data/store.js";
import { TERMS_STATUS, TERMS_VERSION } from "./policy.js";
import { hasPendingPriceRevision, registerDealRoutes } from "./dealRoutes.js";
const app = express();
app.set("trust proxy", process.env.TRUST_PROXY || "loopback");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(","),
  }),
);
app.use(express.json({ limit: "2mb" }));
const appDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(appDir, "../../client/dist");
const uploadRoot = process.env.PACECAR_UPLOAD_DIR
  ? path.resolve(process.env.PACECAR_UPLOAD_DIR)
  : path.resolve(appDir, "../uploads");
const uploadDir = path.join(uploadRoot, "cars");
const documentDir = path.join(uploadRoot, "documents");
const evidenceDir = path.join(uploadRoot, "evidence");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(documentDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
read();
app.use(
  "/api/uploads/files",
  express.static(uploadDir, { fallthrough: false, maxAge: "7d" }),
);
const find = (arr, id) => arr.find((x) => x.id === Number(id));
const publicUser = (user) =>
  user &&
  Object.fromEntries(
    Object.entries(user).filter(
      ([key]) => !["password", "passwordHash", "consents"].includes(key),
    ),
  );
const publicOwnerSummary = (user) =>
  user && {
    id: user.id,
    name: user.name,
    verified: user.verified,
    trustScore: user.trustScore,
    riskLevel: user.riskLevel,
  };
const publicReviewerSummary = (user) =>
  user && {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
const publicCar = (car) => {
  if (!car) return null;
  const { documents, rejectionReason, reviewedBy, ...safe } = car;
  return {
    ...safe,
    licensePlate: car.licensePlate
      ? `***${String(car.licensePlate).slice(-5)}`
      : undefined,
  };
};
const publicReviewSummary = (data, carId) => {
  const reviews = data.reviews.filter((review) => review.carId === carId);
  return {
    reviewCount: reviews.length,
    rating: reviews.length
      ? Number(
          (
            reviews.reduce(
              (total, review) => total + Number(review.rating),
              0,
            ) / reviews.length
          ).toFixed(1),
        )
      : null,
  };
};
const bookingCarFor = (user, car) =>
  user?.role === "renter" ? publicCar(car) : car;
const bookingView = (data, booking, viewer) => ({
  ...booking,
  reviewed: data.reviews.some((review) => review.bookingId === booking.id),
  car: bookingCarFor(viewer, find(data.cars, booking.carId)),
  renter: publicUser(find(data.users, booking.renterId)),
  owner: publicUser(find(data.users, booking.ownerId)),
});
const nextId = (items) =>
  Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
const promotionUsageCount = (data, code) =>
  data.bookings.filter(
    (booking) =>
      booking.status !== "Rejected" &&
      String(booking.promoCode || "").toUpperCase() ===
        String(code).toUpperCase(),
  ).length;
const promotionIsAvailable = (data, promotion, now = new Date()) =>
  Boolean(
    promotion &&
    promotion.active &&
    !promotion.archivedAt &&
    (!promotion.startsAt || new Date(promotion.startsAt) <= now) &&
    new Date(promotion.expiresAt) > now &&
    (!promotion.usageLimit ||
      promotionUsageCount(data, promotion.code) < promotion.usageLimit),
  );
const normalizePromotion = (body, current = {}) => {
  const code = String(body.code ?? current.code ?? "")
      .trim()
      .toUpperCase(),
    title = String(body.title ?? current.title ?? "").trim(),
    description = String(body.description ?? current.description ?? "").trim(),
    type = String(body.type ?? current.type ?? "percentage"),
    value = Number(body.value ?? current.value),
    maxDiscount = Number(
      body.maxDiscount ?? current.maxDiscount ?? (type === "fixed" ? value : 0),
    ),
    minRental = Number(body.minRental ?? current.minRental ?? 0),
    minDays = Number(body.minDays ?? current.minDays ?? 1),
    usageLimitRaw = body.usageLimit ?? current.usageLimit ?? null,
    usageLimit =
      usageLimitRaw === "" || usageLimitRaw === null
        ? null
        : Number(usageLimitRaw),
    startsAtRaw = body.startsAt ?? current.startsAt ?? null,
    expiresAtRaw = body.expiresAt ?? current.expiresAt,
    startsAt = startsAtRaw ? new Date(startsAtRaw) : null,
    expiresAt = new Date(expiresAtRaw);
  if (!/^[A-Z0-9_-]{3,24}$/.test(code))
    return {
      error: "Mã ưu đãi cần 3–24 ký tự A-Z, 0-9, gạch ngang hoặc gạch dưới",
    };
  if (title.length < 3 || title.length > 120)
    return { error: "Tên ưu đãi cần từ 3 đến 120 ký tự" };
  if (description.length > 500)
    return { error: "Mô tả ưu đãi tối đa 500 ký tự" };
  if (!["percentage", "fixed"].includes(type))
    return { error: "Loại ưu đãi không hợp lệ" };
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    (type === "percentage" && value > 100)
  )
    return { error: "Giá trị ưu đãi không hợp lệ" };
  if (!Number.isFinite(maxDiscount) || maxDiscount < 0)
    return { error: "Mức giảm tối đa không hợp lệ" };
  if (!Number.isFinite(minRental) || minRental < 0)
    return { error: "Giá trị đơn tối thiểu không hợp lệ" };
  if (!Number.isInteger(minDays) || minDays < 1 || minDays > 365)
    return { error: "Số ngày thuê tối thiểu phải từ 1 đến 365" };
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))
    return { error: "Giới hạn lượt dùng phải là số nguyên dương" };
  if (!Number.isFinite(expiresAt.getTime()))
    return { error: "Ngày hết hạn không hợp lệ" };
  if (startsAt && !Number.isFinite(startsAt.getTime()))
    return { error: "Ngày bắt đầu không hợp lệ" };
  if (startsAt && startsAt >= expiresAt)
    return { error: "Ngày hết hạn phải sau ngày bắt đầu" };
  return {
    value: {
      code,
      title,
      description,
      type,
      value,
      maxDiscount: type === "fixed" ? value : maxDiscount,
      minRental,
      minDays,
      usageLimit,
      startsAt: startsAt?.toISOString() || null,
      expiresAt: expiresAt.toISOString(),
      active:
        body.active === undefined
          ? (current.active ?? true)
          : Boolean(body.active),
    },
  };
};
const tokenHash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString("hex")}`;
};
const verifyPassword = (password, stored) => {
  if (!stored) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64),
    target = Buffer.from(expected, "hex");
  return (
    actual.length === target.length && crypto.timingSafeEqual(actual, target)
  );
};
const currentUser = (req, data) => {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const session = data.sessions.find(
    (item) =>
      item.tokenHash === tokenHash(token) &&
      new Date(item.expiresAt) > new Date(),
  );
  return session ? find(data.users, session.userId) : null;
};
const requireRole = (roles) => (req, res, next) => {
  const data = read(),
    user = currentUser(req, data);
  if (!user) return res.status(401).json({ message: "Vui lòng đăng nhập" });
  if (!roles.includes(user.role))
    return res
      .status(403)
      .json({ message: "Bạn không có quyền thực hiện thao tác này" });
  req.authUser = user;
  next();
};
const imageExtensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const unsupportedMedia = (message) =>
  Object.assign(new Error(message), {
    code: "UNSUPPORTED_MEDIA_TYPE",
    status: 415,
  });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = imageExtensions[file.mimetype] || ".bin";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const carUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(unsupportedMedia("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP"));
  },
});
const documentStorage = multer.diskStorage({
  destination: documentDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});
const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) =>
    ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
      file.mimetype,
    )
      ? cb(null, true)
      : cb(unsupportedMedia("Giấy tờ chỉ chấp nhận ảnh hoặc PDF")),
});
const evidenceStorage = multer.diskStorage({
  destination: evidenceDir,
  filename: (req, file, cb) => {
    const ext = imageExtensions[file.mimetype] || ".bin";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const evidenceUpload = multer({
  storage: evidenceStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) =>
    imageExtensions[file.mimetype]
      ? cb(null, true)
      : cb(unsupportedMedia("Bằng chứng chỉ chấp nhận ảnh JPG, PNG hoặc WEBP")),
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn thử đăng nhập quá nhiều lần, vui lòng chờ 15 phút" },
});
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn tải tệp quá nhanh, vui lòng thử lại sau" },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn tạo tài khoản quá nhanh, vui lòng thử lại sau" },
});
const quoteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn yêu cầu báo giá quá nhanh, vui lòng thử lại sau" },
});
const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Bạn gửi yêu cầu đặt xe quá nhanh, vui lòng thử lại sau",
  },
});
const listingErrors = (car) => {
  const errors = [];
  for (const field of [
    "name",
    "brand",
    "model",
    "year",
    "licensePlate",
    "location",
    "seats",
    "transmission",
    "fuel",
    "type",
    "pricePerDay",
    "deposit",
    "description",
  ]) {
    if (
      car[field] === undefined ||
      car[field] === null ||
      String(car[field]).trim() === ""
    )
      errors.push(`Thiếu ${field}`);
  }
  if (
    !Number.isFinite(Number(car.year)) ||
    Number(car.year) < 1990 ||
    Number(car.year) > new Date().getFullYear() + 1
  )
    errors.push("Năm sản xuất không hợp lệ");
  if (
    !Number.isFinite(Number(car.pricePerDay)) ||
    Number(car.pricePerDay) < 100000
  )
    errors.push("Giá thuê tối thiểu là 100.000đ/ngày");
  if (!Number.isFinite(Number(car.deposit)) || Number(car.deposit) < 0)
    errors.push("Tiền cọc không hợp lệ");
  if (!Number.isInteger(Number(car.seats)) || Number(car.seats) < 2)
    errors.push("Số chỗ ngồi không hợp lệ");
  if (
    !Number.isInteger(Number(car.minRentalDays || 1)) ||
    !Number.isInteger(Number(car.maxRentalDays || 30)) ||
    Number(car.minRentalDays || 1) < 1 ||
    Number(car.maxRentalDays || 30) < Number(car.minRentalDays || 1)
  )
    errors.push("Giới hạn ngày thuê không hợp lệ");
  if (!car.selfDriveAvailable && !car.withDriverAvailable)
    errors.push("Cần chọn ít nhất một hình thức thuê");
  if (String(car.description || "").trim().length < 20)
    errors.push("Mô tả cần ít nhất 20 ký tự");
  const photos = Array.isArray(car.photos) ? car.photos : [];
  if (!Array.isArray(car.photos)) errors.push("Danh sách ảnh không hợp lệ");
  if (photos.length < 3) errors.push("Cần ít nhất 3 ảnh xe");
  if (photos.length > 10) errors.push("Chỉ được đăng tối đa 10 ảnh");
  const documents = Array.isArray(car.documents) ? car.documents : [];
  if (!Array.isArray(car.documents))
    errors.push("Danh sách giấy tờ không hợp lệ");
  const documentTypes = new Set(documents.map((d) => d?.type));
  if (!documentTypes.has("registration")) errors.push("Thiếu đăng ký xe");
  if (!documentTypes.has("insurance")) errors.push("Thiếu bảo hiểm xe");
  const rules = car.rules;
  if (rules != null && (typeof rules !== "object" || Array.isArray(rules)))
    errors.push("Quy định thuê xe không hợp lệ");
  else {
    if (
      rules?.mileageLimit !== undefined &&
      (!Number.isFinite(Number(rules.mileageLimit)) ||
        Number(rules.mileageLimit) <= 0)
    )
      errors.push("Giới hạn quãng đường không hợp lệ");
    if (
      rules?.lateFeePerHour !== undefined &&
      (!Number.isFinite(Number(rules.lateFeePerHour)) ||
        Number(rules.lateFeePerHour) < 0)
    )
      errors.push("Phí trả muộn không hợp lệ");
  }
  const delivery = car.deliveryOptions;
  if (
    delivery != null &&
    (typeof delivery !== "object" || Array.isArray(delivery))
  )
    errors.push("Tùy chọn giao xe không hợp lệ");
  else if (
    delivery?.ownerDelivery &&
    (!Number.isFinite(Number(delivery.deliveryFee)) ||
      Number(delivery.deliveryFee) < 0)
  )
    errors.push("Phí giao xe không hợp lệ");
  return errors;
};
const listingFieldNames = [
  "name",
  "brand",
  "model",
  "year",
  "licensePlate",
  "color",
  "location",
  "description",
  "seats",
  "transmission",
  "fuel",
  "type",
  "selfDriveAvailable",
  "withDriverAvailable",
  "pricePerDay",
  "deposit",
  "minRentalDays",
  "maxRentalDays",
  "photos",
  "documents",
  "amenities",
  "rules",
  "deliveryOptions",
  "instantBooking",
  "cancellationPolicy",
  "depositRefundTerms",
];
const listingPayload = (body) => {
  const payload = Object.fromEntries(
    listingFieldNames
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]]),
  );
  for (const field of ["cancellationPolicy", "depositRefundTerms"])
    if (payload[field] !== undefined)
      payload[field] =
        typeof payload[field] === "string"
          ? payload[field].trim().slice(0, 500)
          : "";
  if (
    payload.rules &&
    typeof payload.rules === "object" &&
    !Array.isArray(payload.rules)
  ) {
    payload.rules = { ...payload.rules };
    for (const field of ["mileageLimit", "lateFeePerHour"])
      if (payload.rules[field] !== undefined)
        payload.rules[field] =
          payload.rules[field] === null || payload.rules[field] === ""
            ? Number.NaN
            : Number(payload.rules[field]);
  }
  if (
    payload.deliveryOptions &&
    typeof payload.deliveryOptions === "object" &&
    !Array.isArray(payload.deliveryOptions)
  ) {
    payload.deliveryOptions = { ...payload.deliveryOptions };
    if (payload.deliveryOptions.deliveryFee !== undefined)
      payload.deliveryOptions.deliveryFee =
        payload.deliveryOptions.deliveryFee === null ||
        payload.deliveryOptions.deliveryFee === ""
          ? Number.NaN
          : Number(payload.deliveryOptions.deliveryFee);
  }
  return payload;
};
const activeBookingStatuses = new Set([
  "Pending",
  "Accepted",
  "Deposit Required",
  "Contract Signed",
  "Ready for Check-in",
  "Ongoing",
  "Check-out Review",
  "Dispute",
]);
const canAccessBooking = (user, booking) =>
  user?.role === "admin" ||
  (user?.role === "renter" && booking.renterId === user.id) ||
  (user?.role === "owner" && booking.ownerId === user.id);
const validCalendarDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number),
    parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};
const rentalDateTime = (dateValue, timeValue) =>
  validCalendarDate(dateValue) &&
  typeof timeValue === "string" &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)
    ? `${dateValue}T${timeValue}:00+07:00`
    : null;
const timeMinutes = (value) => {
  const match = String(value || "").match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const policyTimeMinutes = (value) => {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const supportedHandoverTime = (timestamp, policy) => {
  const value = timeMinutes(timestamp),
    start = policyTimeMinutes(policy.handoverSupportedFrom),
    end = policyTimeMinutes(policy.handoverSupportedUntil);
  return (
    value != null &&
    start != null &&
    end != null &&
    value >= start &&
    value <= end
  );
};
const outsideStandardHandover = (timestamp, policy) => {
  const value = timeMinutes(timestamp),
    start = policyTimeMinutes(policy.handoverStandardFrom),
    end = policyTimeMinutes(policy.handoverStandardUntil);
  return (
    value != null &&
    start != null &&
    end != null &&
    (value < start || value > end)
  );
};
const validPeriod = (startDate, endDate) => {
  if (!startDate || !endDate) return false;
  const start = new Date(startDate),
    end = new Date(endDate);
  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    end > start
  );
};
const isPastDate = (value) => {
  const date = new Date(value),
    today = new Date();
  if (!Number.isFinite(date.getTime())) return true;
  if (typeof value === "string" && value.includes("T")) return date < today;
  today.setHours(0, 0, 0, 0);
  return date < today;
};
const rentalDays = (startDate, endDate) =>
  Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
const localCalendarDay = (timestamp, offsetDays = 0) => {
  const datePart = String(timestamp).slice(0, 10);
  if (!validCalendarDate(datePart)) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).getUTCDay();
};
const carAvailable = (data, carId, startDate, endDate) =>
  !data.bookings.some(
    (booking) =>
      booking.carId === Number(carId) &&
      activeBookingStatuses.has(booking.status) &&
      new Date(startDate) < new Date(booking.endDate) &&
      new Date(endDate) > new Date(booking.startDate),
  );
const buildQuote = (data, car, input) => {
  const policy = data.pricingPolicy,
    durationHours = Math.max(
      1,
      Math.ceil(
        (new Date(input.endDate) - new Date(input.startDate)) / 3600000,
      ),
    ),
    days = rentalDays(input.startDate, input.endDate),
    durationLabel =
      durationHours < 24
        ? `${durationHours} giờ (tính 1 ngày)`
        : `${days} ngày`;
  let weekendDays = 0;
  for (let i = 0; i < days; i++) {
    const day = localCalendarDay(input.startDate, i);
    if (day === 0 || day === 6) weekendDays++;
  }
  const baseRental = days * Number(car.pricePerDay),
    weekendSurcharge = Math.round(
      weekendDays * Number(car.pricePerDay) * policy.weekendSurchargeRate,
    );
  const longRule = [...policy.longRentalDiscounts]
      .sort((a, b) => b.minDays - a.minDays)
      .find((rule) => days >= rule.minDays),
    longRentalDiscount = Math.round(baseRental * (longRule?.rate || 0));
  const driverFee =
    input.driverOption === "driver"
      ? days * Number(policy.driverFeePerDay || 0)
      : 0;
  const rentalAfterDiscount =
      baseRental + weekendSurcharge + driverFee - longRentalDiscount,
    platformFee = Math.round(rentalAfterDiscount * policy.platformFeeRate),
    insuranceFee = days * policy.insurancePerDay;
  const deliveryFee =
    input.pickupOption === "delivery"
      ? Number(car.deliveryOptions?.deliveryFee ?? 150000)
      : 0;
  const outsideHoursCount = [input.startDate, input.endDate].filter(
      (timestamp) => outsideStandardHandover(timestamp, policy),
    ).length,
    outsideHoursFee =
      outsideHoursCount * Number(policy.handoverOutsideFee || 0);
  let promoDiscount = 0,
    appliedPromotion = null;
  if (input.promoCode) {
    const promotion = data.promotions.find(
      (item) =>
        item.code.toUpperCase() ===
          String(input.promoCode).trim().toUpperCase() &&
        promotionIsAvailable(data, item),
    );
    if (!promotion)
      throw Object.assign(new Error("Mã ưu đãi không hợp lệ hoặc đã hết hạn"), {
        status: 422,
      });
    if (promotion.minDays && days < promotion.minDays)
      throw Object.assign(
        new Error(`Ưu đãi yêu cầu thuê tối thiểu ${promotion.minDays} ngày`),
        { status: 422 },
      );
    if (promotion.minRental && baseRental < promotion.minRental)
      throw Object.assign(
        new Error(
          `Ưu đãi áp dụng cho tiền thuê từ ${promotion.minRental.toLocaleString("vi-VN")}đ`,
        ),
        { status: 422 },
      );
    promoDiscount =
      promotion.type === "percentage"
        ? Math.min(
            Math.round((rentalAfterDiscount * promotion.value) / 100),
            promotion.maxDiscount || Number.POSITIVE_INFINITY,
          )
        : promotion.value;
    appliedPromotion = { code: promotion.code, title: promotion.title };
  }
  return {
    policyVersion: policy.version,
    days,
    durationHours,
    durationLabel,
    pricePerDay: Number(car.pricePerDay),
    baseRental,
    weekendDays,
    weekendSurcharge,
    driverFee,
    longRentalDiscount,
    platformFee,
    insuranceFee,
    deliveryFee,
    outsideHoursCount,
    outsideHoursFee,
    promoDiscount,
    appliedPromotion,
    deposit: Number(car.deposit),
    totalPrice: Math.max(
      0,
      rentalAfterDiscount +
        platformFee +
        insuranceFee +
        deliveryFee +
        outsideHoursFee -
        promoDiscount,
    ),
  };
};
// Conditions come only from the listing; missing values stay null so the UI
// says "chưa công bố" instead of inventing terms.
const quoteConditions = (car) => ({
  mileageLimitKm: car.rules?.mileageLimit ?? null,
  lateFeePerHour: car.rules?.lateFeePerHour ?? null,
  fuelPolicy: "Giao đầy – trả đầy; nhiên liệu không nằm trong giá thuê",
  cancellationPolicy: car.cancellationPolicy || null,
  depositRefundTerms: car.depositRefundTerms || null,
});
const bookingTransitions = {
  Pending: ["Accepted", "Rejected"],
  Accepted: ["Deposit Required", "Rejected"],
  "Deposit Required": ["Contract Signed", "Rejected"],
  "Contract Signed": ["Ready for Check-in"],
  "Ready for Check-in": ["Ongoing"],
  Ongoing: ["Check-out Review", "Dispute"],
  "Check-out Review": ["Completed", "Dispute"],
  Dispute: ["Completed"],
  Rejected: [],
  Expired: [],
  Completed: [],
};
const contractTermsFor = (booking, car) =>
  [
    "Điều khoản điện tử PaceCar phiên bản PC-TERMS-2026.1.",
    `Xe ${car?.name || `#${booking.carId}`} được thuê từ ${booking.startDate} đến ${booking.endDate}.`,
    "Người thuê sử dụng xe đúng mục đích, hai bên ghi nhận giao nhận bằng bằng chứng trên PaceCar và tuân thủ quy trình xử lý sự cố, bồi thường.",
  ].join(" ");
const contractView = (data, contract, booking) => ({
  ...contract,
  persisted: Boolean(contract.id),
  booking,
  car: publicCar(find(data.cars, booking.carId)),
  renter: publicUser(find(data.users, booking.renterId)),
  owner: publicUser(find(data.users, booking.ownerId)),
});
const evidenceAssetView = (data, value) => {
  const asset = find(data.uploadedAssets, value?.id ?? value);
  return asset?.kind === "evidence"
    ? {
        id: asset.id,
        url: `/api/evidence-assets/${asset.id}`,
        name: asset.originalName,
        type: asset.mimeType,
      }
    : null;
};
const evidenceView = (data, evidence) =>
  evidence && {
    ...evidence,
    checkinPhotos: (evidence.checkinPhotos || [])
      .map((value) => evidenceAssetView(data, value))
      .filter(Boolean),
    checkoutPhotos: (evidence.checkoutPhotos || [])
      .map((value) => evidenceAssetView(data, value))
      .filter(Boolean),
  };
const evidencePhaseComplete = (evidence, phase) => {
  if (!evidence) return false;
  const photos =
      phase === "checkin" ? evidence.checkinPhotos : evidence.checkoutPhotos,
    fuel = phase === "checkin" ? evidence.fuelBefore : evidence.fuelAfter,
    odometer =
      phase === "checkin" ? evidence.odometerBefore : evidence.odometerAfter;
  return (
    Array.isArray(photos) &&
    photos.length > 0 &&
    Number.isFinite(Number(fuel)) &&
    Number.isFinite(Number(odometer))
  );
};
app.get("/api/health", (q, s) => s.json({ ok: true, name: "PaceCar API" }));
app.post(
  "/api/uploads/cars",
  uploadLimiter,
  requireRole(["owner", "admin"]),
  carUpload.array("files", 10),
  (req, res) => {
    if (!req.files?.length)
      return res.status(400).json({ message: "Vui lòng chọn ít nhất một ảnh" });
    res.status(201).json({
      files: req.files.map((file) => ({
        name: file.originalname,
        url: `/api/uploads/files/${file.filename}`,
        size: file.size,
        type: file.mimetype,
      })),
    });
  },
);
app.post(
  "/api/uploads/documents",
  uploadLimiter,
  requireRole(["owner"]),
  documentUpload.array("files", 3),
  (req, res) => {
    if (!req.files?.length)
      return res.status(400).json({ message: "Vui lòng chọn giấy tờ" });
    const data = read(),
      assets = req.files.map((file) => {
        const asset = {
          id: nextId(data.uploadedAssets),
          ownerId: req.authUser.id,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          createdAt: new Date().toISOString(),
        };
        data.uploadedAssets.push(asset);
        return {
          id: asset.id,
          name: asset.originalName,
          type: asset.mimeType,
          url: `/api/private-assets/${asset.id}`,
        };
      });
    write(data);
    res.status(201).json({ files: assets });
  },
);
app.post(
  "/api/uploads/evidence",
  uploadLimiter,
  requireRole(["renter", "owner", "admin"]),
  evidenceUpload.array("files", 6),
  (req, res) => {
    const removeUploadedFiles = () =>
      (req.files || []).forEach((file) => {
        try {
          fs.unlinkSync(path.join(evidenceDir, file.filename));
        } catch {
          // A failed cleanup must not hide the original validation response.
        }
      });
    const data = read(),
      booking = find(data.bookings, req.body.bookingId);
    if (!booking || !canAccessBooking(req.authUser, booking)) {
      removeUploadedFiles();
      return res.status(booking ? 403 : 404).json({
        message: booking
          ? "Bạn không thuộc booking này"
          : "Không tìm thấy booking",
      });
    }
    if (!req.files?.length)
      return res.status(400).json({ message: "Vui lòng chọn ít nhất một ảnh" });
    const files = req.files.map((file) => {
      const asset = {
        id: nextId(data.uploadedAssets),
        kind: "evidence",
        bookingId: booking.id,
        uploaderId: req.authUser.id,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      data.uploadedAssets.push(asset);
      return {
        id: asset.id,
        url: `/api/evidence-assets/${asset.id}`,
        name: asset.originalName,
        type: asset.mimeType,
      };
    });
    write(data);
    res.status(201).json({ files });
  },
);
app.get(
  "/api/evidence-assets/:id",
  requireRole(["renter", "owner", "admin"]),
  (req, res) => {
    const data = read(),
      asset = find(data.uploadedAssets, req.params.id);
    if (!asset || asset.kind !== "evidence")
      return res.status(404).json({ message: "Không tìm thấy bằng chứng" });
    const booking = find(data.bookings, asset.bookingId);
    if (!booking || !canAccessBooking(req.authUser, booking))
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xem bằng chứng này" });
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.type(asset.mimeType).sendFile(path.join(evidenceDir, asset.filename));
  },
);
app.get(
  "/api/private-assets/:id",
  requireRole(["owner", "admin"]),
  (req, res) => {
    const data = read(),
      asset = find(data.uploadedAssets, req.params.id);
    if (!asset) return res.status(404).json({ message: "Không tìm thấy tệp" });
    if (req.authUser.role !== "admin" && asset.ownerId !== req.authUser.id)
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xem tệp này" });
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.type(asset.mimeType).sendFile(path.join(documentDir, asset.filename));
  },
);
app.post("/api/auth/login", loginLimiter, (q, s) => {
  const d = read(),
    password = String(q.body.password || "");
  const u = d.users.find(
    (x) =>
      x.email.toLowerCase() ===
      String(q.body.email || "")
        .trim()
        .toLowerCase(),
  );
  if (!u || password.length > 128 || !verifyPassword(password, u.passwordHash))
    return s.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
  d.sessions = d.sessions.filter(
    (session) => new Date(session.expiresAt) > new Date(),
  );
  const recentUserSessionIds = new Set(
    d.sessions
      .filter((session) => session.userId === u.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 4)
      .map((session) => session.id),
  );
  d.sessions = d.sessions.filter(
    (session) =>
      session.userId !== u.id || recentUserSessionIds.has(session.id),
  );
  const token = crypto.randomBytes(32).toString("hex");
  d.sessions.push({
    id: nextId(d.sessions),
    userId: u.id,
    tokenHash: tokenHash(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  write(d);
  s.json({ ...publicUser(u), token });
});
app.post("/api/auth/logout", (req, res) => {
  const data = read(),
    header = req.header("authorization") || "",
    token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token) {
    data.sessions = data.sessions.filter(
      (session) => session.tokenHash !== tokenHash(token),
    );
    write(data);
  }
  res.json({ ok: true });
});
app.post("/api/auth/register", registerLimiter, (q, s) => {
  const d = read(),
    name = String(q.body.name || "").trim(),
    email = String(q.body.email || "")
      .trim()
      .toLowerCase(),
    password = String(q.body.password || ""),
    phone = String(q.body.phone || "").trim(),
    role = String(q.body.role || "");
  const fields = {};
  if (!name) fields.name = "Vui lòng nhập họ tên.";
  else if (name.length > 120)
    fields.name = "Họ tên không được vượt quá 120 ký tự.";
  if (!email) fields.email = "Vui lòng nhập email.";
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email))
    fields.email = "Email không hợp lệ.";
  if (password.length < 8 || password.length > 128)
    fields.password = "Mật khẩu phải có từ 8 đến 128 ký tự.";
  if (
    !phone ||
    phone.length > 30 ||
    !/^\+?[\d\s().-]+$/u.test(phone) ||
    phone.replace(/\D/gu, "").length < 9 ||
    phone.replace(/\D/gu, "").length > 15
  )
    fields.phone = "Số điện thoại phải có từ 9 đến 15 chữ số.";
  if (!["renter", "owner"].includes(role))
    fields.role = "Vai trò đăng ký không hợp lệ.";
  if (q.body.acceptTerms !== true)
    fields.acceptTerms = "Bạn cần đồng ý với điều khoản để tiếp tục.";
  if (Object.keys(fields).length)
    return s.status(400).json({
      message: "Vui lòng kiểm tra lại thông tin đăng ký.",
      fields,
    });
  if (d.users.some((x) => String(x.email).toLowerCase() === email))
    return s.status(409).json({
      message: "Email đã tồn tại.",
      fields: { email: "Email này đã được sử dụng." },
    });
  const now = new Date();
  const token = crypto.randomBytes(32).toString("hex");
  const u = {
    id: nextId(d.users),
    name: name.slice(0, 120),
    email,
    phone,
    role,
    verified: false,
    trustScore: 50,
    riskLevel: "Medium",
    passwordHash: hashPassword(password),
    consents: {
      termsVersion: TERMS_VERSION,
      acceptedAt: now.toISOString(),
    },
  };
  d.users.push(u);
  d.sessions.push({
    id: nextId(d.sessions),
    userId: u.id,
    tokenHash: tokenHash(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  write(d);
  s.status(201).json({ ...publicUser(u), token });
});
app.get("/api/cars", (req, res) => {
  const data = read();
  let cars = data.cars.filter((car) => car.listingStatus === "Published");
  if (req.query.type) cars = cars.filter((car) => car.type === req.query.type);
  if (req.query.location)
    cars = cars.filter((car) =>
      car.location
        .toLowerCase()
        .includes(String(req.query.location).toLowerCase()),
    );
  res.json(
    cars.map((car) => ({
      ...publicCar(car),
      owner: publicOwnerSummary(find(data.users, car.ownerId)),
      ...publicReviewSummary(data, car.id),
    })),
  );
});
app.get("/api/search/cars", (req, res) => {
  const data = read(),
    viewer = currentUser(req, data);
  let cars = data.cars.filter((car) => car.listingStatus === "Published");
  const {
    location,
    destination,
    startDate,
    startTime,
    endDate,
    endTime,
    type,
    transmission,
    fuel,
    driverOption,
    sort = "recommended",
  } = req.query;
  const periodStart = rentalDateTime(startDate, startTime),
    periodEnd = rentalDateTime(endDate, endTime);
  const hasAnyPeriodField = startDate || startTime || endDate || endTime;
  if (hasAnyPeriodField && !validPeriod(periodStart, periodEnd))
    return res.status(400).json({ message: "Thời gian thuê không hợp lệ" });
  if (hasAnyPeriodField && isPastDate(periodStart))
    return res
      .status(400)
      .json({ message: "Thời gian nhận xe không thể ở trong quá khứ" });
  if (
    hasAnyPeriodField &&
    (!supportedHandoverTime(periodStart, data.pricingPolicy) ||
      !supportedHandoverTime(periodEnd, data.pricingPolicy))
  )
    return res.status(422).json({
      message: `PaceCar hỗ trợ bàn giao từ ${data.pricingPolicy.handoverSupportedFrom} đến ${data.pricingPolicy.handoverSupportedUntil}`,
    });
  if (location)
    cars = cars.filter((car) =>
      car.location.toLowerCase().includes(String(location).toLowerCase()),
    );
  if (type) cars = cars.filter((car) => car.type === type);
  if (transmission)
    cars = cars.filter((car) => car.transmission === transmission);
  if (fuel) cars = cars.filter((car) => car.fuel === fuel);
  if (req.query.seats)
    cars = cars.filter((car) => Number(car.seats) >= Number(req.query.seats));
  if (req.query.minPrice)
    cars = cars.filter(
      (car) => Number(car.pricePerDay) >= Number(req.query.minPrice),
    );
  if (req.query.maxPrice)
    cars = cars.filter(
      (car) => Number(car.pricePerDay) <= Number(req.query.maxPrice),
    );
  if (driverOption === "self")
    cars = cars.filter((car) => car.selfDriveAvailable);
  if (driverOption === "driver")
    cars = cars.filter((car) => car.withDriverAvailable);
  if (req.query.delivery === "true")
    cars = cars.filter((car) => car.deliveryOptions?.ownerDelivery);
  if (req.query.instantBooking === "true")
    cars = cars.filter((car) => car.instantBooking);
  if (periodStart && periodEnd)
    cars = cars.filter((car) =>
      carAvailable(data, car.id, periodStart, periodEnd),
    );
  const favoriteIds = new Set(
    viewer
      ? data.favorites
          .filter((item) => item.userId === viewer.id)
          .map((item) => item.carId)
      : [],
  );
  let items = cars.map((car) => {
    const owner = find(data.users, car.ownerId),
      days = periodStart && periodEnd ? rentalDays(periodStart, periodEnd) : 1,
      reviewSummary = publicReviewSummary(data, car.id);
    return {
      ...publicCar(car),
      owner: publicOwnerSummary(owner),
      favorite: favoriteIds.has(car.id),
      ...reviewSummary,
      estimatedDays: days,
      estimatedTotal: days * Number(car.pricePerDay),
    };
  });
  if (sort === "price-asc") items.sort((a, b) => a.pricePerDay - b.pricePerDay);
  else if (sort === "price-desc")
    items.sort((a, b) => b.pricePerDay - a.pricePerDay);
  else if (sort === "rating")
    items.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  else
    items.sort(
      (a, b) =>
        b.owner?.trustScore +
        b.rating * 10 +
        b.totalTrips / 10 -
        (a.owner?.trustScore + a.rating * 10 + a.totalTrips / 10),
    );
  const page = Math.max(1, Number(req.query.page) || 1),
    limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12)),
    total = items.length;
  items = items.slice((page - 1) * limit, page * limit);
  res.json({
    items,
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    criteria: {
      location: location || "",
      destination: destination || "",
      startDate: startDate || null,
      startTime: startTime || null,
      endDate: endDate || null,
      endTime: endTime || null,
    },
  });
});
app.get("/api/promotions", (req, res) => {
  const data = read();
  res.json(data.promotions.filter((item) => promotionIsAvailable(data, item)));
});
app.get("/api/admin/promotions", requireRole(["admin"]), (req, res) => {
  const data = read();
  res.json(
    data.promotions
      .filter((item) => !item.archivedAt)
      .map((item) => ({
        ...item,
        usageCount: promotionUsageCount(data, item.code),
        available: promotionIsAvailable(data, item),
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0) -
          new Date(a.updatedAt || a.createdAt || 0),
      ),
  );
});
app.post("/api/admin/promotions", requireRole(["admin"]), (req, res) => {
  const data = read(),
    normalized = normalizePromotion(req.body);
  if (normalized.error)
    return res.status(400).json({ message: normalized.error });
  if (
    data.promotions.some(
      (item) =>
        !item.archivedAt && item.code.toUpperCase() === normalized.value.code,
    )
  )
    return res.status(409).json({ message: "Mã ưu đãi đã tồn tại" });
  const now = new Date().toISOString(),
    promotion = {
      id: nextId(data.promotions),
      ...normalized.value,
      createdAt: now,
      updatedAt: now,
    };
  data.promotions.push(promotion);
  data.auditLogs.push({
    id: nextId(data.auditLogs),
    entity: "promotion",
    entityId: promotion.id,
    action: "CREATED",
    actorId: req.authUser.id,
    detail: promotion.code,
    createdAt: now,
  });
  write(data);
  res.status(201).json({
    ...promotion,
    usageCount: 0,
    available: promotionIsAvailable(data, promotion),
  });
});
app.put("/api/admin/promotions/:id", requireRole(["admin"]), (req, res) => {
  const data = read(),
    promotion = find(data.promotions, req.params.id);
  if (!promotion || promotion.archivedAt)
    return res.status(404).json({ message: "Không tìm thấy ưu đãi" });
  const normalized = normalizePromotion(req.body, promotion);
  if (normalized.error)
    return res.status(400).json({ message: normalized.error });
  if (
    data.promotions.some(
      (item) =>
        item.id !== promotion.id &&
        !item.archivedAt &&
        item.code.toUpperCase() === normalized.value.code,
    )
  )
    return res.status(409).json({ message: "Mã ưu đãi đã tồn tại" });
  Object.assign(promotion, normalized.value, {
    updatedAt: new Date().toISOString(),
  });
  data.auditLogs.push({
    id: nextId(data.auditLogs),
    entity: "promotion",
    entityId: promotion.id,
    action: "UPDATED",
    actorId: req.authUser.id,
    detail: promotion.code,
    createdAt: promotion.updatedAt,
  });
  write(data);
  res.json({
    ...promotion,
    usageCount: promotionUsageCount(data, promotion.code),
    available: promotionIsAvailable(data, promotion),
  });
});
app.patch(
  "/api/admin/promotions/:id/status",
  requireRole(["admin"]),
  (req, res) => {
    const data = read(),
      promotion = find(data.promotions, req.params.id);
    if (!promotion || promotion.archivedAt)
      return res.status(404).json({ message: "Không tìm thấy ưu đãi" });
    if (typeof req.body.active !== "boolean")
      return res
        .status(400)
        .json({ message: "Trạng thái ưu đãi không hợp lệ" });
    promotion.active = req.body.active;
    promotion.updatedAt = new Date().toISOString();
    data.auditLogs.push({
      id: nextId(data.auditLogs),
      entity: "promotion",
      entityId: promotion.id,
      action: promotion.active ? "ACTIVATED" : "DEACTIVATED",
      actorId: req.authUser.id,
      detail: promotion.code,
      createdAt: promotion.updatedAt,
    });
    write(data);
    res.json({
      ...promotion,
      usageCount: promotionUsageCount(data, promotion.code),
      available: promotionIsAvailable(data, promotion),
    });
  },
);
app.delete("/api/admin/promotions/:id", requireRole(["admin"]), (req, res) => {
  const data = read(),
    promotion = find(data.promotions, req.params.id);
  if (!promotion || promotion.archivedAt)
    return res.status(404).json({ message: "Không tìm thấy ưu đãi" });
  const now = new Date().toISOString();
  promotion.active = false;
  promotion.archivedAt = now;
  promotion.updatedAt = now;
  data.auditLogs.push({
    id: nextId(data.auditLogs),
    entity: "promotion",
    entityId: promotion.id,
    action: "ARCHIVED",
    actorId: req.authUser.id,
    detail: promotion.code,
    createdAt: now,
  });
  write(data);
  res.status(204).end();
});
app.get(
  "/api/favorites",
  requireRole(["renter", "owner", "admin"]),
  (req, res) => {
    const data = read(),
      ids = data.favorites
        .filter((item) => item.userId === req.authUser.id)
        .map((item) => item.carId);
    res.json(
      data.cars
        .filter(
          (car) => ids.includes(car.id) && car.listingStatus === "Published",
        )
        .map((car) => ({
          ...publicCar(car),
          owner: publicOwnerSummary(find(data.users, car.ownerId)),
          ...publicReviewSummary(data, car.id),
          favorite: true,
        })),
    );
  },
);
app.post(
  "/api/favorites/:carId",
  requireRole(["renter", "owner", "admin"]),
  (req, res) => {
    const data = read(),
      car = find(data.cars, req.params.carId);
    if (!car || car.listingStatus !== "Published")
      return res.status(404).json({ message: "Không tìm thấy xe" });
    if (
      !data.favorites.some(
        (item) => item.userId === req.authUser.id && item.carId === car.id,
      )
    )
      data.favorites.push({
        id: nextId(data.favorites),
        userId: req.authUser.id,
        carId: car.id,
        createdAt: new Date().toISOString(),
      });
    write(data);
    res.status(201).json({ favorite: true });
  },
);
app.delete(
  "/api/favorites/:carId",
  requireRole(["renter", "owner", "admin"]),
  (req, res) => {
    const data = read();
    data.favorites = data.favorites.filter(
      (item) =>
        !(item.userId === req.authUser.id && item.carId === +req.params.carId),
    );
    write(data);
    res.json({ favorite: false });
  },
);
app.post("/api/quotes", quoteLimiter, (req, res) => {
  const data = read(),
    car = find(data.cars, req.body.carId);
  if (!car || car.listingStatus !== "Published")
    return res.status(404).json({ message: "Xe hiện không khả dụng" });
  const driverOption = req.body.driverOption || "self",
    pickupOption = req.body.pickupOption || "pickup";
  if (!["self", "driver"].includes(driverOption))
    return res.status(400).json({ message: "Hình thức thuê không hợp lệ" });
  if (!["pickup", "delivery"].includes(pickupOption))
    return res.status(400).json({ message: "Hình thức nhận xe không hợp lệ" });
  for (const field of ["pickupLocation", "returnLocation"])
    if (
      req.body[field] !== undefined &&
      (typeof req.body[field] !== "string" || req.body[field].length > 160)
    )
      return res
        .status(400)
        .json({ message: "Địa điểm nhận trả xe không hợp lệ" });
  if (
    req.body.destination !== undefined &&
    (typeof req.body.destination !== "string" ||
      req.body.destination.trim().length > 160)
  )
    return res.status(400).json({ message: "Điểm đến dự kiến không hợp lệ" });
  if (
    req.body.promoCode !== undefined &&
    req.body.promoCode !== null &&
    (typeof req.body.promoCode !== "string" ||
      req.body.promoCode.trim().length > 40)
  )
    return res.status(400).json({ message: "Mã ưu đãi không hợp lệ" });
  const quoteInput = {
    startDate: rentalDateTime(req.body.startDate, req.body.startTime),
    endDate: rentalDateTime(req.body.endDate, req.body.endTime),
    driverOption,
    pickupOption,
    pickupLocation:
      String(req.body.pickupLocation || "").trim() || car.location,
    returnLocation:
      String(req.body.returnLocation || "").trim() ||
      String(req.body.pickupLocation || "").trim() ||
      car.location,
    destination: String(req.body.destination || "").trim() || null,
    promoCode:
      String(req.body.promoCode || "")
        .trim()
        .toUpperCase() || null,
  };
  if (!validPeriod(quoteInput.startDate, quoteInput.endDate))
    return res.status(400).json({ message: "Thời gian thuê không hợp lệ" });
  if (
    !supportedHandoverTime(quoteInput.startDate, data.pricingPolicy) ||
    !supportedHandoverTime(quoteInput.endDate, data.pricingPolicy)
  )
    return res.status(422).json({
      message: `PaceCar hỗ trợ bàn giao từ ${data.pricingPolicy.handoverSupportedFrom} đến ${data.pricingPolicy.handoverSupportedUntil}`,
    });
  if (isPastDate(quoteInput.startDate))
    return res
      .status(400)
      .json({ message: "Ngày nhận xe không thể ở trong quá khứ" });
  const days = rentalDays(quoteInput.startDate, quoteInput.endDate);
  if (days < (car.minRentalDays || 1) || days > (car.maxRentalDays || 30))
    return res.status(422).json({
      message: `Thời gian thuê phải từ ${car.minRentalDays || 1} đến ${car.maxRentalDays || 30} ngày`,
    });
  if (!carAvailable(data, car.id, quoteInput.startDate, quoteInput.endDate))
    return res
      .status(409)
      .json({ message: "Xe đã có lịch trong thời gian này" });
  if (driverOption === "self" && !car.selfDriveAvailable)
    return res.status(422).json({ message: "Xe không hỗ trợ tự lái" });
  if (driverOption === "driver" && !car.withDriverAvailable)
    return res.status(422).json({ message: "Xe không hỗ trợ tài xế" });
  if (pickupOption === "delivery" && !car.deliveryOptions?.ownerDelivery)
    return res.status(422).json({ message: "Xe không hỗ trợ giao tận nơi" });
  try {
    const breakdown = buildQuote(data, car, quoteInput),
      user = currentUser(req, data),
      quote = {
        id: crypto.randomUUID(),
        userId: user?.id || null,
        carId: car.id,
        startDate: quoteInput.startDate,
        endDate: quoteInput.endDate,
        driverOption: quoteInput.driverOption,
        pickupOption: quoteInput.pickupOption,
        pickupLocation: quoteInput.pickupLocation,
        returnLocation: quoteInput.returnLocation,
        destination: quoteInput.destination,
        promoCode: quoteInput.promoCode,
        breakdown,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + data.pricingPolicy.quoteTtlMinutes * 60000,
        ).toISOString(),
      };
    data.quotes = data.quotes.filter(
      (item) => new Date(item.expiresAt) > new Date(),
    );
    data.quotes.push(quote);
    write(data);
    res.status(201).json({
      quoteId: quote.id,
      expiresAt: quote.expiresAt,
      car: publicCar(car),
      termsVersion: TERMS_VERSION,
      conditions: quoteConditions(car),
      ...breakdown,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});
app.get("/api/quotes/:id", (req, res) => {
  const data = read(),
    quote = data.quotes.find((item) => item.id === req.params.id);
  if (!quote || new Date(quote.expiresAt) <= new Date())
    return res.status(410).json({ message: "Báo giá đã hết hạn" });
  const viewer = currentUser(req, data);
  if (quote.userId && quote.userId !== viewer?.id)
    return res
      .status(403)
      .json({ message: "Báo giá không thuộc tài khoản của bạn" });
  const car = find(data.cars, quote.carId);
  res.json({
    quoteId: quote.id,
    expiresAt: quote.expiresAt,
    car: publicCar(car),
    startDate: quote.startDate,
    endDate: quote.endDate,
    driverOption: quote.driverOption,
    pickupOption: quote.pickupOption,
    pickupLocation: quote.pickupLocation,
    returnLocation: quote.returnLocation,
    destination: quote.destination || null,
    termsVersion: TERMS_VERSION,
    conditions: quoteConditions(car),
    ...quote.breakdown,
  });
});
app.get(
  "/api/owners/:ownerId/cars",
  requireRole(["owner", "admin"]),
  (req, res) => {
    const data = read();
    if (
      req.authUser.role !== "admin" &&
      req.authUser.id !== +req.params.ownerId
    )
      return res
        .status(403)
        .json({ message: "Bạn không thể xem đội xe của người khác" });
    let cars = data.cars.filter(
      (car) =>
        car.ownerId === +req.params.ownerId && car.listingStatus !== "Archived",
    );
    if (req.query.status)
      cars = cars.filter((car) => car.listingStatus === req.query.status);
    res.json(
      cars.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    );
  },
);
app.get("/api/admin/car-listings", requireRole(["admin"]), (req, res) => {
  const data = read();
  let cars = data.cars;
  if (req.query.status)
    cars = cars.filter((car) => car.listingStatus === req.query.status);
  res.json(
    cars
      .map((car) => ({
        ...car,
        owner: publicUser(find(data.users, car.ownerId)),
      }))
      .sort(
        (a, b) =>
          new Date(b.submittedAt || b.updatedAt) -
          new Date(a.submittedAt || a.updatedAt),
      ),
  );
});
app.get("/api/cars/:id", (q, s) => {
  const d = read(),
    c = find(d.cars, q.params.id);
  if (!c) return s.status(404).json({ message: "Không tìm thấy xe" });
  const viewer = currentUser(q, d);
  if (
    c.listingStatus !== "Published" &&
    viewer?.role !== "admin" &&
    viewer?.id !== c.ownerId
  )
    return s.status(404).json({ message: "Không tìm thấy tin đăng" });
  const isPrivate = viewer?.role === "admin" || viewer?.id === c.ownerId;
  s.json({
    ...(isPrivate ? c : publicCar(c)),
    ...(!isPrivate ? publicReviewSummary(d, c.id) : {}),
    favorite: Boolean(
      viewer &&
      d.favorites.some(
        (favorite) => favorite.userId === viewer.id && favorite.carId === c.id,
      ),
    ),
    owner: isPrivate
      ? publicUser(find(d.users, c.ownerId))
      : publicOwnerSummary(find(d.users, c.ownerId)),
  });
});
app.post("/api/cars", requireRole(["owner"]), (q, s) => {
  const d = read();
  const payload = listingPayload(q.body),
    submitForReview = q.body.submitForReview === true;
  if (
    (payload.documents !== undefined && !Array.isArray(payload.documents)) ||
    (payload.photos !== undefined && !Array.isArray(payload.photos))
  )
    return s
      .status(400)
      .json({ message: "Danh sách ảnh hoặc giấy tờ không hợp lệ" });
  if (
    (payload.documents || []).some((doc) => {
      if (!doc || typeof doc !== "object") return true;
      const asset = find(d.uploadedAssets, doc.assetId);
      return !asset || asset.ownerId !== q.authUser.id;
    })
  )
    return s
      .status(403)
      .json({ message: "Giấy tờ tải lên không thuộc tài khoản của bạn" });
  const x = {
    id: nextId(d.cars),
    ownerId: q.authUser.id,
    verified: false,
    rating: 0,
    totalTrips: 0,
    gpsEnabled: true,
    listingStatus: "Draft",
    photos: [],
    documents: [],
    amenities: [],
    rules: {},
    deliveryOptions: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...payload,
  };
  x.licensePlate = String(x.licensePlate || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (
    x.licensePlate &&
    d.cars.some(
      (car) =>
        String(car.licensePlate || "")
          .toUpperCase()
          .replace(/\s+/g, "") === x.licensePlate,
    )
  )
    return s.status(409).json({ message: "Biển số xe đã tồn tại" });
  for (const field of [
    "year",
    "seats",
    "pricePerDay",
    "deposit",
    "minRentalDays",
    "maxRentalDays",
  ])
    if (x[field] !== undefined) x[field] = Number(x[field]);
  x.imageUrl = x.photos?.[0] || x.imageUrl || "";
  if (submitForReview) {
    const errors = listingErrors(x);
    if (errors.length)
      return s.status(422).json({ message: "Tin đăng chưa đầy đủ", errors });
    if (!q.authUser.verified)
      return s
        .status(403)
        .json({ message: "Chủ xe cần xác thực trước khi gửi duyệt" });
    x.listingStatus = "Pending Review";
    x.submittedAt = new Date().toISOString();
  }
  d.cars.push(x);
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "car",
    entityId: x.id,
    action:
      x.listingStatus === "Pending Review" ? "SUBMITTED" : "DRAFT_CREATED",
    actorId: q.authUser.id,
    detail: x.listingStatus,
    createdAt: new Date().toISOString(),
  });
  if (x.listingStatus === "Pending Review")
    d.notifications.push({
      id: nextId(d.notifications),
      userId: 7,
      title: "Tin xe chờ duyệt",
      message: `${x.name} vừa được gửi duyệt.`,
      type: "listing",
      read: false,
      createdAt: new Date().toISOString(),
    });
  write(d);
  s.status(201).json(x);
});
app.put("/api/cars/:id", requireRole(["owner", "admin"]), (q, s) => {
  const d = read(),
    i = d.cars.findIndex((x) => x.id === +q.params.id);
  if (i < 0) return s.status(404).json({ message: "Không tìm thấy xe" });
  if (q.authUser.role !== "admin" && d.cars[i].ownerId !== q.authUser.id)
    return s.status(403).json({ message: "Bạn không sở hữu xe này" });
  if (
    q.authUser.role !== "admin" &&
    d.cars[i].listingStatus === "Pending Review"
  )
    return s
      .status(409)
      .json({ message: "Tin đang chờ duyệt và tạm thời bị khóa chỉnh sửa" });
  const safeBody = listingPayload(q.body);
  if (
    (safeBody.documents !== undefined && !Array.isArray(safeBody.documents)) ||
    (safeBody.photos !== undefined && !Array.isArray(safeBody.photos))
  )
    return s
      .status(400)
      .json({ message: "Danh sách ảnh hoặc giấy tờ không hợp lệ" });
  if (
    q.authUser.role !== "admin" &&
    (safeBody.documents || []).some((doc) => {
      if (!doc || typeof doc !== "object") return true;
      const asset = find(d.uploadedAssets, doc.assetId);
      return !asset || asset.ownerId !== q.authUser.id;
    })
  )
    return s
      .status(403)
      .json({ message: "Giấy tờ tải lên không thuộc tài khoản của bạn" });
  if (safeBody.licensePlate) {
    safeBody.licensePlate = String(safeBody.licensePlate)
      .toUpperCase()
      .replace(/\s+/g, "");
    if (
      d.cars.some(
        (car) =>
          car.id !== d.cars[i].id &&
          String(car.licensePlate || "")
            .toUpperCase()
            .replace(/\s+/g, "") === safeBody.licensePlate,
      )
    )
      return s.status(409).json({ message: "Biển số xe đã tồn tại" });
  }
  for (const field of [
    "year",
    "seats",
    "pricePerDay",
    "deposit",
    "minRentalDays",
    "maxRentalDays",
  ])
    if (safeBody[field] !== undefined)
      safeBody[field] = Number(safeBody[field]);
  const requiresReview =
      q.authUser.role !== "admin" &&
      ["Published", "Paused"].includes(d.cars[i].listingStatus),
    candidate = {
      ...d.cars[i],
      ...safeBody,
      updatedAt: new Date().toISOString(),
    };
  candidate.imageUrl = candidate.photos?.[0] || candidate.imageUrl || "";
  if (requiresReview) {
    const errors = listingErrors(candidate);
    if (errors.length)
      return s
        .status(422)
        .json({ message: "Tin đăng sau chỉnh sửa chưa đầy đủ", errors });
    candidate.listingStatus = "Pending Review";
    candidate.verified = false;
    candidate.submittedAt = new Date().toISOString();
  }
  d.cars[i] = candidate;
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "car",
    entityId: d.cars[i].id,
    action: "UPDATED",
    actorId: q.authUser.id,
    detail: d.cars[i].listingStatus,
    createdAt: new Date().toISOString(),
  });
  if (requiresReview)
    d.notifications.push({
      id: nextId(d.notifications),
      userId: 7,
      title: "Tin xe đã chỉnh sửa chờ duyệt",
      message: `${d.cars[i].name} vừa được cập nhật và cần duyệt lại.`,
      type: "listing",
      read: false,
      createdAt: new Date().toISOString(),
    });
  write(d);
  s.json(d.cars[i]);
});
app.put(
  "/api/cars/:id/listing-status",
  requireRole(["owner", "admin"]),
  (q, s) => {
    const d = read(),
      car = find(d.cars, q.params.id);
    if (!car) return s.status(404).json({ message: "Không tìm thấy xe" });
    if (q.authUser.role !== "admin" && car.ownerId !== q.authUser.id)
      return s.status(403).json({ message: "Bạn không sở hữu xe này" });
    const target = q.body.status;
    if (q.authUser.role === "owner") {
      const allowed =
        (target === "Pending Review" &&
          ["Draft", "Rejected", "Paused"].includes(car.listingStatus)) ||
        (target === "Paused" && car.listingStatus === "Published");
      if (!allowed)
        return s.status(409).json({
          message: `Không thể chuyển từ ${car.listingStatus} sang ${target}`,
        });
      if (target === "Pending Review") {
        const errors = listingErrors(car);
        if (errors.length)
          return s
            .status(422)
            .json({ message: "Tin đăng chưa đầy đủ", errors });
        if (!q.authUser.verified)
          return s
            .status(403)
            .json({ message: "Tài khoản chủ xe chưa xác thực" });
        car.submittedAt = new Date().toISOString();
        car.verified = false;
      }
    } else {
      if (target === "Published" && car.listingStatus !== "Pending Review")
        return s.status(409).json({ message: "Chỉ có thể duyệt tin đang chờ" });
      if (target === "Rejected" && car.listingStatus !== "Pending Review")
        return s
          .status(409)
          .json({ message: "Chỉ có thể từ chối tin đang chờ" });
      if (!["Published", "Rejected", "Paused"].includes(target))
        return s.status(400).json({ message: "Trạng thái không hợp lệ" });
      if (target === "Published") {
        const errors = listingErrors(car);
        if (errors.length)
          return s
            .status(422)
            .json({ message: "Tin đăng không còn đủ điều kiện duyệt", errors });
      }
      if (target === "Rejected" && !q.body.reason)
        return s.status(400).json({ message: "Cần nhập lý do từ chối" });
      car.reviewedAt = new Date().toISOString();
      car.reviewedBy = q.authUser.id;
      car.rejectionReason = target === "Rejected" ? q.body.reason : null;
      car.verified = target === "Published";
    }
    car.listingStatus = target;
    car.updatedAt = new Date().toISOString();
    d.auditLogs.push({
      id: nextId(d.auditLogs),
      entity: "car",
      entityId: car.id,
      action: "STATUS_CHANGED",
      actorId: q.authUser.id,
      detail: target,
      createdAt: new Date().toISOString(),
    });
    d.notifications.push({
      id: nextId(d.notifications),
      userId: target === "Pending Review" ? 7 : car.ownerId,
      title:
        target === "Pending Review" ? "Tin xe chờ duyệt" : `Tin xe ${target}`,
      message: `${car.name}: ${target}${car.rejectionReason ? ` – ${car.rejectionReason}` : ""}`,
      type: "listing",
      read: false,
      createdAt: new Date().toISOString(),
    });
    write(d);
    s.json(car);
  },
);
app.delete("/api/cars/:id", requireRole(["owner", "admin"]), (q, s) => {
  const d = read();
  const car = find(d.cars, q.params.id);
  if (!car) return s.status(404).json({ message: "Không tìm thấy xe" });
  if (q.authUser.role !== "admin" && car.ownerId !== q.authUser.id)
    return s.status(403).json({ message: "Bạn không sở hữu xe này" });
  if (
    q.authUser.role !== "admin" &&
    !["Draft", "Rejected"].includes(car.listingStatus)
  )
    return s
      .status(409)
      .json({ message: "Chỉ có thể xóa tin nháp hoặc bị từ chối" });
  if (
    d.bookings.some(
      (b) =>
        b.carId === +q.params.id &&
        !["Rejected", "Expired", "Completed"].includes(b.status),
    )
  )
    return s
      .status(409)
      .json({ message: "Không thể xóa xe đang có booking hoạt động" });
  car.listingStatus = "Archived";
  car.archivedAt = new Date().toISOString();
  car.updatedAt = car.archivedAt;
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "car",
    entityId: car.id,
    action: "ARCHIVED",
    actorId: q.authUser.id,
    detail: "Archived",
    createdAt: car.archivedAt,
  });
  write(d);
  s.sendStatus(204);
});
app.get("/api/bookings", requireRole(["renter", "owner", "admin"]), (q, s) => {
  const d = read();
  let bookings = d.bookings;
  if (q.authUser.role === "renter")
    bookings = bookings.filter((b) => b.renterId === q.authUser.id);
  if (q.authUser.role === "owner")
    bookings = bookings.filter((b) => b.ownerId === q.authUser.id);
  if (q.query.renterId)
    bookings = bookings.filter((b) => b.renterId === +q.query.renterId);
  if (q.query.ownerId)
    bookings = bookings.filter((b) => b.ownerId === +q.query.ownerId);
  if (q.query.status)
    bookings = bookings.filter((b) => b.status === q.query.status);
  if (q.query.carId)
    bookings = bookings.filter((b) => b.carId === +q.query.carId);
  s.json(
    bookings
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((b) => bookingView(d, b, q.authUser)),
  );
});
app.get(
  "/api/bookings/:id/timeline",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      booking = find(d.bookings, q.params.id);
    if (!booking)
      return s.status(404).json({ message: "Không tìm thấy booking" });
    if (!canAccessBooking(q.authUser, booking))
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem booking này" });
    s.json(
      d.auditLogs
        .filter(
          (log) => log.entity === "booking" && log.entityId === booking.id,
        )
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    );
  },
);
app.get(
  "/api/bookings/:id",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      b = find(d.bookings, q.params.id);
    if (!b) return s.status(404).json({ message: "Không tìm thấy booking" });
    if (!canAccessBooking(q.authUser, b))
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem booking này" });
    s.json(bookingView(d, b, q.authUser));
  },
);
app.post("/api/bookings", bookingLimiter, requireRole(["renter"]), (q, s) => {
  const d = read();
  const idempotencyKey = String(q.header("idempotency-key") || "").trim();
  if (idempotencyKey.length > 128)
    return s.status(400).json({ message: "Idempotency-Key quá dài" });
  if (idempotencyKey) {
    const existing = d.bookings.find(
      (booking) =>
        booking.renterId === q.authUser.id &&
        booking.idempotencyKey === idempotencyKey,
    );
    if (existing) {
      if (existing.quoteId !== q.body.quoteId)
        return s.status(409).json({
          message: "Idempotency-Key đã được dùng cho một báo giá khác",
        });
      return s.json(existing);
    }
  }
  const quote = d.quotes.find((item) => item.id === q.body.quoteId);
  if (!quote || new Date(quote.expiresAt) <= new Date())
    return s
      .status(410)
      .json({ message: "Báo giá đã hết hạn, vui lòng tính lại" });
  if (quote.consumedAt)
    return s
      .status(409)
      .json({ message: "Báo giá đã được sử dụng, vui lòng tạo báo giá mới" });
  if (quote.userId && quote.userId !== q.authUser.id)
    return s
      .status(403)
      .json({ message: "Báo giá không thuộc tài khoản của bạn" });
  const consent = q.body.consent || {};
  if (consent.policyVersion !== quote.breakdown.policyVersion)
    return s.status(422).json({
      message: "Bạn cần đồng ý đúng phiên bản chính sách của báo giá",
    });
  if (consent.termsAccepted !== true || consent.roleAcknowledged !== true)
    return s.status(422).json({
      message:
        "Bạn cần tự chọn cả hai xác nhận về Điều khoản sử dụng và vai trò của PaceCar",
    });
  if (consent.termsVersion !== TERMS_VERSION)
    return s.status(422).json({
      message: "Điều khoản đã được cập nhật, vui lòng tải lại trang và xác nhận lại",
    });
  const car = find(d.cars, quote.carId),
    renter = q.authUser;
  if (!car || car.listingStatus !== "Published")
    return s.status(409).json({ message: "Xe hiện không nhận booking" });
  const days = rentalDays(quote.startDate, quote.endDate);
  if (days < (car.minRentalDays || 1) || days > (car.maxRentalDays || 30))
    return s.status(422).json({
      message: `Thời gian thuê phải từ ${car.minRentalDays || 1} đến ${car.maxRentalDays || 30} ngày`,
    });
  if (quote.driverOption === "self" && !car.selfDriveAvailable)
    return s.status(422).json({ message: "Xe không hỗ trợ tự lái" });
  if (quote.driverOption === "driver" && !car.withDriverAvailable)
    return s.status(422).json({ message: "Xe không hỗ trợ tài xế" });
  if (!["self", "driver"].includes(quote.driverOption))
    return s
      .status(409)
      .json({ message: "Báo giá có hình thức thuê không hợp lệ" });
  if (!["pickup", "delivery"].includes(quote.pickupOption))
    return s
      .status(409)
      .json({ message: "Báo giá có hình thức nhận xe không hợp lệ" });
  if (quote.pickupOption === "delivery" && !car.deliveryOptions?.ownerDelivery)
    return s.status(422).json({ message: "Xe không còn hỗ trợ giao tận nơi" });
  const overlaps = d.bookings.some(
    (b) =>
      b.carId === car.id &&
      activeBookingStatuses.has(b.status) &&
      new Date(quote.startDate) < new Date(b.endDate) &&
      new Date(quote.endDate) > new Date(b.startDate),
  );
  if (overlaps)
    return s
      .status(409)
      .json({ message: "Xe đã có lịch thuê trong khoảng thời gian này" });
  if (quote.promoCode) {
    const promotion = d.promotions.find(
      (item) =>
        String(item.code).toUpperCase() ===
        String(quote.promoCode).toUpperCase(),
    );
    if (!promotionIsAvailable(d, promotion))
      return s.status(409).json({
        message:
          "Mã ưu đãi đã hết lượt sử dụng. Vui lòng tạo lại báo giá trước khi đặt xe",
      });
  }
  const x = {
    id: nextId(d.bookings),
    renterId: renter.id,
    ownerId: car.ownerId,
    carId: car.id,
    startDate: quote.startDate,
    endDate: quote.endDate,
    pickupLocation: quote.pickupLocation,
    returnLocation: quote.returnLocation,
    destination: quote.destination || null,
    pickupOption: quote.pickupOption,
    driverOption: quote.driverOption,
    notes: String(q.body.notes || "").slice(0, 1000),
    status:
      car.instantBooking && renter.verified && renter.riskLevel === "Low"
        ? "Accepted"
        : "Pending",
    totalPrice: quote.breakdown.totalPrice,
    deposit: quote.breakdown.deposit,
    platformFee: quote.breakdown.platformFee,
    riskLevel: renter.riskLevel,
    quoteId: quote.id,
    promoCode: quote.promoCode,
    pricingSnapshot: quote.breakdown,
    paymentStatus: "Unpaid",
    consent: {
      policyVersion: quote.breakdown.policyVersion,
      termsVersion: TERMS_VERSION,
      termsStatus: TERMS_STATUS,
      termsAccepted: true,
      roleAcknowledged: true,
      acceptedAt: new Date().toISOString(),
    },
    idempotencyKey: idempotencyKey || null,
    createdAt: new Date().toISOString(),
  };
  quote.consumedAt = new Date().toISOString();
  quote.userId = renter.id;
  d.bookings.push(x);
  d.termsConsents.push({
    id: nextId(d.termsConsents),
    userId: renter.id,
    bookingId: x.id,
    quoteId: quote.id,
    carId: car.id,
    termsVersion: TERMS_VERSION,
    termsStatus: TERMS_STATUS,
    acceptedItems: ["terms", "platform_role"],
    acceptedAt: x.consent.acceptedAt,
  });
  d.notifications.push({
    id: nextId(d.notifications),
    userId: x.ownerId,
    title: x.status === "Accepted" ? "Đặt xe nhanh mới" : "Yêu cầu thuê xe mới",
    message:
      x.status === "Accepted"
        ? `Booking #PC${x.id} đã được chấp nhận tự động theo chính sách đặt nhanh.`
        : `Booking #PC${x.id} đang chờ bạn xem xét.`,
    type: "booking",
    read: false,
    createdAt: new Date().toISOString(),
  });
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "booking",
    entityId: x.id,
    action: "CREATED",
    actorId: x.renterId,
    detail: x.status,
    createdAt: new Date().toISOString(),
  });
  write(d);
  s.status(201).json(x);
});
app.post("/api/bookings/:id/payment", requireRole(["renter"]), (q, s) => {
  const d = read(),
    booking = find(d.bookings, q.params.id);
  if (!booking)
    return s.status(404).json({ message: "Không tìm thấy booking" });
  if (booking.renterId !== q.authUser.id)
    return s
      .status(403)
      .json({ message: "Bạn không có quyền thanh toán booking này" });
  if (!["Accepted", "Deposit Required"].includes(booking.status))
    return s.status(409).json({
      message: "Chỉ thanh toán sau khi yêu cầu thuê xe được chấp nhận",
    });
  if (booking.paymentStatus === "Paid")
    return s.json({
      bookingId: booking.id,
      paymentStatus: booking.paymentStatus,
      paidAt: booking.paidAt,
      amount: booking.deposit,
    });
  if (hasPendingPriceRevision(booking))
    return s.status(409).json({
      message: "Vui lòng xác nhận báo giá mới của chủ xe trước khi đặt cọc",
    });
  booking.paymentStatus = "Paid";
  booking.paymentMethod = "Demo payment";
  booking.paidAt = new Date().toISOString();
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "booking",
    entityId: booking.id,
    action: "DEPOSIT_PAYMENT_RECORDED",
    actorId: q.authUser.id,
    detail: String(booking.deposit),
    createdAt: booking.paidAt,
  });
  d.notifications.push({
    id: nextId(d.notifications),
    userId: booking.ownerId,
    title: "Đã ghi nhận thanh toán tiền cọc",
    message: `Booking #PC${booking.id} đã thanh toán tiền cọc (mô phỏng).`,
    type: "payment",
    read: false,
    createdAt: booking.paidAt,
  });
  write(d);
  s.json({
    bookingId: booking.id,
    paymentStatus: booking.paymentStatus,
    paidAt: booking.paidAt,
    amount: booking.deposit,
  });
});
app.put(
  "/api/bookings/:id/status",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      b = find(d.bookings, q.params.id);
    if (!b) return s.sendStatus(404);
    if (!canAccessBooking(q.authUser, b))
      return s
        .status(403)
        .json({ message: "Bạn không có quyền cập nhật booking này" });
    const allowed = [
      "Pending",
      "Accepted",
      "Rejected",
      "Deposit Required",
      "Contract Signed",
      "Ready for Check-in",
      "Ongoing",
      "Check-out Review",
      "Completed",
      "Dispute",
    ];
    if (!allowed.includes(q.body.status))
      return s.status(400).json({ message: "Trạng thái không hợp lệ" });
    const actor = q.authUser,
      isAdmin = actor.role === "admin";
    if (
      actor.role === "renter" &&
      !(
        b.renterId === actor.id &&
        b.status === "Pending" &&
        q.body.status === "Rejected"
      )
    )
      return s
        .status(403)
        .json({ message: "Người thuê chỉ có thể hủy yêu cầu đang chờ" });
    if (actor.role === "owner" && b.ownerId !== actor.id)
      return s.status(403).json({ message: "Bạn không sở hữu booking này" });
    if (q.body.status === "Dispute")
      return s.status(409).json({
        message: "Hãy mở tranh chấp qua trung tâm tranh chấp",
      });
    if (b.status === "Dispute")
      return s.status(409).json({
        message:
          "Booking tranh chấp chỉ được cập nhật qua trung tâm tranh chấp",
      });
    if (q.body.status === "Contract Signed") {
      if (hasPendingPriceRevision(b))
        return s.status(409).json({
          message: "Báo giá mới chưa được người thuê xác nhận",
        });
      const contract = d.contracts.find((item) => item.bookingId === b.id);
      if (!contract?.renterSigned || !contract?.ownerSigned)
        return s.status(409).json({
          message: "Hợp đồng cần đủ chữ ký của người thuê và chủ xe",
        });
    }
    const evidence = d.evidence.find((item) => item.bookingId === b.id);
    if (
      q.body.status === "Ongoing" &&
      !evidencePhaseComplete(evidence, "checkin")
    )
      return s.status(409).json({
        message: "Cần hoàn tất bằng chứng check-in trước khi bắt đầu chuyến",
      });
    if (
      q.body.status === "Check-out Review" &&
      !evidencePhaseComplete(evidence, "checkout")
    )
      return s.status(409).json({
        message: "Cần hoàn tất bằng chứng check-out trước khi đối chiếu",
      });
    if (
      q.body.status === "Completed" &&
      (!evidencePhaseComplete(evidence, "checkin") ||
        !evidencePhaseComplete(evidence, "checkout"))
    )
      return s.status(409).json({
        message: "Cần đủ bằng chứng check-in và check-out trước khi hoàn tất",
      });
    if (
      !isAdmin &&
      !(bookingTransitions[b.status] || []).includes(q.body.status)
    )
      return s.status(409).json({
        message: `Không thể chuyển từ ${b.status} sang ${q.body.status}`,
      });
    const previous = b.status;
    b.status = q.body.status;
    d.auditLogs.push({
      id: nextId(d.auditLogs),
      entity: "booking",
      entityId: b.id,
      action: "STATUS_CHANGED",
      actorId: actor.id,
      detail: `${previous} → ${b.status}`,
      createdAt: new Date().toISOString(),
    });
    d.notifications.push({
      id: nextId(d.notifications),
      userId:
        actor.role === "renter"
          ? b.ownerId
          : actor.role === "owner"
            ? b.renterId
            : b.renterId,
      title: "Booking đã cập nhật",
      message: `Booking #PC${b.id}: ${previous} → ${b.status}.`,
      type: "booking",
      read: false,
      createdAt: new Date().toISOString(),
    });
    write(d);
    s.json(b);
  },
);
app.get(
  "/api/contracts/:bookingId",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      c = d.contracts.find((x) => x.bookingId === +q.params.bookingId),
      b = find(d.bookings, q.params.bookingId);
    if (!b) return s.status(404).json({ message: "Không tìm thấy booking" });
    if (!canAccessBooking(q.authUser, b))
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem hợp đồng này" });
    const contract = c || {
      id: null,
      bookingId: b.id,
      contractNumber: `PC-DRAFT-${b.id}`,
      status: "Draft",
      termsVersion: "PC-TERMS-2026.1",
      terms: contractTermsFor(b, find(d.cars, b.carId)),
      renterSigned: false,
      ownerSigned: false,
    };
    s.json(contractView(d, contract, b));
  },
);
app.post("/api/contracts", requireRole(["owner", "admin"]), (q, s) => {
  const d = read(),
    booking = find(d.bookings, q.body.bookingId);
  if (!booking)
    return s.status(404).json({ message: "Không tìm thấy booking" });
  if (!canAccessBooking(q.authUser, booking))
    return s
      .status(403)
      .json({ message: "Bạn không có quyền tạo hợp đồng cho booking này" });
  if (d.contracts.some((c) => c.bookingId === booking.id))
    return s.status(409).json({ message: "Booking đã có hợp đồng" });
  if (!["Accepted", "Deposit Required"].includes(booking.status))
    return s.status(409).json({
      message: "Chỉ phát hành hợp đồng cho booking đã được chấp nhận",
    });
  if (booking.paymentStatus === "Unpaid")
    return s.status(409).json({
      message:
        "Người thuê cần hoàn tất thanh toán tiền cọc trước khi phát hành hợp đồng",
    });
  const car = find(d.cars, booking.carId);
  const x = {
    id: nextId(d.contracts),
    bookingId: booking.id,
    contractNumber: `PC-${new Date().getFullYear()}-${String(booking.id).padStart(4, "0")}`,
    status: "Draft",
    termsVersion: "PC-TERMS-2026.1",
    terms: contractTermsFor(booking, car),
    pricingSnapshot: booking.pricingSnapshot || {
      totalPrice: booking.totalPrice,
      deposit: booking.deposit,
      platformFee: booking.platformFee,
    },
    renterSigned: false,
    ownerSigned: false,
    createdBy: q.authUser.id,
    createdAt: new Date().toISOString(),
  };
  d.contracts.push(x);
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "contract",
    entityId: x.id,
    action: "ISSUED",
    actorId: q.authUser.id,
    detail: x.termsVersion,
    createdAt: new Date().toISOString(),
  });
  d.notifications.push({
    id: nextId(d.notifications),
    userId: booking.renterId,
    title: "Hợp đồng đã sẵn sàng",
    message: `Hợp đồng ${x.contractNumber} đang chờ chữ ký của bạn.`,
    type: "contract",
    read: false,
    createdAt: new Date().toISOString(),
  });
  write(d);
  s.status(201).json(contractView(d, x, booking));
});
app.put(
  "/api/contracts/:bookingId/sign",
  requireRole(["renter", "owner"]),
  (q, s) => {
    const d = read(),
      booking = find(d.bookings, q.params.bookingId),
      contract = d.contracts.find(
        (item) => item.bookingId === +q.params.bookingId,
      );
    if (!booking || !contract)
      return s.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (!canAccessBooking(q.authUser, booking))
      return s.status(403).json({ message: "Bạn không thuộc hợp đồng này" });
    if (
      !["Accepted", "Deposit Required", "Contract Signed"].includes(
        booking.status,
      )
    )
      return s
        .status(409)
        .json({ message: "Hợp đồng không còn ở trạng thái có thể ký" });
    const signatureField =
        q.authUser.role === "renter" ? "renterSigned" : "ownerSigned",
      signedAtField =
        q.authUser.role === "renter" ? "renterSignedAt" : "ownerSignedAt";
    if (!contract[signatureField] && q.body.consent !== true)
      return s
        .status(422)
        .json({ message: "Bạn cần xác nhận đồng ý trước khi ký hợp đồng" });
    if (contract[signatureField])
      return s.json(contractView(d, contract, booking));
    if (hasPendingPriceRevision(booking))
      return s
        .status(409)
        .json({ message: "Báo giá mới chưa được người thuê xác nhận" });
    {
      contract[signatureField] = true;
      contract[signedAtField] = new Date().toISOString();
      contract.status = "Partially Signed";
      d.auditLogs.push({
        id: nextId(d.auditLogs),
        entity: "contract",
        entityId: contract.id,
        action: "SIGNED",
        actorId: q.authUser.id,
        detail: q.authUser.role,
        createdAt: new Date().toISOString(),
      });
    }
    if (contract.renterSigned && contract.ownerSigned) {
      const previous = booking.status;
      contract.status = "Signed";
      contract.signedAt ||= new Date().toISOString();
      booking.status = "Contract Signed";
      if (previous !== "Contract Signed")
        d.auditLogs.push({
          id: nextId(d.auditLogs),
          entity: "booking",
          entityId: booking.id,
          action: "STATUS_CHANGED",
          actorId: q.authUser.id,
          detail: `${previous} → Contract Signed`,
          createdAt: new Date().toISOString(),
        });
      for (const userId of [booking.renterId, booking.ownerId])
        d.notifications.push({
          id: nextId(d.notifications),
          userId,
          title: "Hợp đồng đã ký đầy đủ",
          message: `${contract.contractNumber} đã có đủ chữ ký hai bên.`,
          type: "contract",
          read: false,
          createdAt: new Date().toISOString(),
        });
    } else {
      const counterpartyId =
        q.authUser.role === "renter" ? booking.ownerId : booking.renterId;
      d.notifications.push({
        id: nextId(d.notifications),
        userId: counterpartyId,
        title: "Hợp đồng chờ chữ ký",
        message: `${contract.contractNumber} đang chờ chữ ký của bạn.`,
        type: "contract",
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
    write(d);
    s.json(contractView(d, contract, booking));
  },
);
app.get(
  "/api/evidence/:bookingId",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      booking = find(d.bookings, q.params.bookingId);
    if (!booking)
      return s.status(404).json({ message: "Không tìm thấy booking" });
    if (!canAccessBooking(q.authUser, booking))
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem bằng chứng này" });
    s.json(
      evidenceView(
        d,
        d.evidence.find((x) => x.bookingId === booking.id),
      ) || null,
    );
  },
);
app.post("/api/evidence", requireRole(["renter", "owner", "admin"]), (q, s) => {
  const d = read(),
    booking = find(d.bookings, q.body.bookingId);
  if (!booking)
    return s.status(404).json({ message: "Không tìm thấy booking" });
  if (!canAccessBooking(q.authUser, booking))
    return s
      .status(403)
      .json({ message: "Bạn không có quyền cập nhật bằng chứng này" });
  const phase = q.body.phase;
  if (!["checkin", "checkout"].includes(phase))
    return s.status(400).json({ message: "Giai đoạn bằng chứng không hợp lệ" });
  const allowedStates =
    phase === "checkin"
      ? ["Contract Signed", "Ready for Check-in", "Ongoing"]
      : ["Ongoing", "Check-out Review", "Dispute"];
  if (!allowedStates.includes(booking.status))
    return s.status(409).json({
      message: `Không thể lưu bằng chứng ${phase} khi booking ở trạng thái ${booking.status}`,
    });
  if (
    !Array.isArray(q.body.photos) ||
    q.body.photos.length < 1 ||
    q.body.photos.length > 6 ||
    q.body.photos.some((id) => !Number.isInteger(Number(id)))
  )
    return s
      .status(400)
      .json({ message: "Cần từ 1 đến 6 ảnh bằng chứng hợp lệ" });
  const photoIds = [...new Set(q.body.photos.map(Number))],
    assets = photoIds.map((id) => find(d.uploadedAssets, id));
  if (
    assets.some(
      (asset) =>
        !asset ||
        asset.kind !== "evidence" ||
        asset.bookingId !== booking.id ||
        (q.authUser.role !== "admin" && asset.uploaderId !== q.authUser.id),
    )
  )
    return s.status(403).json({
      message: "Ảnh bằng chứng không thuộc booking hoặc người tải hiện tại",
    });
  const fuel = Number(q.body.fuel),
    odometer = Number(q.body.odometer),
    notes = String(q.body.notes || "").trim();
  if (
    q.body.fuel === null ||
    q.body.fuel === "" ||
    !Number.isFinite(fuel) ||
    fuel < 0 ||
    fuel > 100
  )
    return s.status(400).json({ message: "Mức nhiên liệu phải từ 0 đến 100" });
  if (
    q.body.odometer === null ||
    q.body.odometer === "" ||
    !Number.isFinite(odometer) ||
    odometer < 0 ||
    odometer > 10000000
  )
    return s.status(400).json({ message: "Số ODO không hợp lệ" });
  if (notes.length > 2000)
    return s.status(400).json({ message: "Ghi chú tối đa 2.000 ký tự" });
  let evidence = d.evidence.find((item) => item.bookingId === booking.id);
  const created = !evidence;
  if (!evidence) {
    evidence = {
      id: nextId(d.evidence),
      bookingId: booking.id,
      checkinPhotos: [],
      checkoutPhotos: [],
      submissions: [],
      notesHistory: [],
      status: "Pending",
      createdBy: q.authUser.id,
      createdAt: new Date().toISOString(),
    };
    d.evidence.push(evidence);
  }
  evidence.submissions ||= [];
  evidence.notesHistory ||= [];
  const now = new Date().toISOString(),
    photoField = phase === "checkin" ? "checkinPhotos" : "checkoutPhotos",
    fuelField = phase === "checkin" ? "fuelBefore" : "fuelAfter",
    odometerField = phase === "checkin" ? "odometerBefore" : "odometerAfter";
  evidence[photoField] = [
    ...new Set([
      ...(evidence[photoField] || []).map((value) => value?.id ?? value),
      ...photoIds,
    ]),
  ];
  if (q.authUser.role !== "renter" || evidence[fuelField] == null) {
    evidence[fuelField] = fuel;
    evidence[odometerField] = odometer;
  }
  const submission = {
    id: nextId(evidence.submissions),
    phase,
    uploaderId: q.authUser.id,
    uploaderRole: q.authUser.role,
    photos: photoIds,
    fuel,
    odometer,
    notes,
    createdAt: now,
  };
  evidence.submissions.push(submission);
  if (notes) {
    evidence.notesHistory.push({
      uploaderId: q.authUser.id,
      uploaderRole: q.authUser.role,
      phase,
      notes,
      createdAt: now,
    });
    evidence.notes = evidence.notesHistory
      .slice(-10)
      .map((item) => `[${item.phase} · ${item.uploaderRole}] ${item.notes}`)
      .join("\n");
  }
  evidence.status = phase === "checkout" ? "Complete" : evidence.status;
  evidence.updatedBy = q.authUser.id;
  evidence.updatedAt = now;
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "evidence",
    entityId: evidence.id,
    action: `${phase.toUpperCase()}_SUBMITTED`,
    actorId: q.authUser.id,
    detail: `${photoIds.length} ảnh`,
    createdAt: now,
  });
  const previousBookingStatus = booking.status;
  if (
    phase === "checkin" &&
    ["Contract Signed", "Ready for Check-in"].includes(booking.status)
  )
    booking.status = "Ongoing";
  if (phase === "checkout" && booking.status === "Ongoing")
    booking.status = "Check-out Review";
  if (booking.status !== previousBookingStatus)
    d.auditLogs.push({
      id: nextId(d.auditLogs),
      entity: "booking",
      entityId: booking.id,
      action: "STATUS_CHANGED",
      actorId: q.authUser.id,
      detail: `${previousBookingStatus} → ${booking.status} (evidence ${phase})`,
      createdAt: now,
    });
  d.notifications.push({
    id: nextId(d.notifications),
    userId:
      q.authUser.id === booking.renterId ? booking.ownerId : booking.renterId,
    title: `Bằng chứng ${phase === "checkin" ? "nhận xe" : "trả xe"} mới`,
    message: `Booking #PC${booking.id} có biên bản ${phase} mới.`,
    type: "evidence",
    read: false,
    createdAt: now,
  });
  write(d);
  s.status(created ? 201 : 200).json(evidenceView(d, evidence));
});
app.get("/api/disputes", requireRole(["renter", "owner", "admin"]), (q, s) => {
  const d = read();
  let disputes = d.disputes;
  if (q.authUser.role !== "admin")
    disputes = disputes.filter((item) => {
      const booking = find(d.bookings, item.bookingId);
      return booking && canAccessBooking(q.authUser, booking);
    });
  if (q.query.bookingId)
    disputes = disputes.filter((item) => item.bookingId === +q.query.bookingId);
  s.json(disputes);
});
app.get(
  "/api/disputes/:id",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      dispute = find(d.disputes, q.params.id);
    if (!dispute)
      return s.status(404).json({ message: "Không tìm thấy tranh chấp" });
    const booking = find(d.bookings, dispute.bookingId);
    if (!booking || !canAccessBooking(q.authUser, booking))
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem tranh chấp này" });
    s.json(dispute);
  },
);
app.post("/api/disputes", requireRole(["renter", "owner", "admin"]), (q, s) => {
  const d = read(),
    booking = find(d.bookings, q.body.bookingId);
  if (!booking)
    return s.status(404).json({ message: "Không tìm thấy booking" });
  if (!canAccessBooking(q.authUser, booking))
    return s
      .status(403)
      .json({ message: "Bạn không có quyền mở tranh chấp cho booking này" });
  if (!["Ongoing", "Check-out Review", "Dispute"].includes(booking.status))
    return s.status(409).json({
      message: "Chỉ có thể mở tranh chấp trong hoặc ngay sau quá trình thuê",
    });
  if (
    d.disputes.some(
      (item) =>
        item.bookingId === booking.id &&
        ["Open", "Under review"].includes(item.status),
    )
  )
    return s
      .status(409)
      .json({ message: "Booking đang có một tranh chấp hoạt động" });
  const reason = String(q.body.reason || "").trim(),
    description = String(q.body.description || "").trim();
  if (!reason || !description)
    return s
      .status(400)
      .json({ message: "Vui lòng nhập lý do và mô tả tranh chấp" });
  if (reason.length > 200 || description.length > 3000)
    return s.status(400).json({ message: "Nội dung tranh chấp quá dài" });
  const evidenceIds = Array.isArray(q.body.evidence)
    ? [...new Set(q.body.evidence.map(Number))]
    : [];
  if (
    evidenceIds.length > 12 ||
    evidenceIds.some((id) => {
      const asset = find(d.uploadedAssets, id);
      return (
        !Number.isInteger(id) ||
        asset?.kind !== "evidence" ||
        asset.bookingId !== booking.id
      );
    })
  )
    return s
      .status(400)
      .json({ message: "Danh sách bằng chứng tranh chấp không hợp lệ" });
  const now = new Date().toISOString(),
    previousStatus = booking.status;
  const x = {
    id: nextId(d.disputes),
    bookingId: booking.id,
    reason,
    description,
    evidence: evidenceIds,
    decision: "",
    status: "Open",
    openedBy: q.authUser.id,
    createdAt: now,
    resolvedAt: null,
  };
  d.disputes.push(x);
  booking.status = "Dispute";
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "dispute",
    entityId: x.id,
    action: "OPENED",
    actorId: q.authUser.id,
    detail: reason,
    createdAt: now,
  });
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "booking",
    entityId: booking.id,
    action: "STATUS_CHANGED",
    actorId: q.authUser.id,
    detail: `${previousStatus} → Dispute`,
    createdAt: now,
  });
  const recipients = new Set([booking.renterId, booking.ownerId, 7]);
  recipients.delete(q.authUser.id);
  for (const userId of recipients)
    d.notifications.push({
      id: nextId(d.notifications),
      userId,
      title: "Tranh chấp mới",
      message: `Booking #PC${booking.id} đã được chuyển sang xử lý tranh chấp.`,
      type: "dispute",
      read: false,
      createdAt: now,
    });
  write(d);
  s.status(201).json(x);
});
app.put("/api/disputes/:id/status", requireRole(["admin"]), (q, s) => {
  const d = read(),
    x = find(d.disputes, q.params.id);
  if (!x) return s.status(404).json({ message: "Không tìm thấy tranh chấp" });
  if (!["Open", "Under review", "Resolved"].includes(q.body.status))
    return s
      .status(400)
      .json({ message: "Trạng thái tranh chấp không hợp lệ" });
  if (x.status === "Resolved")
    return s.status(409).json({ message: "Tranh chấp đã được giải quyết" });
  const decision = String(q.body.decision || "").trim();
  if (q.body.status === "Resolved" && !decision)
    return s.status(400).json({ message: "Cần nhập quyết định giải quyết" });
  if (decision.length > 3000)
    return s.status(400).json({ message: "Quyết định giải quyết quá dài" });
  const booking = find(d.bookings, x.bookingId),
    now = new Date().toISOString();
  if (!booking)
    return s
      .status(409)
      .json({ message: "Booking của tranh chấp không còn tồn tại" });
  x.status = q.body.status;
  if (decision) x.decision = decision;
  x.reviewedBy = q.authUser.id;
  x.updatedAt = now;
  x.resolvedAt = q.body.status === "Resolved" ? now : null;
  d.auditLogs.push({
    id: nextId(d.auditLogs),
    entity: "dispute",
    entityId: x.id,
    action: q.body.status === "Resolved" ? "RESOLVED" : "STATUS_CHANGED",
    actorId: q.authUser.id,
    detail: q.body.status === "Resolved" ? decision : q.body.status,
    createdAt: now,
  });
  if (q.body.status === "Resolved") {
    const previousStatus = booking.status;
    booking.status = "Completed";
    d.auditLogs.push({
      id: nextId(d.auditLogs),
      entity: "booking",
      entityId: booking.id,
      action: "STATUS_CHANGED",
      actorId: q.authUser.id,
      detail: `${previousStatus} → Completed (dispute resolved)`,
      createdAt: now,
    });
    for (const userId of [booking.renterId, booking.ownerId])
      d.notifications.push({
        id: nextId(d.notifications),
        userId,
        title: "Tranh chấp đã được giải quyết",
        message: `Booking #PC${booking.id}: ${decision}`,
        type: "dispute",
        read: false,
        createdAt: now,
      });
  }
  write(d);
  s.json(x);
});
app.get(
  "/api/notifications/:userId",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const requestedUserId = +q.params.userId;
    if (q.authUser.role !== "admin" && q.authUser.id !== requestedUserId)
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem thông báo này" });
    s.json(
      read()
        .notifications.filter((n) => n.userId === requestedUserId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    );
  },
);
app.put(
  "/api/notifications/:id/read",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      n = find(d.notifications, q.params.id);
    if (!n) return s.sendStatus(404);
    if (q.authUser.role !== "admin" && n.userId !== q.authUser.id)
      return s
        .status(403)
        .json({ message: "Bạn không có quyền cập nhật thông báo này" });
    n.read = true;
    write(d);
    s.json(n);
  },
);
app.put(
  "/api/notifications/user/:userId/read-all",
  requireRole(["renter", "owner", "admin"]),
  (q, s) => {
    const d = read(),
      requestedUserId = +q.params.userId;
    if (q.authUser.role !== "admin" && q.authUser.id !== requestedUserId)
      return s
        .status(403)
        .json({ message: "Bạn không có quyền cập nhật thông báo này" });
    d.notifications
      .filter((n) => n.userId === requestedUserId)
      .forEach((n) => (n.read = true));
    write(d);
    s.json({ ok: true });
  },
);
app.get("/api/audit-logs", requireRole(["admin"]), (q, s) =>
  s.json(read().auditLogs.slice().reverse()),
);
app.get("/api/users/:id", requireRole(["renter", "owner", "admin"]), (q, s) => {
  const requestedUserId = +q.params.id;
  if (q.authUser.role !== "admin" && q.authUser.id !== requestedUserId)
    return s.status(403).json({ message: "Bạn không có quyền xem hồ sơ này" });
  const user = find(read().users, requestedUserId);
  user
    ? s.json(publicUser(user))
    : s.status(404).json({ message: "Không tìm thấy người dùng" });
});
app.put("/api/users/:id", requireRole(["renter", "owner", "admin"]), (q, s) => {
  const d = read(),
    requestedUserId = +q.params.id,
    user = find(d.users, requestedUserId);
  if (!user)
    return s.status(404).json({ message: "Không tìm thấy người dùng" });
  if (q.authUser.role !== "admin" && q.authUser.id !== requestedUserId)
    return s
      .status(403)
      .json({ message: "Bạn không có quyền cập nhật hồ sơ này" });
  const allowed = ["name", "phone", "avatarUrl"];
  for (const key of allowed)
    if (q.body[key] !== undefined) user[key] = q.body[key];
  if (!String(user.name || "").trim() || !String(user.phone || "").trim())
    return s
      .status(400)
      .json({ message: "Họ tên và số điện thoại không được để trống" });
  user.name = String(user.name).trim().slice(0, 120);
  user.phone = String(user.phone).trim().slice(0, 30);
  write(d);
  s.json(publicUser(user));
});
app.get("/api/cars/:id/availability", (q, s) => {
  const d = read(),
    car = find(d.cars, q.params.id);
  if (!car || car.listingStatus !== "Published")
    return s.status(404).json({ message: "Không tìm thấy xe" });
  const unavailable = d.bookings
    .filter((b) => b.carId === car.id && activeBookingStatuses.has(b.status))
    .map((b) => ({
      startDate: b.startDate,
      endDate: b.endDate,
    }));
  s.json({ carId: car.id, unavailable });
});
app.get("/api/reviews", (q, s) => {
  const d = read();
  let reviews = d.reviews;
  if (q.query.carId)
    reviews = reviews.filter((r) => r.carId === +q.query.carId);
  s.json(
    reviews.map((r) => {
      const { bookingId, renterId, ...review } = r;
      return {
        ...review,
        verifiedTrip: true,
        renter: publicReviewerSummary(find(d.users, renterId)),
      };
    }),
  );
});
app.post("/api/reviews", requireRole(["renter"]), (q, s) => {
  const d = read(),
    booking = find(d.bookings, q.body.bookingId);
  if (!booking)
    return s.status(404).json({ message: "Không tìm thấy booking" });
  if (booking.renterId !== q.authUser.id)
    return s
      .status(403)
      .json({ message: "Bạn không thể đánh giá chuyến đi của người khác" });
  if (booking.status !== "Completed")
    return s
      .status(409)
      .json({ message: "Chỉ có thể đánh giá chuyến đã hoàn thành" });
  if (d.reviews.some((r) => r.bookingId === booking.id))
    return s.status(409).json({ message: "Booking đã được đánh giá" });
  const rating = Number(q.body.rating),
    comment = String(q.body.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment)
    return s
      .status(400)
      .json({ message: "Đánh giá phải từ 1 đến 5 và có nội dung" });
  const review = {
    id: nextId(d.reviews),
    bookingId: booking.id,
    carId: booking.carId,
    renterId: q.authUser.id,
    rating,
    comment: comment.slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  d.reviews.push(review);
  const car = find(d.cars, booking.carId),
    carReviews = d.reviews.filter((r) => r.carId === car.id);
  car.rating = Number(
    (carReviews.reduce((a, r) => a + r.rating, 0) / carReviews.length).toFixed(
      1,
    ),
  );
  write(d);
  s.status(201).json(review);
});
app.get("/api/risk-alerts", requireRole(["owner", "admin"]), (q, s) => {
  const d = read();
  let alerts = d.riskAlerts;
  if (q.authUser.role === "owner")
    alerts = alerts.filter((a) => a.ownerId === q.authUser.id);
  else if (q.query.ownerId)
    alerts = alerts.filter((a) => a.ownerId === +q.query.ownerId);
  if (q.query.status)
    alerts = alerts.filter((a) => a.status === q.query.status);
  s.json(alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.put(
  "/api/risk-alerts/:id/status",
  requireRole(["owner", "admin"]),
  (q, s) => {
    const d = read(),
      alert = find(d.riskAlerts, q.params.id);
    if (!alert)
      return s.status(404).json({ message: "Không tìm thấy cảnh báo" });
    if (q.authUser.role === "owner" && alert.ownerId !== q.authUser.id)
      return s
        .status(403)
        .json({ message: "Bạn không có quyền cập nhật cảnh báo này" });
    const allowedStatuses =
      q.authUser.role === "owner"
        ? ["Acknowledged"]
        : ["Open", "Acknowledged", "Resolved"];
    if (!allowedStatuses.includes(q.body.status))
      return s.status(q.authUser.role === "owner" ? 403 : 400).json({
        message:
          q.authUser.role === "owner"
            ? "Chủ xe chỉ có thể xác nhận đã xem cảnh báo"
            : "Trạng thái cảnh báo không hợp lệ",
      });
    alert.status = q.body.status;
    alert.updatedBy = q.authUser.id;
    alert.updatedAt = new Date().toISOString();
    write(d);
    s.json(alert);
  },
);
const enriched = (d, b) => ({
  ...b,
  reviewed: d.reviews.some((review) => review.bookingId === b.id),
  car: publicCar(find(d.cars, b.carId)),
  renter: publicUser(find(d.users, b.renterId)),
  owner: publicUser(find(d.users, b.ownerId)),
});
app.get("/api/dashboard/owner/:id", requireRole(["owner", "admin"]), (q, s) => {
  if (q.authUser.role !== "admin" && q.authUser.id !== +q.params.id)
    return s
      .status(403)
      .json({ message: "Bạn không có quyền xem bảng điều khiển này" });
  const d = read(),
    bookings = d.bookings
      .filter((x) => x.ownerId === +q.params.id)
      .map((x) => enriched(d, x));
  const user = find(d.users, q.params.id);
  if (!user || user.role !== "owner")
    return s.status(404).json({ message: "Không tìm thấy chủ xe" });
  const projectedStatuses = new Set([
      "Accepted",
      "Deposit Required",
      "Contract Signed",
      "Ready for Check-in",
      "Ongoing",
      "Check-out Review",
    ]),
    revenueSettled = bookings
      .filter((booking) => booking.status === "Completed")
      .reduce((sum, booking) => sum + Number(booking.totalPrice || 0), 0),
    revenueProjected = bookings
      .filter((booking) => projectedStatuses.has(booking.status))
      .reduce((sum, booking) => sum + Number(booking.totalPrice || 0), 0),
    now = new Date(),
    rollingMonths = Array.from({ length: 4 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (3 - index), 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  s.json({
    generatedAt: new Date().toISOString(),
    user: publicUser(user),
    cars: d.cars.filter((x) => x.ownerId === +q.params.id),
    bookings,
    notifications: d.notifications.filter((n) => n.userId === +q.params.id),
    revenue: revenueSettled,
    revenueSettled,
    revenueProjected,
    stats: {
      pending: bookings.filter((b) => b.status === "Pending").length,
      active: bookings.filter((b) =>
        [
          "Accepted",
          "Deposit Required",
          "Contract Signed",
          "Ready for Check-in",
          "Ongoing",
          "Check-out Review",
        ].includes(b.status),
      ).length,
      completed: bookings.filter((b) => b.status === "Completed").length,
      utilization: Math.round(
        (new Set(
          bookings.filter((b) => b.status !== "Rejected").map((b) => b.carId),
        ).size /
          Math.max(
            1,
            d.cars.filter((c) => c.ownerId === +q.params.id).length,
          )) *
          100,
      ),
    },
    revenueByMonth: rollingMonths.map(({ year, month }) => ({
      month: `T${month}/${String(year).slice(-2)}`,
      value: bookings
        .filter(
          (b) =>
            new Date(b.createdAt).getFullYear() === year &&
            new Date(b.createdAt).getMonth() + 1 === month &&
            b.status === "Completed",
        )
        .reduce((sum, b) => sum + Number(b.totalPrice || 0), 0),
    })),
    alerts: d.riskAlerts.filter((a) => a.ownerId === +q.params.id),
    calendar: bookings
      .filter((b) => b.status !== "Rejected")
      .map((b) => ({
        id: b.id,
        carId: b.carId,
        carName: b.car?.name,
        startDate: b.startDate,
        endDate: b.endDate,
        status: b.status,
      })),
  });
});
app.get(
  "/api/dashboard/renter/:id",
  requireRole(["renter", "admin"]),
  (q, s) => {
    if (q.authUser.role !== "admin" && q.authUser.id !== +q.params.id)
      return s
        .status(403)
        .json({ message: "Bạn không có quyền xem bảng điều khiển này" });
    const d = read();
    const user = find(d.users, q.params.id);
    if (!user || user.role !== "renter")
      return s.status(404).json({ message: "Không tìm thấy người thuê" });
    s.json({
      generatedAt: new Date().toISOString(),
      user: publicUser(user),
      bookings: d.bookings
        .filter((x) => x.renterId === +q.params.id)
        .map((x) => enriched(d, x)),
      notifications: d.notifications.filter((n) => n.userId === +q.params.id),
      stats: {
        pending: d.bookings.filter(
          (b) => b.renterId === +q.params.id && b.status === "Pending",
        ).length,
        active: d.bookings.filter(
          (b) =>
            b.renterId === +q.params.id &&
            [
              "Accepted",
              "Deposit Required",
              "Contract Signed",
              "Ready for Check-in",
              "Ongoing",
              "Check-out Review",
            ].includes(b.status),
        ).length,
        completed: d.bookings.filter(
          (b) => b.renterId === +q.params.id && b.status === "Completed",
        ).length,
        totalSpent: d.bookings
          .filter(
            (b) => b.renterId === +q.params.id && b.status === "Completed",
          )
          .reduce((sum, b) => sum + b.totalPrice, 0),
      },
      reviews: d.reviews.filter((r) => r.renterId === +q.params.id),
    });
  },
);
app.get("/api/dashboard/admin", requireRole(["admin"]), (q, s) => {
  const d = read();
  const projectedStatuses = new Set([
      "Accepted",
      "Deposit Required",
      "Contract Signed",
      "Ready for Check-in",
      "Ongoing",
      "Check-out Review",
    ]),
    revenueSettled = d.bookings
      .filter((booking) => booking.status === "Completed")
      .reduce((sum, booking) => sum + Number(booking.platformFee || 0), 0),
    revenueProjected = d.bookings
      .filter((booking) => projectedStatuses.has(booking.status))
      .reduce((sum, booking) => sum + Number(booking.platformFee || 0), 0);
  s.json({
    generatedAt: new Date().toISOString(),
    cars: d.cars,
    bookings: d.bookings,
    disputes: d.disputes,
    riskAlerts: d.riskAlerts,
    auditLogs: d.auditLogs,
    users: d.users.map(publicUser),
    stats: {
      users: d.users.length,
      cars: d.cars.length,
      bookings: d.bookings.length,
      revenue: revenueSettled,
      revenueSettled,
      revenueProjected,
      pendingDisputes: d.disputes.filter((x) => x.status !== "Resolved").length,
      activeBookings: d.bookings.filter((b) =>
        [
          "Accepted",
          "Deposit Required",
          "Contract Signed",
          "Ready for Check-in",
          "Ongoing",
          "Check-out Review",
        ].includes(b.status),
      ).length,
      openAlerts: d.riskAlerts.filter((a) => a.status !== "Resolved").length,
    },
  });
});
registerDealRoutes(app, {
  read,
  write,
  find,
  requireRole,
  canAccessBooking,
  nextId,
});
if (fs.existsSync(clientDistDir)) {
  app.use(
    express.static(clientDistDir, {
      index: false,
      maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    }),
  );
  app.get("/{*path}", (q, s, next) => {
    if (q.path.startsWith("/api/")) return next();
    s.sendFile(path.join(clientDistDir, "index.html"));
  });
}
app.use((e, q, s, n) => {
  if (e instanceof SyntaxError && e.status === 400 && "body" in e)
    return s.status(400).json({ message: "Dữ liệu JSON không hợp lệ" });
  console.error(e);
  if (e instanceof multer.MulterError && e.code === "LIMIT_FILE_SIZE")
    return s
      .status(413)
      .json({ message: "Tệp tải lên vượt quá dung lượng cho phép" });
  if (e.code === "UNSUPPORTED_MEDIA_TYPE" || e.status === 415)
    return s.status(415).json({ message: e.message });
  if (e instanceof multer.MulterError)
    return s.status(400).json({ message: e.message });
  s.status(500).json({ message: "Lỗi máy chủ" });
});
const port = process.env.PORT || 4000;
const server = app.listen(port, () =>
  console.log(`PaceCar API: http://localhost:${port}`),
);
server.on("error", (error) => {
  if (error.code === "EADDRINUSE")
    console.error(
      `Cổng ${port} đang được sử dụng. Hãy đóng tiến trình cũ rồi chạy lại npm run dev.`,
    );
  else console.error(error);
  process.exit(1);
});
