import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMISSION_POLICY_VERSION,
  TERMS_VERSION,
  commissionFor,
} from "../src/policy.js";

// Commission policy unit tests: one rate over the whole base, integer VND.
for (const [base, rateBps, amount] of [
  [0, 500, 0],
  [999_999, 500, 50_000],
  [1_000_000, 400, 40_000],
  [1_999_999, 400, 80_000],
  [2_000_000, 300, 60_000],
  [2_100_000, 300, 63_000],
  [1_400_000, 400, 56_000],
  [500_000, 500, 25_000],
  [5_000_000, 300, 150_000],
  [1_000_001, 400, 40_000],
]) {
  const result = commissionFor(base);
  assert.equal(result.rateBps, rateBps, `rate for ${base}`);
  assert.equal(result.amount, amount, `amount for ${base}`);
  assert.equal(result.policyVersion, COMMISSION_POLICY_VERSION);
}
for (const bad of [-1, 1.5, NaN, Infinity, "1000000", null, undefined, 2e12])
  assert.throws(() => commissionFor(bad), RangeError, `reject ${bad}`);

const serverDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacecar-deals-"));
const dbFile = path.join(tempDir, "db.json");
const port = 4198;
const base = `http://localhost:${port}/api`;
const server = spawn(process.execPath, ["src/index.js"], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(port),
    PACECAR_DB_FILE: dbFile,
    PACECAR_UPLOAD_DIR: path.join(tempDir, "uploads"),
    CLIENT_ORIGIN: "http://localhost:5173",
    COMMISSION_TRIAL_ENABLED: "true",
    EMAIL_VERIFICATION_ENABLED: "true",
    MAIL_TRANSPORT: "file",
    MAIL_OUTBOX_FILE: path.join(tempDir, "outbox.jsonl"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

async function request(route, { token, headers, ...options } = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(base + route, {
    ...options,
    headers: {
      ...(options.body && !isForm
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const json = (value) => JSON.stringify(value);
const send = (route, method, token, body) =>
  request(route, { method, token, body: json(body ?? {}) });

async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {
      // Server startup is expected to refuse connections briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${serverLog}`);
}
async function login(email) {
  const response = await send("/auth/login", "POST", null, {
    email,
    password: "123456",
  });
  assert.equal(response.status, 200, json(response.body));
  return response.body.token;
}

try {
  await waitForServer();
  const renter = await login("renter@pacecar.vn");
  const otherRenter = await login("ha@pacecar.vn");
  const owner = await login("owner@pacecar.vn");
  const unrelatedOwner = await login("tung@pacecar.vn");
  const admin = await login("admin@pacecar.vn");

  const consent = (quote, overrides = {}) => ({
    policyVersion: quote.policyVersion,
    termsVersion: TERMS_VERSION,
    termsAccepted: true,
    roleAcknowledged: true,
    ...overrides,
  });
  const quoteFor = async (startDate, endDate, extra = {}) => {
    const response = await send("/quotes", "POST", renter, {
      carId: 1,
      startDate,
      startTime: "08:00",
      endDate,
      endTime: "20:00",
      driverOption: "self",
      pickupOption: "pickup",
      ...extra,
    });
    assert.equal(response.status, 201, json(response.body));
    return response.body;
  };
  let keyCounter = 0;
  const bookingFor = async (startDate, endDate, extra) => {
    const quote = await quoteFor(startDate, endDate, extra);
    const response = await request("/bookings", {
      method: "POST",
      token: renter,
      headers: { "Idempotency-Key": `deals-${++keyCounter}` },
      body: json({ quoteId: quote.quoteId, consent: consent(quote) }),
    });
    assert.equal(response.status, 201, json(response.body));
    return { quote, booking: response.body };
  };
  const completeBooking = async (id) => {
    assert.equal((await send(`/bookings/${id}/status`, "PUT", owner, { status: "Accepted" })).status, 200);
    assert.equal((await send(`/bookings/${id}/payment`, "POST", renter)).status, 200);
    assert.equal((await send("/contracts", "POST", owner, { bookingId: id })).status, 201);
    for (const token of [renter, owner])
      assert.equal((await send(`/contracts/${id}/sign`, "PUT", token, { consent: true })).status, 200);
    assert.equal((await send(`/bookings/${id}/status`, "PUT", owner, { status: "Ready for Check-in" })).status, 200);
    const form = new FormData();
    form.append("files", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "e.png");
    form.append("bookingId", String(id));
    const upload = await request("/uploads/evidence", { method: "POST", token: renter, body: form });
    assert.equal(upload.status, 201);
    for (const phase of ["checkin", "checkout"])
      assert.ok(
        [200, 201].includes(
          (await send("/evidence", "POST", renter, {
            bookingId: id,
            phase,
            photos: [upload.body.files[0].id],
            fuel: 70,
            odometer: phase === "checkin" ? 1000 : 1200,
            notes: "deals test",
          })).status,
        ),
      );
    assert.equal((await send(`/bookings/${id}/status`, "PUT", owner, { status: "Completed" })).status, 200);
  };
  const stored = () => JSON.parse(fs.readFileSync(dbFile, "utf8"));

  // Terms version and quote conditions
  const terms = await request("/legal/terms-version");
  assert.equal(terms.body.termsVersion, TERMS_VERSION);
  assert.equal(terms.body.status, "draft");
  const q1 = await quoteFor("2028-03-06", "2028-03-08");
  assert.equal(q1.termsVersion, TERMS_VERSION);
  assert.equal(q1.conditions.cancellationPolicy, null, "no invented cancellation policy");
  assert.ok(q1.deposit >= 0 && q1.totalPrice > 0);

  // Consent enforced by the backend
  const post = (quote, body, key) =>
    request("/bookings", {
      method: "POST",
      token: renter,
      headers: key ? { "Idempotency-Key": key } : {},
      body: json({ quoteId: quote.quoteId, ...body }),
    });
  for (const [label, body] of [
    ["no consent", {}],
    ["policy only", { consent: { policyVersion: q1.policyVersion } }],
    ["terms unchecked", { consent: consent(q1, { termsAccepted: false }) }],
    ["role unchecked", { consent: consent(q1, { roleAcknowledged: false }) }],
    ["string true", { consent: consent(q1, { termsAccepted: "true" }) }],
    ["stale terms", { consent: consent(q1, { termsVersion: "OLD" }) }],
    ["wrong policy", { consent: consent(q1, { policyVersion: "x" }) }],
  ]) {
    const response = await post(q1, body);
    assert.equal(response.status, 422, label);
  }
  assert.equal(stored().termsConsents.length, 0, "rejected requests store nothing");
  // Concurrent submissions of one quote create exactly one booking.
  const race = await Promise.all(
    Array.from({ length: 5 }, () => post(q1, { consent: consent(q1) })),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409, 409, 409, 409]);
  const created = race.find((r) => r.status === 201).body;
  assert.equal(created.status, "Pending");
  assert.equal(created.consent.termsVersion, TERMS_VERSION);
  assert.equal(created.consent.termsAccepted, true);
  assert.ok(created.consent.acceptedAt);
  const consentLog = stored().termsConsents;
  assert.equal(consentLog.length, 1);
  assert.equal(consentLog[0].userId, 1);
  assert.equal(consentLog[0].bookingId, created.id);
  assert.equal(consentLog[0].quoteId, q1.quoteId);
  assert.equal(consentLog[0].termsVersion, TERMS_VERSION);
  assert.equal(created.totalPrice, q1.totalPrice, "client cannot change amounts");
  assert.equal((await request("/admin/terms-consents", { token: renter })).status, 403);
  assert.equal((await request("/admin/terms-consents", { token: admin })).body.length, 1);
  // Idempotent replay does not add a consent record.
  const keyed = await bookingFor("2028-03-20", "2028-03-21");
  const replay = await post(
    keyed.quote,
    { consent: consent(keyed.quote) },
    `deals-${keyCounter}`,
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.body.id, keyed.booking.id);
  assert.equal(stored().termsConsents.length, 2);

  // Price revisions (form A)
  const pickup = created;
  const revisionPath = `/bookings/${pickup.id}/price-revisions`;
  assert.equal((await send(revisionPath, "POST", renter, { reason: "valid reason", otherFee: 1 })).status, 403);
  assert.equal((await send(revisionPath, "POST", unrelatedOwner, { reason: "valid reason", otherFee: 1 })).status, 403);
  for (const bad of [{ otherFee: -5 }, { otherFee: 1.5 }, { otherFee: "9" }, { deposit: 2e9 }, { reason: "" }])
    assert.equal(
      (await send(revisionPath, "POST", owner, { reason: "valid reason", otherFeeLabel: "Phí", ...bad })).status,
      400,
      json(bad),
    );
  assert.equal((await send(revisionPath, "POST", owner, { reason: "valid reason" })).status, 422);
  assert.equal((await send(revisionPath, "POST", owner, { reason: "valid reason", deliveryFee: 50000 })).status, 422);
  assert.equal((await send(revisionPath, "POST", owner, { reason: "valid reason", otherFee: 100000 })).status, 400, "label required");
  const proposal = await send(revisionPath, "POST", owner, {
    reason: "Phí vệ sinh đã thống nhất",
    otherFee: 100000,
    otherFeeLabel: "Phí vệ sinh",
    ownerDiscount: 20000,
    deposit: q1.deposit + 500000,
    totalPrice: 1,
  });
  assert.equal(proposal.status, 201, json(proposal.body));
  assert.equal(proposal.body.proposed.totalPrice, q1.totalPrice + 80000);
  assert.equal(proposal.body.previous.totalPrice, q1.totalPrice);
  let current = (await request(`/bookings/${pickup.id}`, { token: renter })).body;
  assert.equal(current.totalPrice, q1.totalPrice, "unconfirmed proposal changes nothing");
  assert.equal((await send(`/bookings/${pickup.id}/status`, "PUT", owner, { status: "Accepted" })).status, 200);
  assert.equal((await send(`/bookings/${pickup.id}/payment`, "POST", renter)).status, 409, "must confirm price first");
  const revisionId = proposal.body.id;
  assert.equal((await send(`${revisionPath}/${revisionId}`, "PUT", owner, { decision: "accept" })).status, 403);
  assert.equal((await send(`${revisionPath}/${revisionId}`, "PUT", otherRenter, { decision: "accept" })).status, 403);
  assert.equal((await send(`${revisionPath}/${revisionId}`, "PUT", renter, { decision: "maybe" })).status, 400);
  const accept = await Promise.all([
    send(`${revisionPath}/${revisionId}`, "PUT", renter, { decision: "accept" }),
    send(`${revisionPath}/${revisionId}`, "PUT", renter, { decision: "accept" }),
  ]);
  assert.deepEqual(accept.map((r) => r.status).sort(), [200, 409]);
  current = (await request(`/bookings/${pickup.id}`, { token: renter })).body;
  assert.equal(current.totalPrice, q1.totalPrice + 80000);
  assert.equal(current.deposit, q1.deposit + 500000);
  assert.equal(current.pricingSnapshot.otherFee, 100000);
  assert.equal(current.priceRevisions.length, 1);
  assert.equal(current.priceRevisions[0].previous.totalPrice, q1.totalPrice);
  assert.equal((await send(`${revisionPath}/${revisionId}`, "PUT", renter, { decision: "reject" })).status, 409);
  // A superseded proposal cannot be accepted.
  const first = await send(revisionPath, "POST", owner, { reason: "first change", otherFee: 1000, otherFeeLabel: "A" });
  const second = await send(revisionPath, "POST", owner, { reason: "second change", otherFee: 2000, otherFeeLabel: "B" });
  assert.equal((await send(`${revisionPath}/${first.body.id}`, "PUT", renter, { decision: "accept" })).status, 409);
  assert.equal((await send(`${revisionPath}/${second.body.id}`, "PUT", renter, { decision: "reject" })).status, 200);
  assert.equal((await request(`/bookings/${pickup.id}`, { token: renter })).body.totalPrice, q1.totalPrice + 80000);
  assert.equal((await send(`/bookings/${pickup.id}/payment`, "POST", renter)).status, 200);
  assert.equal((await send(revisionPath, "POST", owner, { reason: "too late", otherFee: 1, otherFeeLabel: "x" })).status, 409, "no price change after deposit");
  // Contract signing is blocked while a proposal is pending.
  const pending = await bookingFor("2028-04-03", "2028-04-04");
  await send(`/bookings/${pending.booking.id}/status`, "PUT", owner, { status: "Accepted" });
  await send(`/bookings/${pending.booking.id}/payment`, "POST", renter);
  await send("/contracts", "POST", owner, { bookingId: pending.booking.id });
  assert.equal((await send(`/bookings/${pending.booking.id}/price-revisions`, "POST", owner, { reason: "x".repeat(6), otherFee: 1, otherFeeLabel: "x" })).status, 409);

  // Complete a journey: deposit refund (form C) and commission
  const rental = await bookingFor("2028-05-01", "2028-05-04");
  const rentalId = rental.booking.id;
  const refundPath = `/bookings/${rentalId}/deposit-refund`;
  assert.equal(
    (await send(refundPath, "POST", owner, { refundAmount: 0, deductionAmount: rental.quote.deposit, reason: "too early" })).status,
    409,
    "no refund record before checkout",
  );
  assert.equal((await send(`/admin/bookings/${rentalId}/commission`, "POST", admin)).status, 409, "not completed yet");
  await completeBooking(rentalId);
  const deposit = rental.quote.deposit;
  assert.ok(deposit > 100);
  assert.equal((await send(refundPath, "POST", owner, { refundAmount: deposit, deductionAmount: 1 })).status, 422);
  assert.equal((await send(refundPath, "POST", owner, { refundAmount: deposit - 100, deductionAmount: 100 })).status, 400, "reason required");
  assert.equal((await send(refundPath, "POST", owner, { refundAmount: -1, deductionAmount: deposit + 1, reason: "valid reason" })).status, 400);
  assert.equal((await send(refundPath, "POST", renter, { refundAmount: deposit, deductionAmount: 0 })).status, 403);
  assert.equal((await send(refundPath, "POST", unrelatedOwner, { refundAmount: deposit, deductionAmount: 0 })).status, 403);
  const proposed = await send(refundPath, "POST", owner, {
    refundAmount: deposit - 100,
    deductionAmount: 100,
    reason: "Vết xước mới",
    refundDate: "2028-05-08",
    method: "Chuyển khoản",
  });
  assert.equal(proposed.status, 201, json(proposed.body));
  assert.equal(proposed.body.status, "Proposed");
  assert.equal((await send(refundPath, "PUT", renter, { decision: "dispute" })).status, 400, "note required");
  const disputed = await send(refundPath, "PUT", renter, { decision: "dispute", note: "Vết xước có từ trước" });
  assert.equal(disputed.body.status, "Disputed");
  const reproposed = await send(refundPath, "POST", owner, { refundAmount: deposit, deductionAmount: 0 });
  assert.equal(reproposed.status, 201);
  assert.equal(reproposed.body.id, 2);
  assert.equal((await send(refundPath, "PUT", renter, { decision: "confirm" })).body.status, "Confirmed");
  assert.equal((await send(refundPath, "PUT", renter, { decision: "confirm" })).status, 409);
  assert.equal((await send(refundPath, "POST", owner, { refundAmount: 0, deductionAmount: deposit, reason: "late change" })).status, 409);
  const afterRefund = (await request(`/bookings/${rentalId}`, { token: owner })).body;
  assert.equal(afterRefund.depositRefundHistory.length, 1, "history preserved");

  // Commission trial
  const baseRental = rental.quote.baseRental;
  assert.equal(baseRental, rental.quote.days * rental.quote.pricePerDay);
  assert.equal((await request("/admin/commission/policy", { token: owner })).status, 403);
  const policy = await request("/admin/commission/policy", { token: admin });
  assert.equal(policy.body.chargeable, false);
  assert.deepEqual(policy.body.tiers.map((t) => t.rateBps), [500, 400, 300]);
  for (const [value, amount] of [["999999", 50000], ["1000000", 40000], ["1999999", 80000], ["2000000", 60000], ["2100000", 63000], ["1400000", 56000]])
    assert.equal((await request(`/admin/commission/preview?base=${value}`, { token: admin })).body.amount, amount);
  for (const value of ["-1", "abc", "1.5", "", "99999999999999"])
    assert.equal((await request(`/admin/commission/preview?base=${value}`, { token: admin })).status, 400, value);
  const totalBefore = (await request(`/bookings/${rentalId}`, { token: renter })).body.totalPrice;
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () => send(`/admin/bookings/${rentalId}/commission`, "POST", admin)),
  );
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 200, 200, 200, 201]);
  const record = attempts.find((r) => r.status === 201).body;
  const expected = commissionFor(baseRental);
  assert.equal(record.amount, expected.amount);
  assert.equal(record.baseAmount, baseRental);
  assert.equal(record.policyVersion, COMMISSION_POLICY_VERSION);
  assert.equal(record.chargeable, false);
  assert.equal(record.status, "trial");
  assert.equal(stored().commissions.length, 1);
  assert.equal((await request(`/bookings/${rentalId}`, { token: renter })).body.totalPrice, totalBefore, "renter is not charged");
  assert.equal((await send(`/admin/bookings/${rentalId}/commission`, "POST", owner)).status, 403);
  assert.equal((await request("/admin/commissions", { token: admin })).body.length, 1);
  // Not eligible: pending booking, and legacy booking lacking pricing data.
  assert.equal((await send(`/admin/bookings/${pending.booking.id}/commission`, "POST", admin)).status, 409);
  const db = stored();
  db.bookings.push({
    id: 9001, renterId: 1, ownerId: 4, carId: 2, status: "Completed",
    startDate: "2025-01-01T08:00:00+07:00", endDate: "2025-01-02T08:00:00+07:00",
    totalPrice: 700000, deposit: 1000000, paymentStatus: "Paid",
  });
  fs.writeFileSync(dbFile, JSON.stringify(db));
  assert.equal((await send("/admin/bookings/9001/commission", "POST", admin)).status, 422);
  assert.equal((await send("/bookings/9001/price-revisions", "POST", owner, { reason: "valid reason", otherFee: 1, otherFeeLabel: "x" })).status, 409);
  assert.equal((await request("/bookings/9001", { token: renter })).status, 200, "legacy booking still readable");

  // Reports
  assert.equal((await send("/reports", "POST", null, { type: "price_mismatch", message: "x".repeat(20) })).status, 401);
  assert.equal((await send("/reports", "POST", renter, { type: "nope", message: "x".repeat(20) })).status, 400);
  assert.equal((await send("/reports", "POST", renter, { type: "price_mismatch", message: "short" })).status, 400);
  assert.equal((await send("/reports", "POST", renter, { type: "price_mismatch", carId: 9999, message: "x".repeat(20) })).status, 404);
  assert.equal((await send("/reports", "POST", unrelatedOwner, { type: "platform_issue", bookingId: rentalId, message: "x".repeat(20) })).status, 403);
  const report = await send("/reports", "POST", renter, { type: "price_mismatch", carId: 1, message: "Giá thực tế cao hơn giá hiển thị" });
  assert.equal(report.status, 201);
  assert.equal(report.body.status, "Open");
  assert.equal((await request("/admin/reports", { token: renter })).status, 403);
  assert.equal((await request("/admin/reports", { token: admin })).body.length, 1);
  assert.equal((await send(`/admin/reports/${report.body.id}`, "PUT", admin, { status: "Resolved" })).body.status, "Resolved");
  assert.equal((await send(`/admin/reports/${report.body.id}`, "PUT", admin, { status: "bad" })).status, 400);

  // Existing consumers still work
  assert.equal((await request("/cars")).status, 200);
  assert.equal((await request("/search/cars?location=H%C3%A0%20N%E1%BB%99i")).status, 200);
  assert.equal((await request("/cars/1")).status, 200);

  // Email verification at registration.
  const outbox = path.join(tempDir, "outbox.jsonl");
  const lastCode = (to) => {
    const lines = fs.readFileSync(outbox, "utf8").trim().split("\n").map(JSON.parse);
    const mail = lines.filter((m) => m.to === to).at(-1);
    return mail.text.match(/\b(\d{6})\b/u)[1];
  };
  const reg = {
    name: "Nguoi Moi",
    email: "moi@example.com",
    phone: "0901234567",
    password: "matkhau123",
    role: "renter",
    acceptTerms: true,
  };
  const registered = await send("/auth/register", "POST", null, reg);
  assert.equal(registered.status, 201, json(registered.body));
  assert.equal(registered.body.requiresEmailVerification, true);
  assert.equal(registered.body.token, undefined, "no session before verification");
  assert.equal(registered.body.passwordHash, undefined);
  const blocked = await send("/auth/login", "POST", null, {
    email: reg.email,
    password: reg.password,
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
  const code = lastCode(reg.email);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  assert.equal(
    (await send("/auth/verify-email", "POST", null, { email: reg.email, code: wrong })).status,
    400,
  );
  const early = await send("/auth/resend-email-code", "POST", null, { email: reg.email });
  assert.equal(early.status, 429, "resend cooldown");
  const verified = await send("/auth/verify-email", "POST", null, { email: reg.email, code });
  assert.equal(verified.status, 200, json(verified.body));
  assert.ok(verified.body.token);
  assert.equal(verified.body.emailVerified, true);
  assert.equal(verified.body.emailVerification, undefined);
  assert.equal(
    (await send("/auth/verify-email", "POST", null, { email: reg.email, code })).status,
    400,
    "code cannot be reused",
  );
  assert.equal(
    (await send("/auth/login", "POST", null, { email: reg.email, password: reg.password })).status,
    200,
  );
  assert.equal(
    (await send("/auth/register", "POST", null, reg)).status,
    409,
    "verified email cannot be re-registered",
  );
  // Brute force: 5 wrong attempts invalidate the code even if the right one follows.
  const bf = { ...reg, email: "bf@example.com" };
  assert.equal((await send("/auth/register", "POST", null, bf)).status, 201);
  const bfCode = lastCode(bf.email);
  const bfWrong = String((Number(bfCode) + 1) % 1_000_000).padStart(6, "0");
  for (let i = 0; i < 5; i += 1)
    await send("/auth/verify-email", "POST", null, { email: bf.email, code: bfWrong });
  assert.equal(
    (await send("/auth/verify-email", "POST", null, { email: bf.email, code: bfCode })).status,
    400,
  );
  // Re-registering an unverified address replaces the unactivated account.
  assert.equal((await send("/auth/register", "POST", null, bf)).status, 201);
  assert.equal(
    (await send("/auth/verify-email", "POST", null, { email: bf.email, code: lastCode(bf.email) })).status,
    200,
  );
  // Legacy users without the field keep logging in.
  assert.equal((await send("/auth/login", "POST", null, { email: "renter@pacecar.vn", password: "123456" })).status, 200);

  console.log("PaceCar terms, price confirmation, refund record, report and commission-trial tests passed.");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
