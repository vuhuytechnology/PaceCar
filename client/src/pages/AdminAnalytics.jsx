import React, { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Car,
  CheckCircle2,
  Eye,
  RefreshCw,
  UserPlus as UserPlusIcon,
} from "lucide-react";
import { api } from "../services/api";
import {
  DashboardShell,
  ErrorState,
  PageHead,
  PageLoading,
} from "../components/UI";

const number = (value) => new Intl.NumberFormat("vi-VN").format(value || 0);

function dayLabel(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

function TrendChart({ title, description, values, color }) {
  const maximum = Math.max(1, ...values.map((item) => item.value));
  const total = values.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="card min-w-0 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <strong className="shrink-0 text-lg text-slate-950">
          {number(total)}
        </strong>
      </div>
      <div
        className="relative mt-5 h-40"
        role="img"
        aria-label={`${title}: ${number(total)} trong kỳ`}
      >
        {[25, 50, 75].map((position) => (
          <div
            key={position}
            className="absolute inset-x-0 border-t border-dashed border-slate-100"
            style={{ top: `${100 - position}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-1">
          {values.map((item) => (
            <div
              key={item.date}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${dayLabel(item.date)}: ${number(item.value)}`}
            >
              <div
                className={`w-full rounded-t-sm ${color}`}
                style={{
                  height: item.value
                    ? `${Math.max((item.value / maximum) * 100, 3)}%`
                    : "0%",
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{values.length ? dayLabel(values[0].date) : ""}</span>
        <span>
          {values.length ? dayLabel(values[values.length - 1].date) : ""}
        </span>
      </div>
    </section>
  );
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(`/admin/analytics?days=${days}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [days, version]);

  if (error && !data)
    return (
      <DashboardShell role="admin">
        <ErrorState
          message={error}
          onRetry={() => setVersion((current) => current + 1)}
        />
      </DashboardShell>
    );
  if (loading && !data)
    return (
      <DashboardShell role="admin">
        <PageLoading />
      </DashboardShell>
    );
  if (!data) return null;

  const { summary, daily } = data;
  const cards = [
    {
      title: "Lượt xem trang",
      value: number(summary.pageViews),
      note: `Trong ${days} ngày`,
      icon: Eye,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      title: "Đăng ký mới",
      value: number(summary.registrations),
      note: `Trong ${days} ngày`,
      icon: UserPlusIcon,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      title: "Người dùng hoạt động",
      value: number(summary.activeUsers),
      note: "Có phiên trong 5 phút gần nhất",
      icon: Activity,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Đơn hoàn tất",
      value: number(summary.completedBookingsAllTime),
      note: `${number(summary.completedBookings)} trong ${days} ngày`,
      icon: CheckCircle2,
      tone: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <DashboardShell role="admin">
      <PageHead
        eyebrow="PaceCar Insights"
        title="Biểu đồ & phân tích"
        desc="Theo dõi lượt truy cập, đăng ký người dùng và hiệu quả đơn thuê."
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="Khoảng thời gian thống kê">
          {[7, 30, 90].map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={days === period}
              onClick={() => setDays(period)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                days === period
                  ? "bg-brand-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {period} ngày
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVersion((current) => current + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Làm mới
        </button>
      </div>
      {error && (
        <p
          className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          Không thể làm mới dữ liệu: {error}
        </p>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, value, note, icon: Icon, tone }) => (
          <article className="card p-5" key={title}>
            <div
              className={`grid size-10 place-items-center rounded-xl ${tone}`}
            >
              <Icon size={19} />
            </div>
            <p className="mt-4 text-sm text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{note}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Tổng đơn thuê",
            value: summary.totalBookings,
            icon: CalendarDays,
          },
          {
            title: "Đơn đang hoạt động",
            value: summary.activeBookings,
            icon: Activity,
          },
          {
            title: "Xe đang công khai",
            value: summary.publishedCars,
            icon: Car,
          },
        ].map(({ title, value, icon: Icon }) => (
          <div className="card flex items-center gap-4 p-4" key={title}>
            <div className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{title}</p>
              <p className="font-bold text-slate-900">{number(value)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Lượt xem trang"
          description="Lượt mở trang theo ngày"
          values={daily.map((item) => ({
            date: item.date,
            value: item.pageViews,
          }))}
          color="bg-blue-500"
        />
        <TrendChart
          title="Đăng ký người dùng"
          description="Tài khoản mới theo ngày"
          values={daily.map((item) => ({
            date: item.date,
            value: item.registrations,
          }))}
          color="bg-violet-500"
        />
        <TrendChart
          title="Booking được tạo"
          description="Yêu cầu thuê xe mới theo ngày"
          values={daily.map((item) => ({
            date: item.date,
            value: item.bookings,
          }))}
          color="bg-amber-500"
        />
        <TrendChart
          title="Booking hoàn tất"
          description="Đơn chuyển sang trạng thái hoàn tất theo ngày"
          values={daily.map((item) => ({
            date: item.date,
            value: item.completedBookings,
          }))}
          color="bg-emerald-500"
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Lượt xem được ghi nhận từ khi bật tính năng. Người dùng hoạt động là tài
        khoản có phiên sử dụng trong 5 phút gần nhất; dữ liệu này chỉ bắt đầu
        tích lũy sau khi triển khai.
      </p>
    </DashboardShell>
  );
}
