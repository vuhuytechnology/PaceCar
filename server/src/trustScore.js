/**
 * PaceCar Trust Score & Risk Level Scoring Engine
 * Rule-based, transparent, event-driven scoring engine for Renters and Owners.
 */

export const BASE_TRUST_SCORE = 50;
export const MIN_TRUST_SCORE = 0;
export const MAX_TRUST_SCORE = 100;

export const RISK_LEVELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const EVENT_TYPES = {
  VERIFY_EMAIL: "VERIFY_EMAIL",
  VERIFY_PHONE: "VERIFY_PHONE",
  VERIFY_IDENTITY: "VERIFY_IDENTITY",
  VERIFY_LICENSE: "VERIFY_LICENSE",
  VERIFY_BANK: "VERIFY_BANK",
  CAR_APPROVED: "CAR_APPROVED",
  PROFILE_COMPLETED: "PROFILE_COMPLETED",
  TRIP_COMPLETED: "TRIP_COMPLETED",
  ORDER_COMPLETED: "ORDER_COMPLETED",
  DEPOSIT_ON_TIME: "DEPOSIT_ON_TIME",
  EVIDENCE_COMPLETE: "EVIDENCE_COMPLETE",
  ON_TIME_RETURN: "ON_TIME_RETURN",
  HANDOVER_COMPLETE: "HANDOVER_COMPLETE",
  FLEET_EXPERIENCE: "FLEET_EXPERIENCE",
  HIGH_RATING_BONUS: "HIGH_RATING_BONUS",
  BAYESIAN_RATING_UPDATE: "BAYESIAN_RATING_UPDATE",
  DISPUTE_FAULT: "DISPUTE_FAULT",
  DISPUTE_SETTLED_PEACEFUL: "DISPUTE_SETTLED_PEACEFUL",
  DISPUTE_OPENED_UNVERIFIED: "DISPUTE_OPENED_UNVERIFIED",
  BOOKING_CANCELLED_BY_RENTER: "BOOKING_CANCELLED_BY_RENTER",
  BOOKING_CANCELLED_BY_OWNER: "BOOKING_CANCELLED_BY_OWNER",
  ADMIN_ROLE: "ADMIN_ROLE",
};

export function clampScore(val) {
  return Math.max(MIN_TRUST_SCORE, Math.min(MAX_TRUST_SCORE, Math.round(Number(val) || 0)));
}

/**
 * Derives riskLevel automatically from Trust Score and risk flags
 */
export function deriveRiskLevel(user, trustScore, hasSevereFlag = false) {
  if (hasSevereFlag || user?.isBlocked || user?.hasSevereDispute) {
    return RISK_LEVELS.HIGH;
  }
  if (user?.role === "renter" && !user?.licenseVerified) {
    return trustScore < 50 ? RISK_LEVELS.HIGH : RISK_LEVELS.MEDIUM;
  }
  if (trustScore >= 75 && user?.verified) {
    return RISK_LEVELS.LOW;
  }
  if (trustScore >= 50) {
    return RISK_LEVELS.MEDIUM;
  }
  return RISK_LEVELS.HIGH;
}

/**
 * Calculates Bayesian Adjusted Rating
 * adjusted = (N * avg + 5 * 4.0) / (N + 5)
 */
export function calculateBayesianRatingScore(reviews, fallbackAvg = 4.0, fallbackCount = 0) {
  let count = reviews?.length || 0;
  let avg = count > 0 ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / count : fallbackAvg;
  if (count === 0 && fallbackCount > 0) {
    count = fallbackCount;
  }
  if (count === 0) return 0;
  const adjusted = (count * avg + 5 * 4.0) / (count + 5);
  if (adjusted >= 4.8) return 10;
  if (adjusted >= 4.5) return 7;
  if (adjusted >= 4.0) return 7;
  if (adjusted >= 3.5) return 0;
  if (adjusted >= 3.0) return -5;
  return -10;
}

/**
 * Calculates user trust breakdown and total score
 */
export function getUserTrustBreakdown(db, user) {
  if (!user) return null;

  db.trustScoreEvents ||= [];
  const userEvents = db.trustScoreEvents.filter((e) => e.userId === user.id);

  if (user.role === "admin") {
    return {
      score: 100,
      riskLevel: RISK_LEVELS.LOW,
      baseScore: BASE_TRUST_SCORE,
      verification: {
        total: 25,
        max: 25,
        items: [{ name: "Tài khoản quản trị viên", points: 25, achieved: true }],
      },
      history: {
        total: 25,
        max: 25,
        items: [{ name: "Quyền điều hành hệ thống", points: 25, achieved: true }],
      },
      rating: { points: 0, average: 5.0, reviewCount: 0 },
      penalties: { total: 0, items: [] },
      events: userEvents.slice(-10).reverse(),
    };
  }

  // Verification items
  const vItems = [];
  const emailAchieved = Boolean(
    user.emailVerified || (user.email && user.verified) || userEvents.some((e) => e.eventType === EVENT_TYPES.VERIFY_EMAIL)
  );
  vItems.push({ name: "Xác thực Email", points: 3, achieved: emailAchieved });

  const phoneAchieved = Boolean(
    user.phone || userEvents.some((e) => e.eventType === EVENT_TYPES.VERIFY_PHONE)
  );
  vItems.push({ name: "Số điện thoại chính chủ", points: 3, achieved: phoneAchieved });

  const cccdAchieved = Boolean(
    user.verified || userEvents.some((e) => e.eventType === EVENT_TYPES.VERIFY_IDENTITY)
  );
  vItems.push({ name: "Xác thực danh tính (CCCD)", points: 7, achieved: cccdAchieved });

  if (user.role === "renter") {
    const licenseAchieved = Boolean(
      user.licenseVerified ?? (user.verified || userEvents.some((e) => e.eventType === EVENT_TYPES.VERIFY_LICENSE))
    );
    vItems.push({ name: "Xác thực Giấy phép lái xe", points: 7, achieved: licenseAchieved });

    const profileAchieved = Boolean(
      (user.name && user.phone && user.verified) || userEvents.some((e) => e.eventType === EVENT_TYPES.PROFILE_COMPLETED)
    );
    vItems.push({ name: "Hồ sơ người thuê hoàn thiện", points: 5, achieved: profileAchieved });
  } else if (user.role === "owner") {
    const bankAchieved = Boolean(
      user.bankAccountVerified ||
      db.paymentAccounts?.some((p) => p.ownerId === user.id && p.accountNumber) ||
      userEvents.some((e) => e.eventType === EVENT_TYPES.VERIFY_BANK) ||
      user.verified
    );
    vItems.push({ name: "Tài khoản nhận tiền chính chủ", points: 5, achieved: bankAchieved });

    const carApprovedAchieved = Boolean(
      user.hasApprovedCar ||
      db.cars?.some((c) => c.ownerId === user.id && c.listingStatus === "Published" && c.verified) ||
      userEvents.some((e) => e.eventType === EVENT_TYPES.CAR_APPROVED)
    );
    vItems.push({ name: "Có xe đã kiểm định và phê duyệt", points: 5, achieved: carApprovedAchieved });

    const profileAchieved = Boolean(
      (user.name && user.phone) || userEvents.some((e) => e.eventType === EVENT_TYPES.PROFILE_COMPLETED)
    );
    vItems.push({ name: "Hồ sơ chủ xe đầy đủ", points: 2, achieved: profileAchieved });
  }

  const verifTotal = Math.min(
    25,
    vItems.reduce((acc, cur) => acc + (cur.achieved ? cur.points : 0), 0)
  );

  // History items
  const hItems = [];
  let histTotal = 0;

  if (user.role === "renter") {
    const completedTrips = db.bookings?.filter(
      (b) => b.renterId === user.id && b.status === "Completed"
    ) || [];
    const tripEvents = userEvents.filter((e) => e.eventType === EVENT_TYPES.TRIP_COMPLETED);

    const tripCount = Math.max(completedTrips.length, tripEvents.length);
    if (tripCount > 0) {
      const tripPoints = 5 + (tripCount - 1) * 2;
      hItems.push({ name: "Hoàn thành chuyến đi an toàn", points: tripPoints, achieved: true });

      const onTimeDeposits = Math.max(
        completedTrips.filter((b) => b.paymentStatus === "Paid").length,
        userEvents.filter((e) => e.eventType === EVENT_TYPES.DEPOSIT_ON_TIME).length
      );
      if (onTimeDeposits > 0) {
        hItems.push({ name: "Thanh toán cọc đúng hạn", points: onTimeDeposits, achieved: true });
      }

      const completeEvidences = Math.max(
        completedTrips.filter((b) => {
          const ev = db.evidence?.find((e) => e.bookingId === b.id);
          return ev && ev.status === "Complete";
        }).length,
        userEvents.filter((e) => e.eventType === EVENT_TYPES.EVIDENCE_COMPLETE).length
      );
      if (completeEvidences > 0) {
        hItems.push({ name: "Biên bản giao nhận đầy đủ ảnh/ODO/xăng", points: completeEvidences, achieved: true });
      }

      const onTimeReturns = Math.max(
        completedTrips.length,
        userEvents.filter((e) => e.eventType === EVENT_TYPES.ON_TIME_RETURN).length
      );
      if (onTimeReturns > 0) {
        hItems.push({ name: "Trả xe đúng giờ hẹn", points: onTimeReturns, achieved: true });
      }
    }
  } else if (user.role === "owner") {
    const completedOrders = db.bookings?.filter(
      (b) => b.ownerId === user.id && b.status === "Completed"
    ) || [];
    const orderEvents = userEvents.filter((e) => e.eventType === EVENT_TYPES.ORDER_COMPLETED);
    const orderCount = Math.max(completedOrders.length, orderEvents.length);

    if (orderCount > 0) {
      const orderPoints = 5 + (orderCount - 1) * 2;
      hItems.push({ name: "Đơn thuê xe hoàn thành", points: orderPoints, achieved: true });

      const handovers = Math.max(
        completedOrders.length,
        userEvents.filter((e) => e.eventType === EVENT_TYPES.HANDOVER_COMPLETE).length
      );
      if (handovers > 0) {
        hItems.push({ name: "Biên bản bàn giao đúng quy trình", points: handovers, achieved: true });
      }
    }

    const fleetEvent = userEvents.find((e) => e.eventType === EVENT_TYPES.FLEET_EXPERIENCE);
    if (fleetEvent) {
      hItems.push({ name: "Kinh nghiệm vận hành đội xe", points: fleetEvent.delta, achieved: true });
    }
  }

  histTotal = Math.min(
    25,
    hItems.reduce((acc, cur) => acc + (cur.achieved ? cur.points : 0), 0)
  );

  // Rating & Quality items
  let ratingPoints = 0;
  let reviewAvg = 0;
  let reviewCount = 0;

  if (user.role === "owner") {
    const ownerCarIds = new Set((db.cars || []).filter((c) => c.ownerId === user.id).map((c) => c.id));
    const ownerReviews = (db.reviews || []).filter((r) => ownerCarIds.has(r.carId));
    reviewCount = ownerReviews.length;
    if (reviewCount > 0) {
      reviewAvg = Number((ownerReviews.reduce((s, r) => s + r.rating, 0) / reviewCount).toFixed(1));
      ratingPoints = calculateBayesianRatingScore(ownerReviews);
    } else {
      const carsWithRating = (db.cars || []).filter((c) => c.ownerId === user.id && c.rating > 0);
      if (carsWithRating.length > 0) {
        reviewAvg = Number((carsWithRating.reduce((s, c) => s + c.rating, 0) / carsWithRating.length).toFixed(1));
        ratingPoints = calculateBayesianRatingScore([], reviewAvg, carsWithRating.length * 3);
      }
    }
    const ratingEvent = userEvents.find((e) => e.eventType === EVENT_TYPES.BAYESIAN_RATING_UPDATE);
    if (ratingEvent && ratingPoints === 0) {
      ratingPoints = ratingEvent.delta;
    }
  } else if (user.role === "renter") {
    const ratingBonusEvent = userEvents.find((e) => e.eventType === EVENT_TYPES.HIGH_RATING_BONUS);
    if (ratingBonusEvent) {
      ratingPoints = ratingBonusEvent.delta;
    } else {
      const renterReviews = (db.reviews || []).filter((r) => r.renterId === user.id);
      if (renterReviews.some((r) => r.rating === 5) && user.verified) {
        ratingPoints = 10;
      } else if (renterReviews.some((r) => r.rating >= 4) && user.verified) {
        ratingPoints = 5;
      }
    }
  }

  // Penalties
  const pItems = [];
  const userDisputes = (db.disputes || []).filter((disp) => {
    const b = db.bookings?.find((bk) => bk.id === disp.bookingId);
    return b && (user.role === "renter" ? b.renterId === user.id : b.ownerId === user.id);
  });

  for (const disp of userDisputes) {
    if (disp.status === "Resolved") {
      const isSevere = disp.severity === "severe" || /nghiêm trọng/i.test(disp.decision || "");
      const isModerate =
        disp.severity === "moderate" ||
        (/khấu trừ|bồi thường/i.test(disp.decision || "") && !/nhiên liệu/i.test(disp.reason || ""));
      if (isSevere) {
        pItems.push({ name: `Tranh chấp #${disp.id} (Lỗi nghiêm trọng)`, points: 30, reason: disp.decision });
      } else if (isModerate) {
        pItems.push({ name: `Tranh chấp #${disp.id} (Lỗi xác nhận)`, points: 10, reason: disp.decision });
      }
    }
  }

  // Active unverified dispute penalty
  if (user.role === "renter" && !user.verified && userDisputes.some((d) => d.status === "Under review")) {
    pItems.push({ name: "Tài khoản chưa xác thực danh tính có tranh chấp đang mở", points: 5 });
  }

  // Event ledger penalty adjustments
  const penaltyEvents = userEvents.filter((e) => e.delta < 0);
  for (const pe of penaltyEvents) {
    if (!pItems.some((p) => p.reason === pe.reason || p.name === pe.reason)) {
      pItems.push({ name: pe.reason || pe.eventType, points: Math.abs(pe.delta) });
    }
  }

  const penaltyTotal = pItems.reduce((s, p) => s + p.points, 0);

  // If the user has explicitly recorded ledger score
  const totalLedgerDelta = userEvents.reduce((s, e) => s + Number(e.delta || 0), 0);
  const ledgerScore = BASE_TRUST_SCORE + totalLedgerDelta;

  const calculatedScore = clampScore(BASE_TRUST_SCORE + verifTotal + histTotal + ratingPoints - penaltyTotal);
  // Reconcile: If ledger events exist, they define the exact cumulative score
  const finalScore = userEvents.length > 0 ? clampScore(ledgerScore) : calculatedScore;

  const hasSevereFlag = Boolean(user.hasSevereDispute || pItems.some((p) => p.points >= 30));
  const riskLevel = deriveRiskLevel(user, finalScore, hasSevereFlag);

  return {
    score: finalScore,
    riskLevel,
    baseScore: BASE_TRUST_SCORE,
    verification: { total: verifTotal, max: 25, items: vItems },
    history: { total: histTotal, max: 25, items: hItems },
    rating: { points: ratingPoints, average: reviewAvg, reviewCount },
    penalties: { total: penaltyTotal, items: pItems },
    events: userEvents.slice(-10).reverse(),
  };
}

/**
 * Appends a new Trust Score event into the ledger with idempotency
 */
export function recordTrustScoreEvent(db, { userId, bookingId = null, eventType, delta, reason }) {
  if (!db || !userId || !eventType) return null;
  db.trustScoreEvents ||= [];

  // Idempotency: Don't award twice for the same booking + eventType + userId
  if (bookingId && eventType) {
    const existing = db.trustScoreEvents.find(
      (e) => e.userId === userId && e.bookingId === bookingId && e.eventType === eventType
    );
    if (existing) return existing;
  }

  const user = db.users?.find((u) => u.id === userId);
  if (!user) return null;

  const scoreBefore = user.trustScore ?? BASE_TRUST_SCORE;
  const scoreAfter = clampScore(scoreBefore + delta);

  const event = {
    id: (db.trustScoreEvents.length > 0 ? Math.max(...db.trustScoreEvents.map((e) => e.id)) + 1 : 1),
    userId,
    bookingId,
    eventType,
    delta,
    scoreBefore,
    scoreAfter,
    reason: reason || eventType,
    createdAt: new Date().toISOString(),
  };

  db.trustScoreEvents.push(event);
  syncUserTrustScore(db, userId);
  return event;
}

/**
 * Synchronizes user trustScore, riskLevel, and trustBreakdown on the user record
 */
export function syncUserTrustScore(db, userId) {
  const user = db.users?.find((u) => u.id === userId);
  if (!user) return null;

  const breakdown = getUserTrustBreakdown(db, user);
  if (!breakdown) return null;

  user.trustScore = breakdown.score;
  user.riskLevel = breakdown.riskLevel;
  user.trustBreakdown = breakdown;
  return user;
}

/**
 * Synchronizes all users in the database
 */
export function syncAllUsersTrustScores(db) {
  if (!db || !Array.isArray(db.users)) return;
  for (const user of db.users) {
    syncUserTrustScore(db, user.id);
  }
}

/**
 * Trigger: When a booking is marked Completed
 */
export function onTripCompleted(db, booking) {
  if (!booking) return;

  // 1. Renter rewards
  const completedRenterTrips = (db.bookings || []).filter(
    (b) => b.renterId === booking.renterId && b.status === "Completed"
  );
  const renterDelta = completedRenterTrips.length <= 1 ? 5 : 2;

  recordTrustScoreEvent(db, {
    userId: booking.renterId,
    bookingId: booking.id,
    eventType: EVENT_TYPES.TRIP_COMPLETED,
    delta: renterDelta,
    reason: `Hoàn thành chuyến đi #PC${booking.id}`,
  });

  if (booking.paymentStatus === "Paid") {
    recordTrustScoreEvent(db, {
      userId: booking.renterId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.DEPOSIT_ON_TIME,
      delta: 1,
      reason: `Thanh toán đúng hạn cho booking #PC${booking.id}`,
    });
  }

  const ev = (db.evidence || []).find((e) => e.bookingId === booking.id);
  if (ev && ev.status === "Complete") {
    recordTrustScoreEvent(db, {
      userId: booking.renterId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.EVIDENCE_COMPLETE,
      delta: 1,
      reason: `Hoàn tất biên bản check-in/out đủ ảnh và ODO cho #PC${booking.id}`,
    });
  }

  recordTrustScoreEvent(db, {
    userId: booking.renterId,
    bookingId: booking.id,
    eventType: EVENT_TYPES.ON_TIME_RETURN,
    delta: 1,
    reason: `Trả xe đúng thời gian cho #PC${booking.id}`,
  });

  // 2. Owner rewards
  recordTrustScoreEvent(db, {
    userId: booking.ownerId,
    bookingId: booking.id,
    eventType: EVENT_TYPES.ORDER_COMPLETED,
    delta: 2,
    reason: `Hoàn tất phục vụ đơn thuê xe #PC${booking.id}`,
  });

  if (ev && ev.status === "Complete") {
    recordTrustScoreEvent(db, {
      userId: booking.ownerId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.HANDOVER_COMPLETE,
      delta: 1,
      reason: `Bàn giao xe đúng quy trình kiểm định cho #PC${booking.id}`,
    });
  }

  syncUserTrustScore(db, booking.renterId);
  syncUserTrustScore(db, booking.ownerId);
}

/**
 * Trigger: When an Admin resolves a dispute
 */
export function onDisputeResolved(db, dispute, decision, { liableParty = "none", severity = "minor" } = {}) {
  if (!dispute) return;
  const booking = db.bookings?.find((b) => b.id === dispute.bookingId);
  if (!booking) return;

  let targetUserId = null;
  if (liableParty === "renter") targetUserId = booking.renterId;
  else if (liableParty === "owner") targetUserId = booking.ownerId;

  if (targetUserId) {
    let penalty = 10;
    if (severity === "severe") penalty = 30;
    else if (severity === "moderate") penalty = 20;

    recordTrustScoreEvent(db, {
      userId: targetUserId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.DISPUTE_FAULT,
      delta: -penalty,
      reason: `Kết luận tranh chấp #${dispute.id} (${severity}): ${decision || "Có lỗi được xác định"}`,
    });

    if (severity === "severe") {
      const user = db.users?.find((u) => u.id === targetUserId);
      if (user) user.hasSevereDispute = true;
    }
  } else {
    // Both agreed peacefully
    recordTrustScoreEvent(db, {
      userId: booking.renterId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.DISPUTE_SETTLED_PEACEFUL,
      delta: 0,
      reason: `Tranh chấp #${dispute.id} giải quyết thỏa thuận`,
    });
  }

  syncUserTrustScore(db, booking.renterId);
  syncUserTrustScore(db, booking.ownerId);
}

/**
 * Trigger: When a review is posted
 */
export function onReviewCreated(db, review, car) {
  if (!review || !car) return;
  const ownerId = car.ownerId;
  const owner = db.users?.find((u) => u.id === ownerId);
  if (!owner) return;

  const ownerCarIds = new Set((db.cars || []).filter((c) => c.ownerId === ownerId).map((c) => c.id));
  const ownerReviews = (db.reviews || []).filter((r) => ownerCarIds.has(r.carId));
  const newRatingPoints = calculateBayesianRatingScore(ownerReviews);

  recordTrustScoreEvent(db, {
    userId: ownerId,
    bookingId: review.bookingId,
    eventType: EVENT_TYPES.BAYESIAN_RATING_UPDATE,
    delta: 0, // Recalculated dynamically
    reason: `Đánh giá mới ${review.rating} sao từ người thuê`,
  });

  syncUserTrustScore(db, ownerId);
}

/**
 * Trigger: When a booking is cancelled
 */
export function onBookingCancelled(db, booking, actorRole) {
  if (!booking) return;

  if (actorRole === "renter" && ["Accepted", "Deposit Required", "Paid"].includes(booking.status)) {
    const penalty = booking.paymentStatus === "Paid" ? 10 : 5;
    recordTrustScoreEvent(db, {
      userId: booking.renterId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.BOOKING_CANCELLED_BY_RENTER,
      delta: -penalty,
      reason: `Hủy đơn sau khi đã được xác nhận (booking #PC${booking.id})`,
    });
    syncUserTrustScore(db, booking.renterId);
  } else if (actorRole === "owner" && ["Accepted", "Deposit Required", "Paid"].includes(booking.status)) {
    const penalty = booking.paymentStatus === "Paid" ? 15 : 8;
    recordTrustScoreEvent(db, {
      userId: booking.ownerId,
      bookingId: booking.id,
      eventType: EVENT_TYPES.BOOKING_CANCELLED_BY_OWNER,
      delta: -penalty,
      reason: `Chủ xe hủy đơn sau khi đã chấp nhận (booking #PC${booking.id})`,
    });
    syncUserTrustScore(db, booking.ownerId);
  }
}
