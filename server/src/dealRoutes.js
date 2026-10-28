import { rateLimit } from "express-rate-limit";
import {
  COMMISSION_BASIS,
  COMMISSION_ELIGIBLE_STATUSES,
  COMMISSION_POLICY_VERSION,
  COMMISSION_ROUNDING,
  COMMISSION_TIERS,
  TERMS_STATUS,
  TERMS_VERSION,
  commissionFor,
  commissionTrialEnabled,
} from "./policy.js";

const MAX_MONEY = 1_000_000_000;
const REVISABLE_STATUSES = ["Pending", "Accepted", "Deposit Required"];
const REFUND_STATUSES = ["Check-out Review", "Completed", "Dispute"];
const REPORT_TYPES = ["price_mismatch", "listing_violation", "platform_issue"];
const REPORT_STATUSES = ["Open", "Reviewing", "Resolved", "Dismissed"];

const money = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY
    ? value
    : null;
const text = (value, min, max) => {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean.length >= min && clean.length <= max ? clean : null;
};
const calendarDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

export const hasPendingPriceRevision = (booking) =>
  (booking.priceRevisions || []).some((item) => item.status === "Proposed");

export function registerDealRoutes(app, { read, write, find, requireRole, canAccessBooking, nextId }) {
  const now = () => new Date().toISOString();
  const audit = (d, entity, entityId, action, actorId, detail) =>
    d.auditLogs.push({
      id: nextId(d.auditLogs),
      entity,
      entityId,
      action,
      actorId,
      detail,
      createdAt: now(),
    });
  const notify = (d, userId, title, message, type = "booking") =>
    d.notifications.push({
      id: nextId(d.notifications),
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: now(),
    });
  const fail = (res, status, message) => res.status(status).json({ message });
  const reportLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Bạn gửi phản ánh quá nhanh, vui lòng thử lại sau" },
  });
  const requireCommissionFlag = (req, res, next) =>
    commissionTrialEnabled()
      ? next()
      : fail(res, 403, "Tính năng tính thử hoa hồng đang tắt");
  const ownBooking = (d, req, res, roles) => {
    const booking = find(d.bookings, req.params.id);
    if (!booking) return fail(res, 404, "Không tìm thấy booking"), null;
    if (!roles.includes(req.authUser.role) || !canAccessBooking(req.authUser, booking))
      return fail(res, 403, "Bạn không có quyền với booking này"), null;
    return booking;
  };

  app.get("/api/legal/terms-version", (req, res) =>
    res.json({ termsVersion: TERMS_VERSION, status: TERMS_STATUS }),
  );

  // Reports (price mismatch, listing violations, platform issues)
  app.post(
    "/api/reports",
    reportLimiter,
    requireRole(["renter", "owner", "admin"]),
    (req, res) => {
      const d = read(),
        type = String(req.body.type || ""),
        message = text(req.body.message, 10, 1000);
      if (!REPORT_TYPES.includes(type))
        return fail(res, 400, "Loại phản ánh không hợp lệ");
      if (!message)
        return fail(res, 400, "Nội dung phản ánh cần từ 10 đến 1000 ký tự");
      let carId = null,
        bookingId = null;
      if (req.body.carId != null) {
        const car = find(d.cars, req.body.carId);
        if (!car) return fail(res, 404, "Không tìm thấy xe");
        carId = car.id;
      }
      if (req.body.bookingId != null) {
        const booking = find(d.bookings, req.body.bookingId);
        if (!booking || !canAccessBooking(req.authUser, booking))
          return fail(res, 403, "Bạn không có quyền phản ánh booking này");
        bookingId = booking.id;
        carId ??= booking.carId;
      }
      const report = {
        id: nextId(d.reports),
        reporterId: req.authUser.id,
        type,
        carId,
        bookingId,
        message,
        status: "Open",
        createdAt: now(),
      };
      d.reports.push(report);
      audit(d, "report", report.id, "CREATED", req.authUser.id, type);
      write(d);
      res.status(201).json(report);
    },
  );
  app.get("/api/admin/reports", requireRole(["admin"]), (req, res) =>
    res.json([...read().reports].reverse()),
  );
  app.put("/api/admin/reports/:id", requireRole(["admin"]), (req, res) => {
    const d = read(),
      report = find(d.reports, req.params.id);
    if (!report) return fail(res, 404, "Không tìm thấy phản ánh");
    if (!REPORT_STATUSES.includes(req.body.status))
      return fail(res, 400, "Trạng thái phản ánh không hợp lệ");
    const previous = report.status;
    report.status = req.body.status;
    report.updatedAt = now();
    report.updatedBy = req.authUser.id;
    audit(d, "report", report.id, "STATUS_CHANGED", req.authUser.id, `${previous} → ${report.status}`);
    write(d);
    res.json(report);
  });

  app.get("/api/admin/terms-consents", requireRole(["admin"]), (req, res) =>
    res.json([...read().termsConsents].reverse()),
  );

  // Price confirmation (form A): owner proposes, renter confirms; history kept.
  app.post(
    "/api/bookings/:id/price-revisions",
    requireRole(["owner"]),
    (req, res) => {
      const d = read(),
        booking = ownBooking(d, req, res, ["owner"]);
      if (!booking) return;
      if (!REVISABLE_STATUSES.includes(booking.status) || booking.paymentStatus === "Paid")
        return fail(res, 409, "Chỉ điều chỉnh báo giá trước khi người thuê đặt cọc");
      const snap = booking.pricingSnapshot;
      if (!snap || !Number.isSafeInteger(booking.totalPrice))
        return fail(res, 422, "Booking cũ chưa có báo giá chi tiết để điều chỉnh");
      const reason = text(req.body.reason, 5, 500);
      if (!reason) return fail(res, 400, "Cần nêu lý do điều chỉnh (5–500 ký tự)");
      const current = {
        totalPrice: booking.totalPrice,
        deposit: booking.deposit,
        deliveryFee: snap.deliveryFee || 0,
        otherFee: snap.otherFee || 0,
        otherFeeLabel: snap.otherFeeLabel || null,
        ownerDiscount: snap.ownerDiscount || 0,
      };
      const next = { ...current };
      for (const field of ["deliveryFee", "otherFee", "ownerDiscount", "deposit"]) {
        if (req.body[field] === undefined) continue;
        const value = money(req.body[field]);
        if (value === null) return fail(res, 400, "Số tiền không hợp lệ");
        next[field] = value;
      }
      if (req.body.otherFeeLabel !== undefined)
        next.otherFeeLabel = text(req.body.otherFeeLabel, 1, 80);
      if (next.otherFee > 0 && !next.otherFeeLabel)
        return fail(res, 400, "Cần ghi rõ tên khoản phí khác (tối đa 80 ký tự)");
      if (next.otherFee === 0) next.otherFeeLabel = null;
      if (next.deliveryFee > 0 && booking.pickupOption !== "delivery")
        return fail(res, 422, "Booking này không có giao xe tận nơi");
      next.totalPrice = Math.max(
        0,
        current.totalPrice -
          current.deliveryFee +
          next.deliveryFee -
          current.otherFee +
          next.otherFee +
          current.ownerDiscount -
          next.ownerDiscount,
      );
      if (
        ["totalPrice", "deposit", "deliveryFee", "otherFee", "ownerDiscount"].every(
          (field) => next[field] === current[field],
        ) &&
        next.otherFeeLabel === current.otherFeeLabel
      )
        return fail(res, 422, "Báo giá mới không có thay đổi");
      booking.priceRevisions ||= [];
      for (const item of booking.priceRevisions)
        if (item.status === "Proposed") {
          item.status = "Superseded";
          item.respondedAt = now();
        }
      const revision = {
        id: booking.priceRevisions.length + 1,
        status: "Proposed",
        reason,
        proposedBy: req.authUser.id,
        proposedAt: now(),
        previous: current,
        proposed: next,
      };
      booking.priceRevisions.push(revision);
      audit(d, "booking", booking.id, "PRICE_REVISION_PROPOSED", req.authUser.id, `#${revision.id}`);
      notify(
        d,
        booking.renterId,
        "Chủ xe cập nhật báo giá",
        `Booking #PC${booking.id} có báo giá mới cần bạn xác nhận trước khi đặt cọc hoặc ký hợp đồng.`,
      );
      write(d);
      res.status(201).json(revision);
    },
  );
  app.put(
    "/api/bookings/:id/price-revisions/:revisionId",
    requireRole(["renter"]),
    (req, res) => {
      const d = read(),
        booking = ownBooking(d, req, res, ["renter"]);
      if (!booking) return;
      const revision = (booking.priceRevisions || []).find(
        (item) => item.id === Number(req.params.revisionId),
      );
      if (!revision) return fail(res, 404, "Không tìm thấy báo giá");
      if (!["accept", "reject"].includes(req.body.decision))
        return fail(res, 400, "Quyết định không hợp lệ");
      if (revision.status !== "Proposed")
        return fail(res, 409, "Báo giá này không còn chờ xác nhận");
      if (!REVISABLE_STATUSES.includes(booking.status) || booking.paymentStatus === "Paid")
        return fail(res, 409, "Booking không còn ở bước xác nhận giá");
      revision.respondedBy = req.authUser.id;
      revision.respondedAt = now();
      if (req.body.decision === "accept") {
        const { totalPrice, deposit, ...lines } = revision.proposed;
        revision.status = "Accepted";
        booking.totalPrice = totalPrice;
        booking.deposit = deposit;
        booking.pricingSnapshot = {
          ...booking.pricingSnapshot,
          ...lines,
          deposit,
          totalPrice,
        };
      } else revision.status = "Rejected";
      audit(
        d,
        "booking",
        booking.id,
        revision.status === "Accepted" ? "PRICE_REVISION_ACCEPTED" : "PRICE_REVISION_REJECTED",
        req.authUser.id,
        `#${revision.id}`,
      );
      notify(
        d,
        booking.ownerId,
        revision.status === "Accepted" ? "Người thuê đã xác nhận báo giá" : "Người thuê từ chối báo giá",
        `Booking #PC${booking.id}: báo giá #${revision.id} ${revision.status === "Accepted" ? "đã được xác nhận" : "bị từ chối"}.`,
      );
      write(d);
      res.json(revision);
    },
  );

  // Deposit refund record (form C). Records agreement only; PaceCar moves no money.
  app.post(
    "/api/bookings/:id/deposit-refund",
    requireRole(["owner"]),
    (req, res) => {
      const d = read(),
        booking = ownBooking(d, req, res, ["owner"]);
      if (!booking) return;
      if (!REFUND_STATUSES.includes(booking.status))
        return fail(res, 409, "Chỉ lập biên bản hoàn cọc sau khi trả xe");
      if (booking.paymentStatus !== "Paid")
        return fail(res, 409, "Booking chưa ghi nhận tiền cọc");
      if (booking.depositRefund?.status === "Confirmed")
        return fail(res, 409, "Biên bản hoàn cọc đã được hai bên xác nhận");
      const refundAmount = money(req.body.refundAmount),
        deductionAmount = money(req.body.deductionAmount);
      if (refundAmount === null || deductionAmount === null)
        return fail(res, 400, "Số tiền hoàn hoặc khấu trừ không hợp lệ");
      if (refundAmount + deductionAmount !== booking.deposit)
        return fail(res, 422, "Tiền hoàn cộng khấu trừ phải bằng tiền cọc ban đầu");
      const reason = deductionAmount > 0 ? text(req.body.reason, 5, 500) : null;
      if (deductionAmount > 0 && !reason)
        return fail(res, 400, "Khoản khấu trừ cần có lý do (5–500 ký tự)");
      if (req.body.refundDate != null && !calendarDate(req.body.refundDate))
        return fail(res, 400, "Ngày hoàn cọc không hợp lệ");
      const method = req.body.method == null ? null : text(req.body.method, 1, 80);
      if (req.body.method != null && !method)
        return fail(res, 400, "Phương thức hoàn cọc không hợp lệ");
      booking.depositRefundHistory ||= [];
      if (booking.depositRefund) booking.depositRefundHistory.push(booking.depositRefund);
      booking.depositRefund = {
        id: booking.depositRefundHistory.length + 1,
        status: "Proposed",
        depositAmount: booking.deposit,
        refundAmount,
        deductionAmount,
        reason,
        refundDate: req.body.refundDate || null,
        method,
        proposedBy: req.authUser.id,
        proposedAt: now(),
      };
      audit(d, "booking", booking.id, "DEPOSIT_REFUND_PROPOSED", req.authUser.id, `${refundAmount}/${deductionAmount}`);
      notify(d, booking.renterId, "Biên bản hoàn cọc chờ xác nhận", `Booking #PC${booking.id} có biên bản hoàn cọc cần bạn xác nhận.`, "payment");
      write(d);
      res.status(201).json(booking.depositRefund);
    },
  );
  app.put(
    "/api/bookings/:id/deposit-refund",
    requireRole(["renter"]),
    (req, res) => {
      const d = read(),
        booking = ownBooking(d, req, res, ["renter"]);
      if (!booking) return;
      const record = booking.depositRefund;
      if (!record) return fail(res, 404, "Chưa có biên bản hoàn cọc");
      if (!["confirm", "dispute"].includes(req.body.decision))
        return fail(res, 400, "Quyết định không hợp lệ");
      if (record.status !== "Proposed")
        return fail(res, 409, "Biên bản này không còn chờ xác nhận");
      const note = req.body.note == null ? null : text(req.body.note, 1, 500);
      if (req.body.decision === "dispute" && !note)
        return fail(res, 400, "Cần ghi rõ khoản không đồng ý (tối đa 500 ký tự)");
      record.status = req.body.decision === "confirm" ? "Confirmed" : "Disputed";
      record.renterNote = note;
      record.respondedBy = req.authUser.id;
      record.respondedAt = now();
      audit(d, "booking", booking.id, `DEPOSIT_REFUND_${record.status.toUpperCase()}`, req.authUser.id, String(record.id));
      notify(d, booking.ownerId, "Người thuê phản hồi biên bản hoàn cọc", `Booking #PC${booking.id}: biên bản ${record.status === "Confirmed" ? "đã được xác nhận" : "đang có tranh chấp"}.`, "payment");
      write(d);
      res.json(record);
    },
  );

  // Commission trial: dry-run and per-booking record. Never charged to renters,
  // never creates receivables (chargeable is always false while in trial).
  app.get(
    "/api/admin/commission/policy",
    requireRole(["admin"]),
    requireCommissionFlag,
    (req, res) =>
      res.json({
        policyVersion: COMMISSION_POLICY_VERSION,
        status: "proposed-trial",
        basis: COMMISSION_BASIS,
        rounding: COMMISSION_ROUNDING,
        eligibleStatuses: COMMISSION_ELIGIBLE_STATUSES,
        tiers: COMMISSION_TIERS.map((tier) => ({
          minInclusive: tier.minInclusive,
          maxExclusive: Number.isFinite(tier.maxExclusive) ? tier.maxExclusive : null,
          rateBps: tier.rateBps,
        })),
        chargeable: false,
      }),
  );
  app.get(
    "/api/admin/commission/preview",
    requireRole(["admin"]),
    requireCommissionFlag,
    (req, res) => {
      const raw = String(req.query.base ?? "");
      try {
        if (!/^\d{1,13}$/.test(raw)) throw new RangeError();
        res.json(commissionFor(Number(raw)));
      } catch {
        fail(res, 400, "Giá trị cơ sở tính hoa hồng không hợp lệ");
      }
    },
  );
  app.get(
    "/api/admin/commissions",
    requireRole(["admin"]),
    requireCommissionFlag,
    (req, res) => res.json([...read().commissions].reverse()),
  );
  app.post(
    "/api/admin/bookings/:id/commission",
    requireRole(["admin"]),
    requireCommissionFlag,
    (req, res) => {
      const d = read(),
        booking = find(d.bookings, req.params.id);
      if (!booking) return fail(res, 404, "Không tìm thấy booking");
      const existing = d.commissions.find((item) => item.bookingId === booking.id);
      if (existing) return res.json({ ...existing, created: false });
      if (!COMMISSION_ELIGIBLE_STATUSES.includes(booking.status))
        return fail(res, 409, "Booking chưa ở trạng thái đủ điều kiện ghi nhận hoa hồng thử nghiệm");
      if (hasPendingPriceRevision(booking))
        return fail(res, 409, "Booking còn báo giá chờ xác nhận");
      const base = booking.pricingSnapshot?.baseRental;
      let calc;
      try {
        if (!(base > 0)) throw new RangeError();
        calc = commissionFor(base);
      } catch {
        return fail(res, 422, "Booking thiếu dữ liệu giá thuê cơ bản hợp lệ");
      }
      const record = {
        id: nextId(d.commissions),
        bookingId: booking.id,
        ownerId: booking.ownerId,
        status: "trial",
        chargeable: false,
        ...calc,
        createdBy: req.authUser.id,
        createdAt: now(),
      };
      d.commissions.push(record);
      audit(d, "commission", record.id, "TRIAL_RECORDED", req.authUser.id, `booking ${booking.id}: ${record.amount}`);
      write(d);
      res.status(201).json({ ...record, created: true });
    },
  );
}
