import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthorizedEvidenceImage from "../components/AuthorizedEvidenceImage";
import {
  Button,
  DashboardShell,
  ErrorState,
  PageHead,
  StatusBadge,
  useToast,
} from "../components/UI";
import { api, dateTime } from "../services/api";

const filters = [
  ["unresolved", "Chưa giải quyết"],
  ["Open", "Mới mở"],
  ["Under review", "Đang xem xét"],
  ["Resolved", "Đã giải quyết"],
  ["all", "Tất cả"],
];

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("unresolved");
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([api("/disputes"), api("/bookings")])
      .then(([disputeRows, bookingRows]) => {
        if (!active) return;
        setDisputes(disputeRows);
        setBookings(bookingRows);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function updateStatus(dispute, status) {
    const decision = String(decisions[dispute.id] || "").trim();
    if (status === "Resolved" && !decision) {
      toast("Vui lòng nhập quyết định giải quyết");
      return;
    }
    if (
      status === "Resolved" &&
      !window.confirm(
        "Giải quyết tranh chấp sẽ chuyển đơn thuê sang trạng thái Hoàn tất. Tiếp tục?",
      )
    )
      return;

    setSavingId(dispute.id);
    try {
      await api(`/disputes/${dispute.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, decision }),
      });
      toast(
        status === "Resolved"
          ? "Đã giải quyết tranh chấp"
          : "Đã chuyển tranh chấp sang đang xem xét",
      );
      setDecisions((current) => ({ ...current, [dispute.id]: "" }));
      setReloadKey((value) => value + 1);
    } catch (updateError) {
      toast(updateError.message);
    } finally {
      setSavingId(null);
    }
  }

  const visibleDisputes = disputes
    .filter((dispute) => {
      if (filter === "unresolved") return dispute.status !== "Resolved";
      if (filter === "all") return true;
      return dispute.status === filter;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <DashboardShell role="admin">
      <PageHead
        eyebrow="PaceCar Operations"
        title="Trung tâm tranh chấp"
        desc="Kiểm tra nội dung, ảnh bằng chứng và cập nhật trạng thái xử lý. Khi giải quyết, đơn thuê sẽ được chuyển sang Hoàn tất."
      />
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <div className="card p-8 text-center text-slate-500">
          Đang tải tranh chấp...
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  filter === value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
                {value === "unresolved" && (
                  <span className="ml-2">
                    {
                      disputes.filter((item) => item.status !== "Resolved")
                        .length
                    }
                  </span>
                )}
              </button>
            ))}
          </div>
          {visibleDisputes.length ? (
            <div className="space-y-5">
              {visibleDisputes.map((dispute) => {
                const booking = bookings.find(
                  (item) => item.id === dispute.bookingId,
                );
                const resolved = dispute.status === "Resolved";
                return (
                  <article
                    className="card space-y-5 p-5 sm:p-6"
                    key={dispute.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-brand-700">
                          Tranh chấp #{dispute.id} · Booking #PC
                          {dispute.bookingId}
                        </p>
                        <h2 className="mt-1 text-lg font-bold">
                          {dispute.reason}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Mở lúc {dateTime(dispute.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={dispute.status} />
                    </div>

                    {booking && (
                      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                        <p>
                          Xe: <b>{booking.car?.name || "Không rõ"}</b>
                        </p>
                        <p>
                          Trạng thái đơn: <b>{booking.status}</b>
                        </p>
                        <p>
                          Người thuê: <b>{booking.renter?.name || "—"}</b>
                        </p>
                        <p>
                          Chủ xe: <b>{booking.owner?.name || "—"}</b>
                        </p>
                        <Link
                          to={`/evidence/${booking.id}`}
                          className="font-semibold text-brand-700 hover:underline sm:col-span-2"
                        >
                          Xem hồ sơ giao nhận
                        </Link>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {dispute.description || "Không có mô tả bổ sung."}
                    </p>

                    <section>
                      <h3 className="mb-3 text-sm font-bold">
                        Ảnh bằng chứng ({dispute.evidence?.length || 0})
                      </h3>
                      {dispute.evidence?.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {dispute.evidence.map((assetId, index) => (
                            <AuthorizedEvidenceImage
                              key={assetId}
                              asset={assetId}
                              alt={`Bằng chứng ${index + 1} của tranh chấp ${dispute.id}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
                          Không có ảnh bằng chứng đính kèm.
                        </p>
                      )}
                    </section>

                    {dispute.decision && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                        <b>Quyết định xử lý:</b>
                        <p className="mt-1 whitespace-pre-wrap">
                          {dispute.decision}
                        </p>
                      </div>
                    )}

                    {!resolved && (
                      <div className="space-y-3 border-t pt-4">
                        <label
                          htmlFor={`decision-${dispute.id}`}
                          className="block text-sm font-semibold"
                        >
                          Quyết định xử lý
                        </label>
                        <textarea
                          id={`decision-${dispute.id}`}
                          rows={3}
                          maxLength={3000}
                          value={
                            decisions[dispute.id] ?? dispute.decision ?? ""
                          }
                          onChange={(event) =>
                            setDecisions((current) => ({
                              ...current,
                              [dispute.id]: event.target.value,
                            }))
                          }
                          placeholder="Ghi rõ kết luận và hướng xử lý..."
                          className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <div className="flex flex-wrap gap-3">
                          {dispute.status !== "Under review" && (
                            <Button
                              variant="outline"
                              disabled={savingId === dispute.id}
                              onClick={() =>
                                updateStatus(dispute, "Under review")
                              }
                            >
                              Đánh dấu đang xem xét
                            </Button>
                          )}
                          <Button
                            disabled={savingId === dispute.id}
                            onClick={() => updateStatus(dispute, "Resolved")}
                          >
                            {savingId === dispute.id
                              ? "Đang lưu..."
                              : "Giải quyết tranh chấp"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="card p-8 text-center text-slate-500">
              Không có tranh chấp phù hợp với bộ lọc này.
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
