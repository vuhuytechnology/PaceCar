import React, { useEffect, useState } from "react";
import { api, dateTime, money } from "../services/api";
import { Button, useToast } from "./UI";

const NOT_PUBLISHED = "Chủ xe chưa công bố — cần xác nhận trực tiếp trước khi đặt cọc";

export function PriceConditions({ quote }) {
  const c = quote?.conditions;
  if (!c) return null;
  const rows = [
    ["Giới hạn kilomet", c.mileageLimitKm ? `${c.mileageLimitKm} km/ngày` : NOT_PUBLISHED],
    ["Phí trả xe muộn", c.lateFeePerHour != null ? `${money(c.lateFeePerHour)}/giờ` : NOT_PUBLISHED],
    ["Nhiên liệu", c.fuelPolicy],
    ["Chính sách hủy / đổi lịch", c.cancellationPolicy || NOT_PUBLISHED],
    ["Hoàn cọc / khấu trừ", c.depositRefundTerms || NOT_PUBLISHED],
    ["Hiệu lực báo giá", quote.expiresAt ? `Đến ${dateTime(quote.expiresAt)}` : "15 phút"],
  ];
  return (
    <section className="card p-6">
      <h2 className="text-xl font-bold">Điều kiện thuê do chủ xe công bố</h2>
      <dl className="mt-4 divide-y text-sm">
        {rows.map(([label, value]) => (
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6" key={label}>
            <dt className="font-semibold text-slate-700 sm:w-56 sm:shrink-0">{label}</dt>
            <dd className="text-slate-600">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Giá cuối cùng do bên cho thuê xác nhận trước khi giao kết hợp đồng. Tiền
        cọc{quote.deposit != null ? ` (${money(quote.deposit)})` : ""} được tách
        riêng, không nằm trong tổng phí thuê.
      </p>
    </section>
  );
}

const statusText = {
  Proposed: "Chờ người thuê xác nhận",
  Accepted: "Đã xác nhận",
  Rejected: "Đã từ chối",
  Superseded: "Đã được thay bằng báo giá mới",
  Confirmed: "Hai bên đã xác nhận",
  Disputed: "Người thuê chưa đồng ý",
};

function useAction(reload) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return [
    busy,
    async (path, method, body, done) => {
      setBusy(true);
      try {
        await api(path, { method, body: JSON.stringify(body) });
        toast(done);
        await reload?.();
        return true;
      } catch (error) {
        toast.error(error.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  ];
}

const numberOf = (value) => (value === "" ? 0 : Number(value));

export function PriceConfirmationPanel({ booking, user, reload }) {
  const [busy, act] = useAction(reload);
  const empty = { reason: "", otherFee: "", otherFeeLabel: "", ownerDiscount: "", deposit: "" };
  const [form, setForm] = useState(empty);
  const revisions = booking.priceRevisions || [];
  const pending = revisions.find((item) => item.status === "Proposed");
  const isOwner = user?.role === "owner" && user.id === booking.ownerId;
  const isRenter = user?.role === "renter" && user.id === booking.renterId;
  const open =
    ["Pending", "Accepted", "Deposit Required"].includes(booking.status) &&
    booking.paymentStatus !== "Paid";
  if (!revisions.length && !(isOwner && open)) return null;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const row = (label, before, after) =>
    before !== after && (
      <li key={label}>
        {label}: <s className="text-slate-400">{money(before)}</s> → <b>{money(after)}</b>
      </li>
    );
  const revisionPath = pending && `/bookings/${booking.id}/price-revisions/${pending.id}`;
  return (
    <section className="card mb-5 p-6" aria-labelledby="price-confirmation-title">
      <h2 id="price-confirmation-title" className="text-lg font-bold">
        Xác nhận giá cuối cùng
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Mọi thay đổi giá phải được người thuê xác nhận trước khi đặt cọc hoặc ký
        hợp đồng. Lịch sử các lần điều chỉnh được giữ lại.
      </p>
      {pending && isRenter && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Chủ xe đề xuất báo giá mới.</b> Lý do: {pending.reason}
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {row("Tổng phí thuê", pending.previous.totalPrice, pending.proposed.totalPrice)}
            {row("Tiền cọc (riêng)", pending.previous.deposit, pending.proposed.deposit)}
            {row("Phí giao xe", pending.previous.deliveryFee, pending.proposed.deliveryFee)}
            {row(pending.proposed.otherFeeLabel || "Phí khác", pending.previous.otherFee, pending.proposed.otherFee)}
            {row("Giảm giá của chủ xe", pending.previous.ownerDiscount, pending.proposed.ownerDiscount)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act(revisionPath, "PUT", { decision: "accept" }, "Đã xác nhận báo giá mới")}>
              Xác nhận báo giá mới
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => act(revisionPath, "PUT", { decision: "reject" }, "Đã từ chối báo giá mới")}>
              Không đồng ý
            </Button>
          </div>
        </div>
      )}
      {pending && isOwner && (
        <p className="mt-4 text-sm text-amber-800">Đang chờ người thuê xác nhận báo giá #{pending.id}.</p>
      )}
      {revisions.length > 0 && (
        <ol className="mt-4 space-y-2 text-sm">
          {revisions.map((item) => (
            <li className="rounded-lg bg-slate-50 p-3" key={item.id}>
              <b>#{item.id}</b> · {dateTime(item.proposedAt)} · {statusText[item.status] || item.status}
              <div className="text-slate-600">
                {money(item.previous.totalPrice)} → {money(item.proposed.totalPrice)} · {item.reason}
              </div>
            </li>
          ))}
        </ol>
      )}
      {isOwner && open && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { reason: form.reason };
            if (form.otherFee !== "") {
              body.otherFee = numberOf(form.otherFee);
              body.otherFeeLabel = form.otherFeeLabel;
            }
            if (form.ownerDiscount !== "") body.ownerDiscount = numberOf(form.ownerDiscount);
            if (form.deposit !== "") body.deposit = numberOf(form.deposit);
            if (await act(`/bookings/${booking.id}/price-revisions`, "POST", body, "Đã gửi báo giá mới cho người thuê"))
              setForm(empty);
          }}
        >
          <h3 className="font-semibold sm:col-span-2">Đề xuất điều chỉnh báo giá</h3>
          <label className="label">
            Phí khác (đ)
            <input className="input mt-1" type="number" min="0" step="1" value={form.otherFee} onChange={set("otherFee")} />
          </label>
          <label className="label">
            Tên khoản phí khác
            <input className="input mt-1" maxLength={80} value={form.otherFeeLabel} onChange={set("otherFeeLabel")} />
          </label>
          <label className="label">
            Giảm giá (đ)
            <input className="input mt-1" type="number" min="0" step="1" value={form.ownerDiscount} onChange={set("ownerDiscount")} />
          </label>
          <label className="label">
            Tiền cọc mới (đ)
            <input className="input mt-1" type="number" min="0" step="1" value={form.deposit} onChange={set("deposit")} />
          </label>
          <label className="label sm:col-span-2">
            Lý do điều chỉnh (bắt buộc)
            <textarea className="input mt-1" rows="2" minLength={5} maxLength={500} required value={form.reason} onChange={set("reason")} />
          </label>
          <Button className="sm:col-span-2" disabled={busy}>
            Gửi người thuê xác nhận
          </Button>
        </form>
      )}
    </section>
  );
}

export function DepositRefundPanel({ booking, user, reload }) {
  const [busy, act] = useAction(reload);
  const [form, setForm] = useState({ refundAmount: "", deductionAmount: "0", reason: "", refundDate: "", method: "" });
  const [note, setNote] = useState("");
  const record = booking.depositRefund;
  const isOwner = user?.role === "owner" && user.id === booking.ownerId;
  const isRenter = user?.role === "renter" && user.id === booking.renterId;
  const eligible =
    ["Check-out Review", "Completed", "Dispute"].includes(booking.status) &&
    booking.paymentStatus === "Paid";
  if (!record && !(isOwner && eligible)) return null;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const canPropose = isOwner && eligible && record?.status !== "Confirmed";
  const path = `/bookings/${booking.id}/deposit-refund`;
  return (
    <section className="card mb-5 p-6" aria-labelledby="deposit-refund-title">
      <h2 id="deposit-refund-title" className="text-lg font-bold">
        Biên bản hoàn cọc và khoản khấu trừ
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Đây là biên bản ghi nhận thỏa thuận giữa chủ xe và người thuê. PaceCar
        không nhận hay chuyển tiền cọc.
      </p>
      {record && (
        <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>Tiền cọc ban đầu: <b>{money(record.depositAmount)}</b></div>
          <div>Tiền hoàn: <b>{money(record.refundAmount)}</b></div>
          <div>Tiền khấu trừ: <b>{money(record.deductionAmount)}</b></div>
          <div>Trạng thái: <b>{statusText[record.status] || record.status}</b></div>
          {record.reason && <div className="sm:col-span-2">Lý do: {record.reason}</div>}
          {record.refundDate && <div>Ngày hoàn: {dateTime(record.refundDate)}</div>}
          {record.method && <div>Phương thức: {record.method}</div>}
          {record.renterNote && <div className="sm:col-span-2">Ý kiến người thuê: {record.renterNote}</div>}
        </dl>
      )}
      {isRenter && record?.status === "Proposed" && (
        <div className="mt-4 space-y-3">
          <textarea
            className="input"
            rows="2"
            maxLength={500}
            placeholder="Nếu không đồng ý, ghi rõ khoản chưa thống nhất"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act(path, "PUT", { decision: "confirm" }, "Đã xác nhận biên bản hoàn cọc")}>
              Xác nhận biên bản
            </Button>
            <Button variant="outline" disabled={busy || !note.trim()} onClick={() => act(path, "PUT", { decision: "dispute", note }, "Đã ghi nhận ý kiến không đồng ý")}>
              Không đồng ý
            </Button>
          </div>
        </div>
      )}
      {canPropose && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = {
              refundAmount: numberOf(form.refundAmount),
              deductionAmount: numberOf(form.deductionAmount),
            };
            if (form.reason) body.reason = form.reason;
            if (form.refundDate) body.refundDate = form.refundDate;
            if (form.method) body.method = form.method;
            await act(path, "POST", body, "Đã gửi biên bản hoàn cọc");
          }}
        >
          <h3 className="font-semibold sm:col-span-2">
            {record ? "Lập lại biên bản" : "Lập biên bản"} (hoàn + khấu trừ = {money(booking.deposit)})
          </h3>
          <label className="label">
            Tiền hoàn (đ)
            <input className="input mt-1" type="number" min="0" step="1" required value={form.refundAmount} onChange={set("refundAmount")} />
          </label>
          <label className="label">
            Tiền khấu trừ (đ)
            <input className="input mt-1" type="number" min="0" step="1" required value={form.deductionAmount} onChange={set("deductionAmount")} />
          </label>
          <label className="label">
            Ngày hoàn
            <input className="input mt-1" type="date" value={form.refundDate} onChange={set("refundDate")} />
          </label>
          <label className="label">
            Phương thức hoàn
            <input className="input mt-1" maxLength={80} value={form.method} onChange={set("method")} />
          </label>
          <label className="label sm:col-span-2">
            Lý do và chứng cứ khấu trừ (bắt buộc nếu có khấu trừ)
            <textarea className="input mt-1" rows="2" maxLength={500} value={form.reason} onChange={set("reason")} />
          </label>
          <Button className="sm:col-span-2" disabled={busy}>
            Gửi người thuê xác nhận
          </Button>
        </form>
      )}
    </section>
  );
}

export function ReportForm({ carId, bookingId, defaultType = "price_mismatch" }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(defaultType);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!localStorage.getItem("pacecar-token"))
    return (
      <p className="text-xs text-slate-500">
        Đăng nhập để báo cáo thông tin sai lệch hoặc tin đăng vi phạm.
      </p>
    );
  if (!open)
    return (
      <button type="button" className="text-xs font-semibold text-brand-700 underline" onClick={() => setOpen(true)}>
        Báo cáo thông tin sai lệch
      </button>
    );
  return (
    <form
      className="space-y-3 rounded-xl border p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/reports", { method: "POST", body: JSON.stringify({ type, carId, bookingId, message }) });
          toast("Đã gửi phản ánh đến PaceCar");
          setMessage("");
          setOpen(false);
        } catch (error) {
          toast.error(error.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="label">
        Loại phản ánh
        <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="price_mismatch">Giá thực tế khác giá hiển thị</option>
          <option value="listing_violation">Tin đăng vi phạm quy chế</option>
          <option value="platform_issue">Vấn đề liên quan đến nền tảng</option>
        </select>
      </label>
      <label className="label">
        Nội dung (10–1000 ký tự)
        <textarea className="input mt-1" rows="3" minLength={10} maxLength={1000} required value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button disabled={busy}>Gửi phản ánh</Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Đóng
        </Button>
      </div>
    </form>
  );
}

export function AdminDealsPanel() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true });
  const [base, setBase] = useState("2100000");
  const [preview, setPreview] = useState(null);
  const load = async () => {
    const [reports, consents] = await Promise.all([api("/admin/reports"), api("/admin/terms-consents")]);
    const policy = await api("/admin/commission/policy").catch(() => null);
    const commissions = policy ? await api("/admin/commissions") : [];
    setState({ reports, consents, policy, commissions });
  };
  useEffect(() => {
    load().catch((error) => setState({ error: error.message }));
  }, []);
  if (state.loading) return null;
  if (state.error) return <p className="mt-6 text-sm text-red-600">{state.error}</p>;
  return (
    <section className="card mt-6 p-6" aria-labelledby="admin-deals-title">
      <h2 id="admin-deals-title" className="text-lg font-bold">
        Điều khoản, phản ánh và hoa hồng thử nghiệm
      </h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Phản ánh ({state.reports.length})</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {state.reports.slice(0, 8).map((report) => (
              <li className="rounded-lg bg-slate-50 p-3" key={report.id}>
                <b>{report.type}</b> · xe #{report.carId ?? "—"} · {report.status}
                <p className="text-slate-600">{report.message}</p>
                {report.status === "Open" && (
                  <button
                    className="mt-1 text-xs font-semibold text-brand-700 underline"
                    onClick={() =>
                      api(`/admin/reports/${report.id}`, { method: "PUT", body: JSON.stringify({ status: "Resolved" }) })
                        .then(load)
                        .catch((error) => toast.error(error.message))
                    }
                  >
                    Đánh dấu đã xử lý
                  </button>
                )}
              </li>
            ))}
            {!state.reports.length && <li className="text-slate-500">Chưa có phản ánh.</li>}
          </ul>
          <h3 className="mt-5 font-semibold">Ghi nhận chấp thuận điều khoản ({state.consents.length})</h3>
          <p className="text-xs text-slate-500">Người dùng, phiên bản, thời điểm và mã yêu cầu được lưu cho từng booking.</p>
        </div>
        <div>
          <h3 className="font-semibold">Hoa hồng thử nghiệm</h3>
          {state.policy ? (
            <>
              <p className="mt-1 text-xs text-amber-700">
                Phương án đề xuất, chưa phải chính sách chính thức: chỉ tính thử, không tạo công nợ hay thu phí.
              </p>
              <form
                className="mt-2 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    setPreview(await api(`/admin/commission/preview?base=${encodeURIComponent(base)}`));
                  } catch (error) {
                    setPreview(null);
                    toast.error(error.message);
                  }
                }}
              >
                <input className="input" inputMode="numeric" aria-label="Tổng tiền thuê cơ bản" value={base} onChange={(e) => setBase(e.target.value)} />
                <Button>Tính thử</Button>
              </form>
              {preview && (
                <p className="mt-2 text-sm">
                  {money(preview.baseAmount)} × {preview.rate * 100}% = <b>{money(preview.amount)}</b>
                </p>
              )}
              <p className="mt-3 text-sm text-slate-600">Đã ghi nhận thử: {state.commissions.length} giao dịch.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Tính năng đang tắt (COMMISSION_TRIAL_ENABLED).</p>
          )}
        </div>
      </div>
    </section>
  );
}
