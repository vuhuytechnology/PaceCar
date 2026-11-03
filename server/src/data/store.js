import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { seed } from "./seed.js";
import { RENTAL_POLICY_DEFAULTS, RENTAL_POLICY_VERSION } from "../policy.js";
const dir = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.PACECAR_DB_FILE
  ? path.resolve(process.env.PACECAR_DB_FILE)
  : path.join(dir, "db.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
const databaseUrl = process.env.DATABASE_URL;
const postgresEnabled = Boolean(databaseUrl);
let pool;
let cachedData;
let storeReady = false;
let persistenceError;
let writeQueue = Promise.resolve();

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

function migrateData(data) {
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
  data.analytics ||= {};
  if (!Array.isArray(data.analytics.dailyPageViews)) {
    data.analytics.dailyPageViews = [];
    changed = true;
  }
  if (!Number.isSafeInteger(data.analytics.totalPageViews)) {
    data.analytics.totalPageViews = data.analytics.dailyPageViews.reduce(
      (total, item) => total + Math.max(0, Number(item.count) || 0),
      0,
    );
    changed = true;
  }
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
  data.commissionPayments ||= [];
  data.commissionPaymentAccount ||= null;
  data.paymentAccounts ||= [];
  data.payments ||= [];
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
    version: RENTAL_POLICY_VERSION,
    ...RENTAL_POLICY_DEFAULTS,
    platformFeeRate: 0,
    insurancePerDay: 80000,
    weekendSurchargeRate: 0.15,
    driverFeePerDay: 350000,
    handoverStandardFrom: "08:00",
    handoverStandardUntil: "20:00",
    handoverOutsideFee: 100000,
    quoteTtlMinutes: 15,
  };
  if (data.pricingPolicy.platformFeeRate !== 0) {
    data.pricingPolicy.platformFeeRate = 0;
    changed = true;
  }
  if (data.pricingPolicy.driverFeePerDay == null) {
    data.pricingPolicy.driverFeePerDay = 350000;
    changed = true;
  }
  const handoverDefaults = {
    handoverSupportedFrom: "00:00",
    handoverSupportedUntil: "23:59",
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
  if (
    ["PC-2026.1", "PC-2026.2", "PC-2026.3"].includes(
      data.pricingPolicy.version,
    )
  ) {
    data.pricingPolicy.version = RENTAL_POLICY_VERSION;
    changed = true;
  }
  for (const [key, value] of Object.entries(RENTAL_POLICY_DEFAULTS)) {
    if (JSON.stringify(data.pricingPolicy[key]) !== JSON.stringify(value)) {
      data.pricingPolicy[key] = JSON.parse(JSON.stringify(value));
      changed = true;
    }
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
    const catalogPhotos = Array.isArray(catalogCar.photos)
      ? catalogCar.photos
      : [catalogCar.imageUrl];
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
      storedCar.photos.length !== catalogPhotos.length ||
      storedCar.photos.some((photo, index) => photo !== catalogPhotos[index])
    ) {
      storedCar.photos = catalogPhotos;
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
  return { data, changed };
}

function readJson() {
  if (!fs.existsSync(file))
    fs.writeFileSync(file, JSON.stringify(seed, null, 2));
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const migrated = migrateData(data);
  if (migrated.changed) writeJson(migrated.data);
  return migrated.data;
}

function writeJson(data) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function assertValidDocument(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new TypeError("PaceCar database document must be a JSON object");
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL client error:", error.message);
    });
  }
  return pool;
}

async function ensureSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS pacecar_store (
      id smallint PRIMARY KEY CHECK (id = 1),
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS pacecar_evidence_blobs (
      asset_id bigint PRIMARY KEY,
      mime_type text NOT NULL,
      content bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function saveDocument(data) {
  await getPool().query(
    `INSERT INTO pacecar_store (id, data, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(data)],
  );
}

export async function initializeStore() {
  if (!postgresEnabled) {
    read();
    return;
  }

  await ensureSchema();

  const result = await getPool().query(
    "SELECT data FROM pacecar_store WHERE id = 1",
  );
  if (result.rows.length) {
    cachedData =
      typeof result.rows[0].data === "string"
        ? JSON.parse(result.rows[0].data)
        : result.rows[0].data;
    assertValidDocument(cachedData);
    const migrated = migrateData(cachedData);
    cachedData = migrated.data;
    if (migrated.changed) await saveDocument(cachedData);
  } else {
    const initialData = structuredClone(seed);
    cachedData = migrateData(initialData).data;
    const inserted = await getPool().query(
      `INSERT INTO pacecar_store (id, data, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [JSON.stringify(cachedData)],
    );
    if (!inserted.rowCount) {
      const current = await getPool().query(
        "SELECT data FROM pacecar_store WHERE id = 1",
      );
      if (!current.rows.length)
        throw new Error("PostgreSQL store initialization did not persist data");
      cachedData =
        typeof current.rows[0].data === "string"
          ? JSON.parse(current.rows[0].data)
          : current.rows[0].data;
      assertValidDocument(cachedData);
      cachedData = migrateData(cachedData).data;
    }
  }
  storeReady = true;
}

export function read() {
  if (!postgresEnabled) return readJson();
  if (!storeReady)
    throw new Error("PostgreSQL store has not finished initializing");
  if (persistenceError)
    throw new Error("PostgreSQL persistence is unavailable", {
      cause: persistenceError,
    });
  return cachedData;
}

export function write(data) {
  if (!postgresEnabled) {
    writeJson(data);
    return data;
  }
  if (!storeReady)
    throw new Error("PostgreSQL store has not finished initializing");
  if (persistenceError)
    throw new Error("PostgreSQL persistence is unavailable", {
      cause: persistenceError,
    });
  assertValidDocument(data);
  cachedData = data;
  const snapshot = structuredClone(data);
  writeQueue = writeQueue.then(async () => {
    if (persistenceError) return;
    try {
      await saveDocument(snapshot);
    } catch (error) {
      persistenceError = error;
    }
  });
  return data;
}

export async function flushWrites() {
  await writeQueue;
  if (persistenceError)
    throw new Error("PostgreSQL persistence failed", {
      cause: persistenceError,
    });
}

export async function persistEvidenceBlobs(assets) {
  if (!postgresEnabled) return;
  const client = await getPool().connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    for (const asset of assets) {
      const content = await fs.promises.readFile(asset.path);
      await client.query(
        `INSERT INTO pacecar_evidence_blobs (asset_id, mime_type, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (asset_id) DO UPDATE
         SET mime_type = EXCLUDED.mime_type, content = EXCLUDED.content`,
        [asset.id, asset.mimeType, content],
      );
    }
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Could not roll back evidence image storage:",
          rollbackError.message,
        );
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function readEvidenceBlob(id) {
  if (!postgresEnabled) return null;
  const result = await getPool().query(
    "SELECT mime_type, content FROM pacecar_evidence_blobs WHERE asset_id = $1",
    [id],
  );
  const asset = result.rows[0];
  return asset ? { mimeType: asset.mime_type, content: asset.content } : null;
}

export async function importJsonFileToPostgres(jsonFile) {
  if (!postgresEnabled)
    throw new Error("DATABASE_URL is required to import into PostgreSQL");
  const data = JSON.parse(fs.readFileSync(path.resolve(jsonFile), "utf8"));
  assertValidDocument(data);
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO pacecar_store (id, data, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [JSON.stringify(data)],
  );
  if (!result.rowCount)
    throw new Error(
      "PostgreSQL already contains PaceCar data; import was not applied",
    );
  return data;
}

export async function exportPostgresToJsonFile(jsonFile) {
  if (!postgresEnabled)
    throw new Error("DATABASE_URL is required to export from PostgreSQL");
  await ensureSchema();
  const result = await getPool().query(
    "SELECT data FROM pacecar_store WHERE id = 1",
  );
  if (!result.rows.length)
    throw new Error("PostgreSQL does not contain PaceCar data to export");
  const data =
    typeof result.rows[0].data === "string"
      ? JSON.parse(result.rows[0].data)
      : result.rows[0].data;
  assertValidDocument(data);
  const output = path.resolve(jsonFile);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = `${output}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, output);
  return data;
}

export async function closeStore() {
  if (pool) await pool.end();
}

export function reset() {
  const data = structuredClone(seed);
  migrateLegacyPasswords(data);
  write(data);
}
