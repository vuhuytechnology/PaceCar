import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TERMS_VERSION } from "../src/policy.js";

const consentFor = (quote) => ({
  policyVersion: quote.policyVersion,
  termsVersion: TERMS_VERSION,
  termsAccepted: true,
  roleAcknowledged: true,
});
const serverDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacecar-smoke-"));
const dbFile = path.join(tempDir, "db.json");
const port = 4197;
const base = `http://localhost:${port}/api`;
const server = spawn(process.execPath, ["src/index.js"], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(port),
    PACECAR_DB_FILE: dbFile,
    PACECAR_UPLOAD_DIR: path.join(tempDir, "uploads"),
    CLIENT_ORIGIN: "http://localhost:5173",
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
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function waitForServer() {
  // First-run password migration uses scrypt and can take longer on small CI/
  // Render-class machines, so give the isolated smoke server enough time.
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const health = await request("/health");
      if (health.status === 200) return;
    } catch {
      // Server startup is expected to refuse connections briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start.\n${serverLog}`);
}

async function login(email, password = "123456") {
  const response = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.token;
}

try {
  await waitForServer();
  const renter = await login("renter@pacecar.vn");
  const owner = await login("owner@pacecar.vn");
  const unrelatedOwner = await login("tung@pacecar.vn");
  const admin = await login("admin@pacecar.vn");

  const renterDashboard = await request("/dashboard/renter/1", {
    token: renter,
  });
  assert.equal(renterDashboard.status, 200);
  assert.equal(renterDashboard.body.user.trustScore, 88);
  assert.equal(renterDashboard.body.user.riskLevel, "Low");
  assert.ok(Array.isArray(renterDashboard.body.bookings));
  const ownerDashboard = await request("/dashboard/owner/4", { token: owner });
  assert.equal(ownerDashboard.status, 200);
  assert.ok(Array.isArray(ownerDashboard.body.cars));
  assert.ok(Array.isArray(ownerDashboard.body.calendar));
  assert.ok(Array.isArray(ownerDashboard.body.alerts));
  const adminDashboard = await request("/dashboard/admin", { token: admin });
  assert.equal(adminDashboard.status, 200);
  assert.ok(Array.isArray(adminDashboard.body.disputes));
  assert.ok(Array.isArray(adminDashboard.body.riskAlerts));
  assert.ok(adminDashboard.body.users.every((user) => !("passwordHash" in user)));
  assert.equal(
    (await request("/dashboard/admin", { token: renter })).status,
    403,
  );
  assert.equal(
    (await request("/dashboard/owner/5", { token: owner })).status,
    403,
  );
  // Commission trial stays off unless COMMISSION_TRIAL_ENABLED=true.
  assert.equal(
    (await request("/admin/commission/policy", { token: admin })).status,
    403,
  );

  const reconciledBookings = await request("/bookings", { token: admin });
  assert.equal(
    reconciledBookings.body.find((item) => item.id === 1).status,
    "Expired",
  );
  assert.equal(
    reconciledBookings.body.find((item) => item.id === 6).status,
    "Check-out Review",
  );
  const expiredAccept = await request("/bookings/1/status", {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ status: "Accepted" }),
  });
  assert.equal(expiredAccept.status, 409);
  const reconciliationTimeline = await request("/bookings/1/timeline", {
    token: owner,
  });
  assert.ok(
    reconciliationTimeline.body.some(
      (item) => item.action === "STATUS_AUTO_UPDATED",
    ),
  );

  const forbiddenRiskAlerts = await request("/risk-alerts", { token: renter });
  assert.equal(forbiddenRiskAlerts.status, 403);
  const ownerRiskAlerts = await request("/risk-alerts", { token: owner });
  assert.equal(ownerRiskAlerts.status, 200);
  assert.ok(ownerRiskAlerts.body.every((item) => item.ownerId === 4));
  const acknowledgedAlert = await request("/risk-alerts/1/status", {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ status: "Acknowledged" }),
  });
  assert.equal(acknowledgedAlert.status, 200);
  const resolvedAlert = await request("/risk-alerts/2/status", {
    method: "PUT",
    token: admin,
    body: JSON.stringify({ status: "Resolved" }),
  });
  assert.equal(resolvedAlert.status, 200);

  const registrationInput = {
    name: "QA Renter",
    email: "qa-renter@example.test",
    phone: "+84 912 345 678",
    password: "PacecarTest!2026",
    role: "renter",
    acceptTerms: true,
  };
  const registrationWithoutConsent = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...registrationInput, acceptTerms: false }),
  });
  assert.equal(registrationWithoutConsent.status, 400);
  assert.ok(registrationWithoutConsent.body.fields.acceptTerms);

  const adminRegistration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...registrationInput, role: "admin" }),
  });
  assert.equal(adminRegistration.status, 400);
  assert.ok(adminRegistration.body.fields.role);

  const invalidRegistration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      ...registrationInput,
      email: "not-an-email",
      phone: "12",
      password: "short",
    }),
  });
  assert.equal(invalidRegistration.status, 400);
  assert.ok(invalidRegistration.body.fields.email);
  assert.ok(invalidRegistration.body.fields.phone);
  assert.ok(invalidRegistration.body.fields.password);

  const registeredRenter = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify(registrationInput),
  });
  assert.equal(
    registeredRenter.status,
    201,
    JSON.stringify(registeredRenter.body),
  );
  assert.equal(registeredRenter.body.role, "renter");
  assert.equal(registeredRenter.body.email, registrationInput.email);
  assert.equal(typeof registeredRenter.body.token, "string");
  assert.equal("password" in registeredRenter.body, false);
  assert.equal("passwordHash" in registeredRenter.body, false);
  assert.equal("consents" in registeredRenter.body, false);
  const persistedRegistration = JSON.parse(fs.readFileSync(dbFile, "utf8"));
  const storedRegisteredUser = persistedRegistration.users.find(
    (user) => user.id === registeredRenter.body.id,
  );
  assert.notEqual(
    storedRegisteredUser.passwordHash,
    registrationInput.password,
  );
  assert.equal(
    storedRegisteredUser.consents.termsVersion,
    TERMS_VERSION,
  );
  assert.ok(storedRegisteredUser.consents.acceptedAt);
  assert.ok(
    persistedRegistration.sessions.some(
      (session) =>
        session.userId === storedRegisteredUser.id &&
        session.tokenHash !== registeredRenter.body.token,
    ),
  );
  const registeredProfile = await request(
    `/users/${registeredRenter.body.id}`,
    { token: registeredRenter.body.token },
  );
  assert.equal(registeredProfile.status, 200);
  const updatedProfile = await request(`/users/${registeredRenter.body.id}`, {
    method: "PUT",
    token: registeredRenter.body.token,
    body: JSON.stringify({ name: "QA Renter Updated", phone: "0912345678" }),
  });
  assert.equal(updatedProfile.status, 200);
  assert.equal(updatedProfile.body.name, "QA Renter Updated");
  const registeredLoginToken = await login(
    registrationInput.email,
    registrationInput.password,
  );
  assert.equal(
    (
      await request(`/users/${registeredRenter.body.id}`, {
        token: registeredLoginToken,
      })
    ).status,
    200,
  );

  const duplicateRegistration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify(registrationInput),
  });
  assert.equal(duplicateRegistration.status, 409);
  assert.ok(duplicateRegistration.body.fields.email);

  const registeredOwner = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      ...registrationInput,
      name: "QA Owner",
      email: "qa-owner@example.test",
      role: "owner",
    }),
  });
  assert.equal(registeredOwner.status, 201);
  assert.equal(registeredOwner.body.role, "owner");
  assert.equal("token" in registeredOwner.body, true);

  const loggedOutRegistration = await request("/auth/logout", {
    method: "POST",
    token: registeredRenter.body.token,
  });
  assert.equal(loggedOutRegistration.status, 200);
  const revokedRegistrationSession = await request(
    `/users/${registeredRenter.body.id}`,
    { token: registeredRenter.body.token },
  );
  assert.equal(revokedRegistrationSession.status, 401);

  const publicCars = await request("/cars");
  assert.ok(publicCars.body.length >= 20);
  assert.ok(
    ["Sedan", "SUV", "MPV", "Hatchback", "Pickup", "Van"].every((type) =>
      publicCars.body.some((car) => car.type === type),
    ),
  );
  assert.ok(
    publicCars.body.every((car) => car.imageUrl.startsWith("https://")),
  );
  const carWithoutReviews = publicCars.body.find((car) => car.id === 1);
  assert.equal(carWithoutReviews.reviewCount, 0);
  assert.equal(carWithoutReviews.rating, null);
  const carWithReviews = publicCars.body.find((car) => car.id === 2);
  assert.equal(carWithReviews.reviewCount, 1);
  assert.equal(carWithReviews.rating, 5);
  const searchResults = await request("/search/cars?limit=24");
  const unratedSearchCar = searchResults.body.items.find((car) => car.id === 1);
  assert.equal(unratedSearchCar.reviewCount, 0);
  assert.equal(unratedSearchCar.rating, null);
  const filteredSearch = await request(
    "/search/cars?location=H%C3%A0%20N%E1%BB%99i&type=SUV&minPrice=1000000&maxPrice=1300000&seats=5&driverOption=self&sort=price-asc",
  );
  assert.equal(filteredSearch.status, 200);
  assert.ok(filteredSearch.body.items.length > 0);
  assert.ok(
    filteredSearch.body.items.every(
      (car) =>
        car.location.includes("Hà Nội") &&
        car.type === "SUV" &&
        car.pricePerDay >= 1000000 &&
        car.pricePerDay <= 1300000 &&
        car.seats >= 5 &&
        car.selfDriveAvailable,
    ),
  );
  assert.deepEqual(
    filteredSearch.body.items.map((car) => car.pricePerDay),
    [...filteredSearch.body.items]
      .map((car) => car.pricePerDay)
      .sort((a, b) => a - b),
  );
  const deliverySearch = await request("/search/cars?delivery=true");
  assert.equal(deliverySearch.status, 200);
  assert.ok(
    deliverySearch.body.items.every(
      (car) => car.deliveryOptions?.ownerDelivery === true,
    ),
  );
  const vehicleDetail = await request("/cars/2");
  assert.equal(vehicleDetail.status, 200);
  assert.ok(vehicleDetail.body.photos.length >= 1);
  assert.ok(vehicleDetail.body.rules);
  assert.equal(vehicleDetail.body.owner.trustScore, 86);
  assert.equal(typeof vehicleDetail.body.reviewCount, "number");
  assert.equal(typeof vehicleDetail.body.rating, "number");
  const unratedDetail = await request("/cars/1");
  assert.equal(unratedDetail.body.reviewCount, 0);
  assert.equal(unratedDetail.body.rating, null);

  const forbiddenPromotions = await request("/admin/promotions", {
    token: owner,
  });
  assert.equal(forbiddenPromotions.status, 403);
  const createdPromotion = await request("/admin/promotions", {
    method: "POST",
    token: admin,
    body: JSON.stringify({
      code: "SMOKE15",
      title: "Ưu đãi kiểm thử",
      description: "Dùng để kiểm tra vòng đời quản trị",
      type: "percentage",
      value: 15,
      maxDiscount: 250000,
      minRental: 500000,
      minDays: 1,
      usageLimit: 10,
      expiresAt: "2027-12-31T23:59:59.000Z",
      active: true,
    }),
  });
  assert.equal(
    createdPromotion.status,
    201,
    JSON.stringify(createdPromotion.body),
  );
  assert.equal(createdPromotion.body.code, "SMOKE15");
  const duplicatePromotion = await request("/admin/promotions", {
    method: "POST",
    token: admin,
    body: JSON.stringify({ ...createdPromotion.body, id: undefined }),
  });
  assert.equal(duplicatePromotion.status, 409);
  const publicPromotions = await request("/promotions");
  assert.ok(publicPromotions.body.some((item) => item.code === "SMOKE15"));
  const disabledPromotion = await request(
    `/admin/promotions/${createdPromotion.body.id}/status`,
    {
      method: "PATCH",
      token: admin,
      body: JSON.stringify({ active: false }),
    },
  );
  assert.equal(disabledPromotion.status, 200);
  assert.equal(disabledPromotion.body.active, false);
  const archivedPromotion = await request(
    `/admin/promotions/${createdPromotion.body.id}`,
    { method: "DELETE", token: admin },
  );
  assert.equal(archivedPromotion.status, 204);

  const invalidQuote = await request("/quotes", {
    method: "POST",
    body: JSON.stringify({
      carId: 1,
      startDate: "2027-06-10",
      endDate: "2027-06-12",
      driverOption: "arbitrary",
      pickupOption: "pickup",
    }),
  });
  assert.equal(invalidQuote.status, 400);

  const invalidTimeQuote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      carId: 1,
      startDate: "2027-06-10",
      startTime: "26:90",
      endDate: "2027-06-12",
      endTime: "20:00",
      driverOption: "self",
      pickupOption: "pickup",
    }),
  });
  assert.equal(invalidTimeQuote.status, 400);

  const invalidCalendarQuote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      carId: 1,
      startDate: "2027-02-30",
      startTime: "08:00",
      endDate: "2027-03-02",
      endTime: "20:00",
      driverOption: "self",
      pickupOption: "pickup",
    }),
  });
  assert.equal(invalidCalendarQuote.status, 400);

  const pastSearch = await request(
    "/search/cars?startDate=2020-01-01&startTime=08%3A00&endDate=2020-01-02&endTime=20%3A00",
  );
  assert.equal(pastSearch.status, 400);

  const unsupportedHandoverSearch = await request(
    "/search/cars?startDate=2027-09-24&startTime=05%3A30&endDate=2027-09-24&endTime=20%3A00",
  );
  assert.equal(unsupportedHandoverSearch.status, 422);

  const sameDaySearch = await request(
    "/search/cars?location=H%C3%A0%20N%E1%BB%99i&startDate=2027-09-24&startTime=06%3A00&endDate=2027-09-24&endTime=22%3A00&driverOption=self",
  );
  assert.equal(sameDaySearch.status, 200, JSON.stringify(sameDaySearch.body));
  assert.ok(sameDaySearch.body.items.length > 0);

  const sameDayQuote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      carId: 2,
      startDate: "2027-09-24",
      startTime: "06:00",
      endDate: "2027-09-24",
      endTime: "22:00",
      destination: "Hải Phòng",
      driverOption: "self",
      pickupOption: "pickup",
    }),
  });
  assert.equal(sameDayQuote.status, 201, JSON.stringify(sameDayQuote.body));
  assert.equal(sameDayQuote.body.days, 1);
  assert.equal(sameDayQuote.body.durationHours, 16);
  assert.equal(sameDayQuote.body.weekendDays, 0);
  assert.equal(sameDayQuote.body.outsideHoursCount, 2);
  assert.equal(sameDayQuote.body.outsideHoursFee, 200000);
  assert.equal(sameDayQuote.body.policyVersion, "PC-2026.3");
  assert.equal(sameDayQuote.body.baseRental, sameDayQuote.body.pricePerDay);
  assert.equal(typeof sameDayQuote.body.platformFee, "number");
  assert.equal(typeof sameDayQuote.body.insuranceFee, "number");
  assert.equal(typeof sameDayQuote.body.deliveryFee, "number");
  assert.equal(typeof sameDayQuote.body.deposit, "number");
  assert.equal(
    sameDayQuote.body.totalPrice,
    Math.max(
      0,
      sameDayQuote.body.baseRental +
        sameDayQuote.body.weekendSurcharge +
        sameDayQuote.body.driverFee -
        sameDayQuote.body.longRentalDiscount +
        sameDayQuote.body.platformFee +
        sameDayQuote.body.insuranceFee +
        sameDayQuote.body.deliveryFee +
        sameDayQuote.body.outsideHoursFee -
        sameDayQuote.body.promoDiscount,
    ),
  );
  const addOnQuote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
        carId: 1,
        startDate: "2027-08-03",
        startTime: "08:00",
        endDate: "2027-08-03",
        endTime: "20:00",
        driverOption: "driver",
        pickupOption: "delivery",
    }),
  });
  assert.equal(addOnQuote.status, 201, JSON.stringify(addOnQuote.body));
  assert.equal(addOnQuote.body.driverFee, 350000);
  assert.equal(addOnQuote.body.deliveryFee, 150000);
  assert.equal(addOnQuote.body.insuranceFee, 80000);
  assert.equal(addOnQuote.body.platformFee, 100000);
  assert.equal(addOnQuote.body.deposit, 5000000);
  assert.equal(addOnQuote.body.totalPrice, 1330000);

  const weekendEarlyQuote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      carId: 2,
      startDate: "2027-09-25",
      startTime: "06:00",
      endDate: "2027-09-25",
      endTime: "22:00",
      driverOption: "self",
      pickupOption: "pickup",
    }),
  });
  assert.equal(weekendEarlyQuote.status, 201);
  assert.equal(weekendEarlyQuote.body.weekendDays, 1);
  const sameDayQuoteDetail = await request(
    `/quotes/${sameDayQuote.body.quoteId}`,
    { token: renter },
  );
  assert.equal(sameDayQuoteDetail.body.destination, "Hải Phòng");
  assert.match(sameDayQuoteDetail.body.pickupLocation, /Cầu Giấy/);

  const limitedPromotion = await request("/admin/promotions", {
    method: "POST",
    token: admin,
    body: JSON.stringify({
      code: "LASTSLOT",
      title: "Lượt ưu đãi cuối",
      type: "fixed",
      value: 100000,
      minRental: 0,
      minDays: 1,
      usageLimit: 1,
      expiresAt: "2027-12-31T23:59:59.000Z",
      active: true,
    }),
  });
  assert.equal(limitedPromotion.status, 201);
  const limitedQuotes = [];
  for (const input of [
    { carId: 1, startDate: "2027-08-01", endDate: "2027-08-02" },
    { carId: 2, startDate: "2027-08-03", endDate: "2027-08-04" },
  ]) {
    const response = await request("/quotes", {
      method: "POST",
      token: renter,
      body: JSON.stringify({
        ...input,
        startTime: "08:00",
        endTime: "20:00",
        driverOption: "self",
        pickupOption: "pickup",
        promoCode: "LASTSLOT",
      }),
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    limitedQuotes.push(response.body);
  }
  const firstLimitedBooking = await request("/bookings", {
    method: "POST",
    token: renter,
    headers: { "Idempotency-Key": "promo-last-slot-1" },
    body: JSON.stringify({
      quoteId: limitedQuotes[0].quoteId,
      consent: consentFor(limitedQuotes[0]),
    }),
  });
  assert.equal(firstLimitedBooking.status, 201);
  const exhaustedPromotionBooking = await request("/bookings", {
    method: "POST",
    token: renter,
    headers: { "Idempotency-Key": "promo-last-slot-2" },
    body: JSON.stringify({
      quoteId: limitedQuotes[1].quoteId,
      consent: consentFor(limitedQuotes[1]),
    }),
  });
  assert.equal(exhaustedPromotionBooking.status, 409);

  const quoteInput = {
    carId: 1,
    startDate: "2027-06-10",
    startTime: "08:00",
    endDate: "2027-06-12",
    endTime: "20:00",
    driverOption: "self",
    pickupOption: "pickup",
  };
  const quote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify(quoteInput),
  });
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  assert.ok(quote.body.policyVersion);
  assert.ok(quote.body.totalPrice > 0);

  const secondQuote = await request("/quotes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      ...quoteInput,
      startDate: "2027-07-10",
      endDate: "2027-07-12",
    }),
  });
  assert.equal(secondQuote.status, 201);

  const missingConsent = await request("/bookings", {
    method: "POST",
    token: renter,
    headers: { "Idempotency-Key": "smoke-booking" },
    body: JSON.stringify({ quoteId: quote.body.quoteId }),
  });
  assert.equal(missingConsent.status, 422);

  const booking = await request("/bookings", {
    method: "POST",
    token: renter,
    headers: { "Idempotency-Key": "smoke-booking" },
    body: JSON.stringify({
      quoteId: quote.body.quoteId,
      totalPrice: 1,
      ownerId: 999,
      consent: consentFor(quote.body),
    }),
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.body));
  assert.equal(booking.body.totalPrice, quote.body.totalPrice);
  assert.equal(booking.body.ownerId, 4);

  const repeat = await request("/bookings", {
    method: "POST",
    token: renter,
    headers: { "Idempotency-Key": "smoke-booking" },
    body: JSON.stringify({
      quoteId: quote.body.quoteId,
      consent: consentFor(quote.body),
    }),
  });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.id, booking.body.id);

  const mismatchedKey = await request("/bookings", {
    method: "POST",
    token: renter,
    headers: { "Idempotency-Key": "smoke-booking" },
    body: JSON.stringify({
      quoteId: secondQuote.body.quoteId,
      consent: consentFor(secondQuote.body),
    }),
  });
  assert.equal(mismatchedKey.status, 409);

  const renterView = await request(`/bookings/${booking.body.id}`, {
    token: renter,
  });
  assert.equal(renterView.status, 200);
  assert.equal("documents" in renterView.body.car, false);

  const forbiddenView = await request(`/bookings/${booking.body.id}`, {
    token: unrelatedOwner,
  });
  assert.equal(forbiddenView.status, 403);

  const accepted = await request(`/bookings/${booking.body.id}/status`, {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ status: "Accepted" }),
  });
  assert.equal(accepted.status, 200);

  const contractBeforePayment = await request("/contracts", {
    method: "POST",
    token: owner,
    body: JSON.stringify({ bookingId: booking.body.id }),
  });
  assert.equal(contractBeforePayment.status, 409);

  const payment = await request(`/bookings/${booking.body.id}/payment`, {
    method: "POST",
    token: renter,
    body: JSON.stringify({ method: "demo" }),
  });
  assert.equal(payment.status, 200, JSON.stringify(payment.body));
  assert.equal(payment.body.paymentStatus, "Paid");
  assert.equal(payment.body.amount, booking.body.deposit);

  const contract = await request("/contracts", {
    method: "POST",
    token: owner,
    body: JSON.stringify({ bookingId: booking.body.id, terms: "tampered" }),
  });
  assert.equal(contract.status, 201, JSON.stringify(contract.body));
  assert.notEqual(contract.body.terms, "tampered");

  const renterSign = await request(`/contracts/${booking.body.id}/sign`, {
    method: "PUT",
    token: renter,
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(renterSign.status, 200);
  assert.equal(renterSign.body.renterSigned, true);

  const ownerSign = await request(`/contracts/${booking.body.id}/sign`, {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(ownerSign.status, 200);
  assert.equal(ownerSign.body.status, "Signed");
  assert.equal(ownerSign.body.booking.status, "Contract Signed");

  const readyForCheckin = await request(
    `/bookings/${booking.body.id}/status`,
    {
      method: "PUT",
      token: owner,
      body: JSON.stringify({ status: "Ready for Check-in" }),
    },
  );
  assert.equal(readyForCheckin.status, 200);
  const journeyEvidenceUpload = new FormData();
  journeyEvidenceUpload.append(
    "files",
    new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }),
    "checkin.png",
  );
  journeyEvidenceUpload.append("bookingId", String(booking.body.id));
  const journeyEvidence = await request("/uploads/evidence", {
    method: "POST",
    token: renter,
    body: journeyEvidenceUpload,
  });
  assert.equal(journeyEvidence.status, 201);
  const checkin = await request("/evidence", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      bookingId: booking.body.id,
      phase: "checkin",
      photos: [journeyEvidence.body.files[0].id],
      fuel: 80,
      odometer: 24500,
      notes: "QA check-in evidence",
    }),
  });
  assert.equal(checkin.status, 201);
  assert.equal(checkin.body.fuelBefore, 80);
  assert.equal(checkin.body.odometerBefore, 24500);
  const checkout = await request("/evidence", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      bookingId: booking.body.id,
      phase: "checkout",
      photos: [journeyEvidence.body.files[0].id],
      fuel: 60,
      odometer: 25000,
      notes: "QA check-out evidence",
    }),
  });
  assert.equal(checkout.status, 200);
  assert.equal(checkout.body.fuelAfter, 60);
  assert.equal(checkout.body.odometerAfter, 25000);
  assert.equal(checkout.body.status, "Complete");
  const completedJourney = await request(
    `/bookings/${booking.body.id}/status`,
    {
      method: "PUT",
      token: owner,
      body: JSON.stringify({ status: "Completed" }),
    },
  );
  assert.equal(completedJourney.status, 200);
  const journeyReview = await request("/reviews", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      bookingId: booking.body.id,
      rating: 5,
      comment: "QA completed full rental journey",
    }),
  });
  assert.equal(journeyReview.status, 201);
  const journeyTimeline = await request(
    `/bookings/${booking.body.id}/timeline`,
    { token: renter },
  );
  assert.ok(
    journeyTimeline.body.some(
      (event) => event.detail?.includes("Ready for Check-in"),
    ),
  );
  assert.ok(
    journeyTimeline.body.some((event) =>
      event.detail?.includes("evidence checkin"),
    ),
  );
  assert.ok(
    journeyTimeline.body.some((event) =>
      event.detail?.includes("evidence checkout"),
    ),
  );

  const evidenceUpload = new FormData();
  evidenceUpload.append(
    "files",
    new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }),
    "checkout.png",
  );
  evidenceUpload.append("bookingId", "6");
  const uploadedEvidence = await request("/uploads/evidence", {
    method: "POST",
    token: renter,
    body: evidenceUpload,
  });
  assert.equal(
    uploadedEvidence.status,
    201,
    JSON.stringify(uploadedEvidence.body),
  );
  const checkoutEvidence = await request("/evidence", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      bookingId: 6,
      phase: "checkout",
      photos: [uploadedEvidence.body.files[0].id],
      fuel: 60,
      odometer: 25000,
      notes: "QA checkout evidence",
    }),
  });
  assert.ok([200, 201].includes(checkoutEvidence.status));
  const openedDispute = await request("/disputes", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      bookingId: 6,
      reason: "QA workflow verification",
      description: "Isolated smoke-test dispute",
      evidence: [uploadedEvidence.body.files[0].id],
    }),
  });
  assert.equal(openedDispute.status, 201, JSON.stringify(openedDispute.body));
  const resolvedDispute = await request(
    `/disputes/${openedDispute.body.id}/status`,
    {
      method: "PUT",
      token: admin,
      body: JSON.stringify({
        status: "Resolved",
        decision: "Resolved in isolated QA data",
      }),
    },
  );
  assert.equal(resolvedDispute.status, 200);
  const emptyReview = await request("/reviews", {
    method: "POST",
    token: renter,
    body: JSON.stringify({ bookingId: 6, rating: 5, comment: "" }),
  });
  assert.equal(emptyReview.status, 400);
  const submittedReview = await request("/reviews", {
    method: "POST",
    token: renter,
    body: JSON.stringify({
      bookingId: 6,
      rating: 5,
      comment: "QA verified completed-trip review workflow",
    }),
  });
  assert.equal(
    submittedReview.status,
    201,
    JSON.stringify(submittedReview.body),
  );

  const documentUpload = new FormData();
  documentUpload.append(
    "files",
    new Blob([Buffer.from("%PDF-1.4 QA registration")], {
      type: "application/pdf",
    }),
    "registration.pdf",
  );
  documentUpload.append(
    "files",
    new Blob([Buffer.from("%PDF-1.4 QA insurance")], {
      type: "application/pdf",
    }),
    "insurance.pdf",
  );
  const uploadedDocuments = await request("/uploads/documents", {
    method: "POST",
    token: owner,
    body: documentUpload,
  });
  assert.equal(
    uploadedDocuments.status,
    201,
    JSON.stringify(uploadedDocuments.body),
  );
  const uploadedCarPhotos = new FormData();
  for (const name of ["front.png", "side.png", "rear.png"])
    uploadedCarPhotos.append(
      "files",
      new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }),
      name,
    );
  const carPhotos = await request("/uploads/cars", {
    method: "POST",
    token: owner,
    body: uploadedCarPhotos,
  });
  assert.equal(carPhotos.status, 201, JSON.stringify(carPhotos.body));
  const submittedCar = await request("/cars", {
    method: "POST",
    token: owner,
    body: JSON.stringify({
      name: "QA Test Car 2026",
      brand: "QA",
      model: "Test Car",
      year: 2026,
      licensePlate: "30A-QA123",
      location: "Hà Nội",
      seats: 5,
      transmission: "Automatic",
      fuel: "Petrol",
      type: "Sedan",
      pricePerDay: 700000,
      deposit: 5000000,
      description:
        "A complete isolated listing used for QA workflow verification.",
      selfDriveAvailable: true,
      withDriverAvailable: false,
      minRentalDays: 1,
      maxRentalDays: 30,
      photos: carPhotos.body.files.map((file) => file.url),
      documents: [
        { type: "registration", assetId: uploadedDocuments.body.files[0].id },
        { type: "insurance", assetId: uploadedDocuments.body.files[1].id },
      ],
      rules: { mileageLimit: 300, lateFeePerHour: 120000 },
      deliveryOptions: {
        ownerDelivery: false,
        pickupAtCar: true,
        deliveryFee: 0,
      },
      submitForReview: true,
    }),
  });
  assert.equal(submittedCar.status, 201, JSON.stringify(submittedCar.body));
  assert.equal(submittedCar.body.listingStatus, "Pending Review");
  const approvedCar = await request(
    `/cars/${submittedCar.body.id}/listing-status`,
    {
      method: "PUT",
      token: admin,
      body: JSON.stringify({ status: "Published" }),
    },
  );
  assert.equal(approvedCar.status, 200, JSON.stringify(approvedCar.body));
  const pausedCar = await request(
    `/cars/${submittedCar.body.id}/listing-status`,
    {
      method: "PUT",
      token: owner,
      body: JSON.stringify({ status: "Paused" }),
    },
  );
  assert.equal(pausedCar.status, 200, JSON.stringify(pausedCar.body));

  const favorite = await request("/favorites/1", {
    method: "POST",
    token: renter,
    body: "{}",
  });
  assert.equal(favorite.status, 201);
  const detail = await request("/cars/1", { token: renter });
  assert.equal(detail.body.favorite, true);

  const pause = await request("/cars/1/listing-status", {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ status: "Paused" }),
  });
  assert.equal(pause.status, 200);
  const edit = await request("/cars/1", {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ pricePerDay: 660000 }),
  });
  assert.ok([200, 422].includes(edit.status));
  if (edit.status === 200)
    assert.equal(edit.body.listingStatus, "Pending Review");
  const resume = await request("/cars/1/listing-status", {
    method: "PUT",
    token: owner,
    body: JSON.stringify({ status: "Published" }),
  });
  assert.equal(resume.status, 409);

  console.log(
    "PaceCar API end-to-end tests passed (search and filters, car details, server-side quotes, role dashboards, bookings, payment, contracts, check-in/out evidence, reviews, disputes, listings, promotions, trust, and risk alerts).",
  );
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
