import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock3,
  FileText,
  Save,
  Star,
  User,
  Wallet,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { api, date, dateTime, money } from "../services/api";
import {
  Button,
  CarCard,
  DashboardShell,
  EmptyState,
  ErrorState,
  Modal,
  PageHead,
  PageLoading,
  RiskBadge,
  StatusBadge,
  TrustScoreBadge,
  useToast,
} from "../components/UI";

const contractStatuses = new Set([
  "Accepted",
  "Deposit Required",
  "Contract Signed",
  "Ready for Check-in",
  "Ongoing",
  "Check-out Review",
  "Completed",
  "Dispute",
]);
const evidenceStatuses = new Set([
  "Ready for Check-in",
  "Ongoing",
  "Check-out Review",
  "Completed",
  "Dispute",
]);

export function MyBookings() {
  const { user } = useAuth(),
    toast = useToast();
  const [bookings, setBookings] = useState(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [decision, setDecision] = useState(null),
    [reviewing, setReviewing] = useState(null),
    [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" }),
    [reviewingBusy, setReviewingBusy] = useState(false),
    [payingId, setPayingId] = useState(null),
    [reviewedIds, setReviewedIds] = useState(() => new Set());
  const load = () => {
    setError("");
    const key =
      user.role === "owner"
        ? "ownerId"
        : user.role === "renter"
          ? "renterId"
          : "";
    api(
      `/bookings?${key ? `${key}=${user.id}&` : ""}${filter ? `status=${encodeURIComponent(filter)}` : ""}`,
    )
      .then(setBookings)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, [user.id, user.role, filter]);
  async function update() {
    try {
      await api(`/bookings/${decision.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: decision.status, actorId: user.id }),
      });
      toast.success("Đã cập nhật đơn thuê");
      setDecision(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }
  function openReview(booking) {
    setReviewForm({ rating: 5, comment: "" });
    setReviewing(booking);
  }
  async function submitReview() {
    if (!reviewForm.comment.trim()) {
      toast.error("Vui lòng chia sẻ nhận xét về chuyến đi");
      return;
    }
    setReviewingBusy(true);
    try {
      await api("/reviews", {
        method: "POST",
        body: JSON.stringify({
          bookingId: reviewing.id,
          rating: reviewForm.rating,
          comment: reviewForm.comment.trim(),
        }),
      });
      setReviewedIds((current) => new Set(current).add(reviewing.id));
      setReviewing(null);
      toast.success("Cảm ơn bạn đã đánh giá chuyến đi");
    } catch (requestError) {
      const message = requestError.message.toLowerCase();
      const alreadyReviewed =
        requestError.status === 409 &&
        (message.includes("đã được đánh giá") ||
          message.includes("already reviewed"));
      if (alreadyReviewed) {
        setReviewedIds((current) => new Set(current).add(reviewing.id));
        setReviewing(null);
        toast.success("Chuyến đi này đã được đánh giá trước đó");
      } else {
        toast.error(requestError.message);
      }
    } finally {
      setReviewingBusy(false);
    }
  }
  async function payDeposit(booking) {
    setPayingId(booking.id);
    try {
      await api(`/bookings/${booking.id}/payment`, {
        method: "POST",
        body: JSON.stringify({ method: "demo" }),
      });
      toast.success("Đã ghi nhận thanh toán tiền cọc");
      load();
    } catch (paymentError) {
      toast.error(paymentError.message);
    } finally {
      setPayingId(null);
    }
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!bookings) return <PageLoading />;
  const actions = (b) =>
    user.role === "owner" && b.status === "Pending" ? (
      <>
        <Button onClick={() => setDecision({ id: b.id, status: "Accepted" })}>
          Chấp nhận
        </Button>
        <Button
          variant="danger"
          onClick={() => setDecision({ id: b.id, status: "Rejected" })}
        >
          Từ chối
        </Button>
      </>
    ) : user.role === "owner" && b.status === "Check-out Review" ? (
      <Button onClick={() => setDecision({ id: b.id, status: "Completed" })}>
        <CheckCircle2 size={16} /> Hoàn tất chuyến
      </Button>
    ) : user.role === "renter" && b.status === "Pending" ? (
      <Button
        variant="danger"
        onClick={() => setDecision({ id: b.id, status: "Rejected" })}
      >
        Hủy yêu cầu
      </Button>
    ) : user.role === "renter" &&
      ["Accepted", "Deposit Required"].includes(b.status) &&
      b.paymentStatus !== "Paid" ? (
      <Button disabled={payingId === b.id} onClick={() => payDeposit(b)}>
        <Wallet size={16} />
        {payingId === b.id ? "Đang xử lý..." : "Thanh toán cọc"}
      </Button>
    ) : null;
  return (
    <DashboardShell role={user.role}>
      <PageHead
        eyebrow="Quản lý giao dịch"
        title="Đơn thuê xe"
        desc="Theo dõi trạng thái và thực hiện các bước tiếp theo của mỗi chuyến đi."
      />
      <div className="card mb-5 flex flex-wrap gap-2 p-3">
        {[
          "",
          "Pending",
          "Accepted",
          "Ongoing",
          "Completed",
          "Rejected",
          "Expired",
          "Dispute",
        ].map((x) => (
          <button
            type="button"
            onClick={() => setFilter(x)}
            aria-pressed={filter === x}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${filter === x ? "bg-brand-600 text-white" : "hover:bg-slate-100"}`}
            key={x}
          >
            {x || "Tất cả"}
          </button>
        ))}
      </div>
      <div className="card p-5">
        {bookings.length ? (
          bookings.map((b) => (
            <article
              className="grid gap-4 border-b py-5 last:border-0 md:grid-cols-[120px_1fr_auto] md:items-center"
              key={b.id}
            >
              <img
                src={b.car?.imageUrl}
                alt={b.car?.name ? `Xe ${b.car.name}` : `Xe của đơn #${b.id}`}
                loading="lazy"
                className="h-20 w-28 rounded-xl object-cover"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <b>
                    #{b.id} · {b.car?.name}
                  </b>
                  <StatusBadge status={b.status} />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  <CalendarDays className="mr-1 inline" size={15} />
                  {dateTime(b.startDate)} – {dateTime(b.endDate)} ·{" "}
                  {money(b.totalPrice)}
                </p>
                {b.destination && (
                  <p className="mt-1 text-sm text-slate-500">
                    Điểm đến dự kiến: {b.destination}
                  </p>
                )}
                {b.paymentStatus === "Paid" && (
                  <p className="mt-1 text-xs font-bold text-emerald-600">
                    ✓ Đã thanh toán tiền cọc
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {user.role === "owner" && (
                    <>
                      <TrustScoreBadge score={b.renter?.trustScore} />
                      <RiskBadge level={b.riskLevel} />
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {actions(b)}
                {contractStatuses.has(b.status) && (
                  <Button
                    as={Link}
                    to={`/contract/${b.id}`}
                    variant="outline"
                  >
                    Hợp đồng
                  </Button>
                )}
                {evidenceStatuses.has(b.status) && (
                  <Button
                    as={Link}
                    to={`/evidence/${b.id}`}
                    variant="outline"
                  >
                    Giao nhận
                  </Button>
                )}
                {user.role === "renter" &&
                  b.status === "Completed" &&
                  !reviewedIds.has(b.id) && (
                    <Button variant="secondary" onClick={() => openReview(b)}>
                      <Star size={16} /> Đánh giá
                    </Button>
                  )}
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            icon={Car}
            title="Không có đơn phù hợp"
            desc="Thử chọn một trạng thái khác."
          />
        )}
      </div>
      <Modal
        open={!!decision}
        title="Xác nhận cập nhật"
        onClose={() => setDecision(null)}
        actions={
          <>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Quay lại
            </Button>
            <Button onClick={update}>Xác nhận</Button>
          </>
        }
      >
        Trạng thái đơn #{decision?.id} sẽ chuyển thành <b>{decision?.status}</b>{" "}
        và được ghi vào audit log.
      </Modal>
      <Modal
        open={!!reviewing}
        title={`Đánh giá chuyến đi #${reviewing?.id || ""}`}
        onClose={() => !reviewingBusy && setReviewing(null)}
        actions={
          <>
            <Button
              variant="outline"
              disabled={reviewingBusy}
              onClick={() => setReviewing(null)}
            >
              Để sau
            </Button>
            <Button disabled={reviewingBusy} onClick={submitReview}>
              {reviewingBusy ? "Đang gửi..." : "Gửi đánh giá"}
            </Button>
          </>
        }
      >
        <fieldset disabled={reviewingBusy}>
          <legend className="label">Mức độ hài lòng</legend>
          <div
            className="flex gap-2"
            role="group"
            aria-label="Chọn số sao đánh giá"
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                type="button"
                key={rating}
                onClick={() => setReviewForm({ ...reviewForm, rating })}
                aria-label={`${rating} sao`}
                aria-pressed={reviewForm.rating === rating}
                className={`grid h-10 w-10 place-items-center rounded-lg border ${rating <= reviewForm.rating ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 text-slate-300"}`}
              >
                <Star size={20} className="fill-current" />
              </button>
            ))}
          </div>
          <label className="label mt-5" htmlFor="booking-review-comment">
            Nhận xét chuyến đi
          </label>
          <textarea
            id="booking-review-comment"
            className="input"
            rows="4"
            maxLength="2000"
            required
            value={reviewForm.comment}
            onChange={(event) =>
              setReviewForm({ ...reviewForm, comment: event.target.value })
            }
            placeholder="Tình trạng xe, chủ xe và trải nghiệm nhận trả xe..."
          />
          <p className="mt-1 text-right text-xs text-slate-400">
            {reviewForm.comment.length}/2000
          </p>
        </fieldset>
      </Modal>
    </DashboardShell>
  );
}

export function Profile() {
  const { user, login } = useAuth(),
    toast = useToast();
  const [data, setData] = useState(null),
    [form, setForm] = useState({ name: "", phone: "" }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const load = () => {
    setError("");
    api(`/users/${user.id}`)
      .then((u) => {
        setData(u);
        setForm({ name: u.name, phone: u.phone || "" });
      })
      .catch((requestError) => setError(requestError.message));
  };
  useEffect(() => {
    load();
  }, [user.id]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PageLoading />;
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      login(updated);
      setData(updated);
      toast.success("Đã lưu hồ sơ");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <DashboardShell role={user.role}>
      <PageHead
        eyebrow="Tài khoản"
        title="Hồ sơ cá nhân"
        desc="Thông tin này được sử dụng trong booking và hợp đồng số."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-brand-100 text-3xl font-bold text-brand-700">
            {data.name?.[0] || "?"}
          </div>
          <h2 className="mt-4 text-xl font-bold">{data.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{data.email}</p>
          <div className="mt-4 flex justify-center">
            <TrustScoreBadge score={data.trustScore} large />
          </div>
          <p className="mt-4 text-xs text-emerald-600">
            ✓ Hồ sơ {data.verified ? "đã xác thực" : "đang chờ xác thực"}
          </p>
        </div>
        <form onSubmit={save} className="card space-y-5 p-6 lg:col-span-2">
          <h2 className="text-xl font-bold">Thông tin liên hệ</h2>
          <div>
            <label className="label" htmlFor="profile-name">
              Họ và tên
            </label>
            <input
              id="profile-name"
              className="input"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="profile-phone">
              Số điện thoại
            </label>
            <input
              id="profile-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="profile-email">
              Email
            </label>
            <input
              id="profile-email"
              className="input bg-slate-50"
              type="email"
              value={data.email}
              disabled
            />
          </div>
          <Button disabled={saving}>
            <Save size={17} /> {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </form>
      </div>
    </DashboardShell>
  );
}

export function RiskAlerts() {
  const { user } = useAuth(),
    toast = useToast();
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [resolvingId, setResolvingId] = useState(null);
  const load = () => {
    setError("");
    return api(
      `/risk-alerts${user.role === "owner" ? `?ownerId=${user.id}` : ""}`,
    )
      .then(setItems)
      .catch((requestError) => setError(requestError.message));
  };
  useEffect(() => {
    load();
  }, [user.id]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <PageLoading />;
  async function resolve(id) {
    setResolvingId(id);
    try {
      const targetStatus = user.role === "owner" ? "Acknowledged" : "Resolved";
      await api(`/risk-alerts/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: targetStatus }),
      });
      toast.success(
        user.role === "owner"
          ? "Đã xác nhận xem cảnh báo"
          : "Đã xử lý cảnh báo",
      );
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setResolvingId(null);
    }
  }
  return (
    <DashboardShell role={user.role}>
      <PageHead
        eyebrow="Risk Control"
        title="Cảnh báo rủi ro"
        desc="Theo dõi GPS, hồ sơ người thuê và các chuyến có dấu hiệu bất thường."
      />
      <div className="card p-5">
        {items.length ? (
          items.map((a) => (
            <div
              className="flex flex-col gap-4 border-b py-5 last:border-0 sm:flex-row sm:items-center"
              key={a.id}
            >
              <span
                className={`grid h-12 w-12 place-items-center rounded-xl ${a.severity === "High" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}
              >
                <AlertTriangle />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <b>{a.type}</b>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {a.message} · {date(a.createdAt)}
                </p>
              </div>
              {a.status !== "Resolved" &&
                !(user.role === "owner" && a.status === "Acknowledged") && (
                  <Button
                    variant="outline"
                    disabled={resolvingId === a.id}
                    onClick={() => resolve(a.id)}
                  >
                    <CheckCircle2 size={17} />
                    {user.role === "owner"
                      ? "Xác nhận đã xem"
                      : "Đánh dấu đã xử lý"}
                  </Button>
                )}
            </div>
          ))
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="Không có cảnh báo"
            desc="Mọi hoạt động hiện trong mức an toàn."
          />
        )}
      </div>
    </DashboardShell>
  );
}

export function FavoritesPage() {
  const { user } = useAuth(),
    toast = useToast();
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [removingId, setRemovingId] = useState(null);
  const load = () => {
    setError("");
    return api("/favorites")
      .then(setItems)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <PageLoading />;
  async function removeFavorite(car) {
    setRemovingId(car.id);
    try {
      await api(`/favorites/${car.id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== car.id));
      toast.success("Đã bỏ xe khỏi danh sách yêu thích");
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setRemovingId(null);
    }
  }
  return (
    <DashboardShell role={user.role}>
      <PageHead
        eyebrow="Bộ sưu tập của bạn"
        title="Xe yêu thích"
        desc="Lưu lại những chiếc xe phù hợp để so sánh và đặt nhanh cho chuyến đi tiếp theo."
      />
      {items.length ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              onRemoveFavorite={removeFavorite}
              removing={removingId === car.id}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={Car}
            title="Chưa lưu xe nào"
            desc="Nhấn biểu tượng trái tim trên trang tìm xe để lưu lại."
          />
        </div>
      )}
    </DashboardShell>
  );
}
