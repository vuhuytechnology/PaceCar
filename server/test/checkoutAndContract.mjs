import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 4055;
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacecar-test-"));
  const dbFile = path.join(tempDir, "db.json");

  const proc = spawn(process.execPath, ["src/index.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      PACECAR_DB_FILE: dbFile,
      PACECAR_UPLOAD_DIR: path.join(tempDir, "uploads"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (d) => process.stdout.write(d));
  proc.stderr.on("data", (d) => process.stderr.write(d));

  try {
    // Wait for server to boot
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    // Login as renter (user 1: renter@pacecar.vn)
    const renterRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "renter@pacecar.vn", password: "123456" }),
    });
    assert.equal(renterRes.status, 200);
    const renter = await renterRes.json();
    const renterToken = renter.token;

    // Login as owner (user 6: linh@pacecar.vn)
    const ownerRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "linh@pacecar.vn", password: "123456" }),
    });
    assert.equal(ownerRes.status, 200);
    const owner = await ownerRes.json();
    const ownerToken = owner.token;

    // Ensure owner has payment account configured
    await fetch(`${BASE}/api/payment-account`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "DO MAI LINH",
      }),
    });

    // Login as admin
    const adminRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@pacecar.vn", password: "123456" }),
    });
    assert.equal(adminRes.status, 200);
    const admin = await adminRes.json();
    const adminToken = admin.token;

    console.log("=== Test 1: Booking 6 (seeded Ongoing with no evidence) Checkout ===");
    // Owner completes booking 6
    const completeB6Res = await fetch(`${BASE}/api/bookings/6/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: "Completed" }),
    });
    if (completeB6Res.status !== 200) {
      throw new Error(`Complete booking 6 failed: ${await completeB6Res.text()}`);
    }
    const b6 = await completeB6Res.json();
    assert.equal(b6.status, "Completed");
    console.log("✓ Booking 6 checked out and marked Completed without crash");

    console.log("=== Test 2: Past Deal Creation & Contract Signing Timestamps ===");
    // Create quote for past dates (2025-05-01 to 2025-05-03)
    const quoteRes = await fetch(`${BASE}/api/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
      body: JSON.stringify({
        carId: 6,
        startDate: "2025-05-01",
        startTime: "09:00",
        endDate: "2025-05-03",
        endTime: "18:00",
        pickupOption: "pickup",
        driverOption: "self",
      }),
    });
    if (quoteRes.status !== 201) {
      throw new Error(`Quote failed (${quoteRes.status}): ${await quoteRes.text()}`);
    }
    const quote = await quoteRes.json();

    // Create booking from quote
    const bookRes = await fetch(`${BASE}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        pickupLocation: "Nội thành Hà Nội",
        returnLocation: "Nội thành Hà Nội",
        consent: {
          policyVersion: quote.policyVersion,
          termsVersion: quote.termsVersion,
          termsAccepted: true,
          roleAcknowledged: true,
        },
      }),
    });
    if (bookRes.status !== 201) {
      throw new Error(`Booking failed (${bookRes.status}): ${await bookRes.text()}`);
    }
    const booking = await bookRes.json();
    console.log(`✓ Past booking created: #${booking.id}`);

    // Owner accepts booking
    const acceptRes = await fetch(`${BASE}/api/bookings/${booking.id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        status: "Accepted",
        ownerPolicyConfirmed: true,
      }),
    });
    assert.equal(acceptRes.status, 200);

    // Renter requests payment QR code
    const qrRes = await fetch(`${BASE}/api/bookings/${booking.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
    });
    if (qrRes.status !== 200 && qrRes.status !== 201) {
      throw new Error(`Payment QR failed (${qrRes.status}): ${await qrRes.text()}`);
    }

    // Owner confirms deposit payment
    const confirmPayRes = await fetch(`${BASE}/api/bookings/${booking.id}/payment/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ confirmedReceived: true }),
    });
    if (confirmPayRes.status !== 200) {
      throw new Error(`Confirm payment failed (${confirmPayRes.status}): ${await confirmPayRes.text()}`);
    }

    // Owner creates contract
    const contractRes = await fetch(`${BASE}/api/contracts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ bookingId: booking.id }),
    });
    assert.equal(contractRes.status, 201);
    const contract = await contractRes.json();
    assert.equal(contract.createdAt, booking.createdAt);
    console.log(`✓ Contract createdAt (${contract.createdAt}) matches booking.createdAt`);

    // Renter signs contract
    const renterSignRes = await fetch(`${BASE}/api/contracts/${booking.id}/sign`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
      body: JSON.stringify({ consent: true }),
    });
    assert.equal(renterSignRes.status, 200);
    const contractPartiallySigned = await renterSignRes.json();
    assert.equal(contractPartiallySigned.renterSigned, true);
    assert.equal(contractPartiallySigned.renterSignedAt, contract.createdAt);
    console.log(`✓ renterSignedAt (${contractPartiallySigned.renterSignedAt}) matches contract.createdAt`);

    // Owner signs contract
    const ownerSignRes = await fetch(`${BASE}/api/contracts/${booking.id}/sign`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ consent: true }),
    });
    assert.equal(ownerSignRes.status, 200);
    const contractFullySigned = await ownerSignRes.json();
    assert.equal(contractFullySigned.ownerSigned, true);
    assert.equal(contractFullySigned.ownerSignedAt, contract.createdAt);
    assert.equal(contractFullySigned.signedAt, contract.createdAt);
    console.log(`✓ ownerSignedAt (${contractFullySigned.ownerSignedAt}) and signedAt (${contractFullySigned.signedAt}) match contract.createdAt`);

    console.log("=== Test 3: Renter Check-out / Trả xe ngay ===");
    // Pay rental balance
    await fetch(`${BASE}/api/bookings/${booking.id}/balance-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${renterToken}` },
      body: JSON.stringify({}),
    });
    await fetch(`${BASE}/api/bookings/${booking.id}/balance-payment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ confirmedReceived: true }),
    });

    // Transition to Ongoing first
    const ongoingRes = await fetch(`${BASE}/api/bookings/${booking.id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: "Ongoing" }),
    });
    if (ongoingRes.status !== 200) {
      throw new Error(`Ongoing failed (${ongoingRes.status}): ${await ongoingRes.text()}`);
    }

    // Renter clicks "Trả xe ngay" -> calls PUT /api/bookings/:id/status with Completed
    const renterReturnRes = await fetch(`${BASE}/api/bookings/${booking.id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
      body: JSON.stringify({ status: "Completed" }),
    });
    assert.equal(renterReturnRes.status, 200);
    const completedBooking = await renterReturnRes.json();
    assert.equal(completedBooking.status, "Completed");
    console.log("✓ Renter check-out succeeded! Booking is Completed.");

    console.log("=== Test 4: Check-out directly from Contract Signed ===");
    // Login as owner 4 (owner@pacecar.vn) for car 1
    const owner4Res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@pacecar.vn", password: "123456" }),
    });
    assert.equal(owner4Res.status, 200);
    const owner4 = await owner4Res.json();
    const owner4Token = owner4.token;

    await fetch(`${BASE}/api/payment-account`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner4Token}`,
      },
      body: JSON.stringify({
        bankCode: "VCB",
        accountNumber: "987654321",
        accountHolder: "PHAM DUC LONG",
      }),
    });

    // Create another deal with car 1 and sign contract
    const q2Res = await fetch(`${BASE}/api/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
      body: JSON.stringify({
        carId: 1,
        startDate: "2025-06-01",
        startTime: "10:00",
        endDate: "2025-06-02",
        endTime: "18:00",
        pickupOption: "pickup",
        driverOption: "self",
      }),
    });
    if (q2Res.status !== 201) {
      throw new Error(`Quote 2 failed (${q2Res.status}): ${await q2Res.text()}`);
    }
    const q2 = await q2Res.json();
    const b2Res = await fetch(`${BASE}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${renterToken}`,
      },
      body: JSON.stringify({
        quoteId: q2.quoteId,
        consent: {
          policyVersion: q2.policyVersion,
          termsVersion: q2.termsVersion,
          termsAccepted: true,
          roleAcknowledged: true,
        },
      }),
    });
    if (b2Res.status !== 201) {
      throw new Error(`Booking 2 failed (${b2Res.status}): ${await b2Res.text()}`);
    }
    const b2 = await b2Res.json();

    await fetch(`${BASE}/api/bookings/${b2.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner4Token}` },
      body: JSON.stringify({ status: "Accepted", ownerPolicyConfirmed: true }),
    });
    await fetch(`${BASE}/api/bookings/${b2.id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${renterToken}` },
    });
    await fetch(`${BASE}/api/bookings/${b2.id}/payment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner4Token}` },
      body: JSON.stringify({ confirmedReceived: true }),
    });
    await fetch(`${BASE}/api/contracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner4Token}` },
      body: JSON.stringify({ bookingId: b2.id }),
    });
    await fetch(`${BASE}/api/contracts/${b2.id}/sign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${renterToken}` },
      body: JSON.stringify({ consent: true }),
    });
    await fetch(`${BASE}/api/contracts/${b2.id}/sign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner4Token}` },
      body: JSON.stringify({ consent: true }),
    });

    // Check-out directly to Completed from Contract Signed
    const directCompleteRes = await fetch(`${BASE}/api/bookings/${b2.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner4Token}` },
      body: JSON.stringify({ status: "Completed" }),
    });
    if (directCompleteRes.status !== 200) {
      throw new Error(`Direct complete failed (${directCompleteRes.status}): ${await directCompleteRes.text()}`);
    }
    const b2Completed = await directCompleteRes.json();
    assert.equal(b2Completed.status, "Completed");
    console.log("✓ Direct check-out from Contract Signed succeeded.");

    console.log("\nALL TESTS PASSED SUCCESSFULLY!");
  } finally {
    proc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
