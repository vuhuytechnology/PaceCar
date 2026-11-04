import assert from "node:assert/strict";
import {
  BASE_TRUST_SCORE,
  calculateBayesianRatingScore,
  clampScore,
  deriveRiskLevel,
  getUserTrustBreakdown,
  onDisputeResolved,
  onTripCompleted,
  recordTrustScoreEvent,
  syncUserTrustScore,
} from "../src/trustScore.js";

// 1. Test clampScore
assert.equal(clampScore(-10), 0);
assert.equal(clampScore(50), 50);
assert.equal(clampScore(120), 100);

// 2. Test deriveRiskLevel
assert.equal(deriveRiskLevel({ verified: true, licenseVerified: true }, 85), "Low");
assert.equal(deriveRiskLevel({ verified: true, licenseVerified: false, role: "renter" }, 85), "Medium");
assert.equal(deriveRiskLevel({ verified: false }, 60), "Medium");
assert.equal(deriveRiskLevel({ verified: false }, 45), "High");
assert.equal(deriveRiskLevel({ verified: true, hasSevereDispute: true }, 90), "High");

// 3. Test Bayesian Rating
assert.equal(calculateBayesianRatingScore([]), 0);
assert.equal(calculateBayesianRatingScore([{ rating: 5 }], 4.0, 1), 7);
assert.equal(calculateBayesianRatingScore(Array(10).fill({ rating: 5 })), 7);
assert.equal(calculateBayesianRatingScore(Array(25).fill({ rating: 5 })), 10);
assert.equal(calculateBayesianRatingScore(Array(10).fill({ rating: 2 })), -10);

// 4. Test Event Ledger and Idempotency
const mockDb = {
  users: [
    { id: 10, role: "renter", name: "Test Renter", verified: true, licenseVerified: true, phone: "0999999999", trustScore: 50, riskLevel: "Medium" },
    { id: 20, role: "owner", name: "Test Owner", verified: true, phone: "0888888888", trustScore: 50, riskLevel: "Medium" }
  ],
  bookings: [
    { id: 100, renterId: 10, ownerId: 20, status: "Completed", paymentStatus: "Paid" }
  ],
  evidence: [
    { bookingId: 100, status: "Complete" }
  ],
  disputes: [],
  reviews: [],
  cars: [
    { id: 101, ownerId: 20, listingStatus: "Published", verified: true, rating: 4.8, totalTrips: 15 }
  ],
  trustScoreEvents: []
};

// First sync
syncUserTrustScore(mockDb, 10);
syncUserTrustScore(mockDb, 20);

// Trigger trip completed
onTripCompleted(mockDb, mockDb.bookings[0]);
const renterUser = mockDb.users.find(u => u.id === 10);
assert.ok(renterUser.trustScore > 50, "Renter score should increase after completed trip");
assert.ok(mockDb.trustScoreEvents.length > 0, "Ledger should have events");

// Test idempotency: calling again should not add duplicate events for booking 100
const eventCountBefore = mockDb.trustScoreEvents.length;
onTripCompleted(mockDb, mockDb.bookings[0]);
assert.equal(mockDb.trustScoreEvents.length, eventCountBefore, "Trip completion should be idempotent");

// 5. Test Dispute Resolution Fault Penalty
const dispute = { id: 99, bookingId: 100, status: "Resolved", decision: "Xước xe nghiêm trọng", severity: "severe" };
mockDb.disputes.push(dispute);
const scoreBeforeDispute = renterUser.trustScore;

onDisputeResolved(mockDb, dispute, "Bồi thường hư hại", { liableParty: "renter", severity: "severe" });
assert.ok(renterUser.trustScore < scoreBeforeDispute, "Renter score should decrease after fault");
assert.equal(renterUser.riskLevel, "High", "Severe fault should set riskLevel to High");

// 6. Test breakdown structure
const breakdown = getUserTrustBreakdown(mockDb, renterUser);
assert.ok(breakdown.verification);
assert.ok(breakdown.history);
assert.ok(breakdown.rating);
assert.ok(breakdown.penalties);
assert.ok(Array.isArray(breakdown.events));

console.log("PaceCar Trust Score Scoring Engine unit and integration tests passed.");
