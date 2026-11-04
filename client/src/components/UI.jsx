import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  Bell,
  Car,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Heart,
  BadgePercent,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  User,
  Wallet,
  X,
  ShieldCheck,
  Star,
  UploadCloud,
} from "lucide-react";
import { api, money } from "../services/api";
import { useAuth } from "../auth/AuthContext";
import { PaceLogo } from "./LogoMark";
export function Button({
  children,
  variant = "primary",
  className = "",
  as: Element = "button",
  ...p
}) {
  const v = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md",
    secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
    light: "bg-white text-brand-700 hover:bg-blue-50",
    "on-dark":
      "border border-white/25 bg-white/5 text-white hover:border-white/45 hover:bg-white/10",
    outline:
      "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  };
  return (
    <Element
      className={`btn-motion inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold ${v[variant]} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-signal-100 focus-visible:ring-offset-2 disabled:opacity-50 ${className}`}
      {...p}
    >
      {children}
    </Element>
  );
}
export function TrustScoreBadge({ score, large = false }) {
  const hasScore =
    score !== null &&
    score !== undefined &&
    score !== "" &&
    Number.isFinite(Number(score));
  if (!hasScore)
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 font-semibold text-slate-500 ${large ? "px-4 py-2 text-base" : "px-2.5 py-1 text-xs"}`}
      >
        <ShieldCheck size={large ? 20 : 14} /> Trust chưa có dữ liệu
      </span>
    );
  const numericScore = Number(score);
  const c =
    numericScore >= 80
      ? "text-emerald-700 bg-emerald-50"
      : numericScore >= 50
        ? "text-amber-700 bg-amber-50"
        : "text-red-700 bg-red-50";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${large ? "px-4 py-2 text-base" : "px-2.5 py-1 text-xs"} ${c}`}
    >
      <ShieldCheck size={large ? 20 : 14} /> Trust {numericScore}
    </span>
  );
}
export function RiskBadge({ level = "Medium" }) {
  const c =
    level === "Low"
      ? "bg-emerald-50 text-emerald-700"
      : level === "High"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c}`}>
      {level} Risk
    </span>
  );
}
export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
      <CheckCircle2 size={14} /> Đã xác thực
    </span>
  );
}
export function StatusBadge({ status }) {
  const c = {
    Pending: "bg-amber-50 text-amber-700",
    Accepted: "bg-blue-50 text-blue-700",
    "Deposit Required": "bg-cyan-50 text-cyan-700",
    "Contract Signed": "bg-indigo-50 text-indigo-700",
    "Ready for Check-in": "bg-teal-50 text-teal-700",
    Rejected: "bg-red-50 text-red-700",
    Expired: "bg-slate-100 text-slate-700",
    Ongoing: "bg-violet-50 text-violet-700",
    "Check-out Review": "bg-fuchsia-50 text-fuchsia-700",
    Completed: "bg-emerald-50 text-emerald-700",
    Dispute: "bg-orange-50 text-orange-700",
    Open: "bg-red-50 text-red-700",
    "Under review": "bg-amber-50 text-amber-700",
    Resolved: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${c[status] || "bg-slate-100"}`}
    >
      {status}
    </span>
  );
}
export function CarCard({ car, onRemoveFavorite, removing = false }) {
  const trustScore = car.owner?.trustScore ?? car.trustScore;
  const hasTrustScore =
    trustScore !== null &&
    trustScore !== undefined &&
    trustScore !== "" &&
    Number.isFinite(Number(trustScore));
  return (
    <article className="card interactive-card group overflow-hidden">
      <div className="relative h-52 overflow-hidden">
        <img
          src={
            car.photos?.[0] ||
            car.imageUrl ||
            "https://placehold.co/800x500?text=PaceCar"
          }
          alt={car.name ? `Xe ${car.name}` : "Xe cho thuê trên PaceCar"}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "/images/home-hero.jpg";
          }}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {car.verified && (
          <div className="absolute left-3 top-3">
            <VerifiedBadge />
          </div>
        )}
        {car.bookingBlockedByCommission && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
            Tạm ngưng · chờ đối soát hoa hồng
          </span>
        )}
        {onRemoveFavorite && (
          <button
            type="button"
            onClick={() => onRemoveFavorite(car)}
            disabled={removing}
            aria-label={`Bỏ ${car.name || "xe"} khỏi danh sách yêu thích`}
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-red-500 shadow transition hover:bg-red-50 disabled:opacity-50"
          >
            <Heart size={19} className="fill-current" />
          </button>
        )}
      </div>
      <div className="p-5">
        <div className="mb-2 min-w-0">
          <h3 className="font-bold text-slate-900">{car.name}</h3>
          {car.reviewCount > 0 ? (
            <span className="mt-1 flex items-center gap-1 text-sm font-bold">
              <Star size={14} fill="currentColor" className="text-amber-400" />
              {car.rating} ({car.reviewCount})
            </span>
          ) : (
            <span className="mt-1 block text-xs font-semibold text-slate-400">
              Chưa có đánh giá
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {car.location} · {car.seats} chỗ · {car.transmission}
        </p>
        <div className="mb-4 flex items-center justify-between">
          {hasTrustScore ? (
            <TrustScoreBadge score={Number(trustScore)} />
          ) : (
            <span
              title="Trust chưa có dữ liệu"
              className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
            >
              Trust —
            </span>
          )}
          <p>
            <b className="text-brand-600">{money(car.pricePerDay)}</b>
            <span className="text-xs text-slate-500">/ngày</span>
          </p>
        </div>
        <Link
          to={`/cars/${car.id}`}
          className="block rounded-xl bg-slate-900 py-2.5 text-center text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
export function DashboardCard({ icon: Icon, title, value, detail }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon size={22} />
      </div>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-emerald-600">{detail}</p>}
    </div>
  );
}
export function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} />
  );
}
export function PageLoading() {
  return (
    <div className="container-app min-w-0 py-12">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="mt-7 h-72" />
    </div>
  );
}
export function ErrorState({ message, onRetry }) {
  return (
    <div className="card mx-auto my-16 max-w-lg p-10 text-center">
      <ShieldAlert className="mx-auto text-red-500" size={38} />
      <h2 className="mt-4 text-xl font-bold">Không tải được dữ liệu</h2>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-5">
          <RefreshCw size={16} /> Thử lại
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  title = "Chưa có dữ liệu",
  desc = "Dữ liệu mới sẽ xuất hiện tại đây.",
  icon: Icon = FileText,
}) {
  return (
    <div className="py-12 text-center">
      <Icon className="mx-auto text-slate-300" size={40} />
      <p className="mt-3 font-bold">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{desc}</p>
    </div>
  );
}
export function Modal({ open, title, children, onClose, actions }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable || dialog)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [
        ...dialog.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-6 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X />
          </button>
        </div>
        <div className="py-5 text-sm text-slate-600">{children}</div>
        <div className="flex justify-end gap-3">{actions}</div>
      </div>
    </div>
  );
}
export function TrustBreakdown({
  score = 50,
  verification = {},
  breakdown = null,
}) {
  const displayScore = breakdown?.score ?? score;
  const isHealthy = displayScore >= 75;
  const isWarning = displayScore < 50;
  const gaugeColor = isWarning ? "#ef4444" : isHealthy ? "#10b981" : "#f59e0b";

  return (
    <div className="card p-5">
      <div className="flex items-center gap-5">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${gaugeColor} ${displayScore * 3.6}deg,#e2e8f0 0)`,
          }}
        >
          <div className="grid h-20 w-20 place-items-center rounded-full bg-white">
            <span className="text-2xl font-extrabold">{displayScore}</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">Trust Score của bạn</h3>
            {breakdown?.riskLevel && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  breakdown.riskLevel === "Low"
                    ? "bg-emerald-50 text-emerald-700"
                    : breakdown.riskLevel === "Medium"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                Rủi ro: {breakdown.riskLevel}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Điểm tính tự động từ hành vi, xác minh danh tính và phán quyết tranh
            chấp theo quy tắc minh bạch 100%.
          </p>
        </div>
      </div>

      {breakdown ? (
        <div className="mt-5 space-y-4 divide-y divide-slate-100">
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
              <span>1. Xác thực hồ sơ</span>
              <span className="text-emerald-600">
                +{breakdown.verification?.total ?? 0}/25
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {breakdown.verification?.items?.map((item) => (
                <div
                  className="flex items-center justify-between text-sm"
                  key={item.name}
                >
                  <span
                    className={
                      item.achieved ? "text-slate-700" : "text-slate-400"
                    }
                  >
                    {item.achieved ? "✓" : "○"} {item.name}
                  </span>
                  <b
                    className={
                      item.achieved ? "text-emerald-600" : "text-slate-400"
                    }
                  >
                    {item.achieved ? `+${item.points}` : "+0"}
                  </b>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
              <span>2. Lịch sử giao dịch</span>
              <span className="text-emerald-600">
                +{breakdown.history?.total ?? 0}/25
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {breakdown.history?.items?.length > 0 ? (
                breakdown.history.items.map((item) => (
                  <div
                    className="flex items-center justify-between text-sm"
                    key={item.name}
                  >
                    <span className="text-slate-700">✓ {item.name}</span>
                    <b className="text-emerald-600">+{item.points}</b>
                  </div>
                ))
              ) : (
                <p className="text-xs italic text-slate-400">
                  Chưa phát sinh chuyến đi hoàn thành
                </p>
              )}
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
              <span>3. Chất lượng &amp; Đánh giá</span>
              <span
                className={
                  (breakdown.rating?.points ?? 0) >= 0
                    ? "text-emerald-600"
                    : "text-red-500"
                }
              >
                {(breakdown.rating?.points ?? 0) >= 0
                  ? `+${breakdown.rating?.points ?? 0}`
                  : breakdown.rating?.points}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Điểm Bayesian hiệu chỉnh theo đánh giá từ người dùng
            </div>
          </div>

          {breakdown.penalties?.total > 0 && (
            <div className="pt-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-red-500">
                <span>4. Điểm phạt vi phạm</span>
                <span>-{breakdown.penalties.total}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {breakdown.penalties.items.map((item, idx) => (
                  <div
                    className="flex items-center justify-between text-sm text-red-600"
                    key={idx}
                  >
                    <span>× {item.name}</span>
                    <b>-{item.points}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {[
            ["Xác thực danh tính", 20, verification.identityVerified],
            ["Số điện thoại", 10, verification.phoneVerified],
            ["Giấy phép lái xe", 10, verification.licenseVerified],
            ["Không có tranh chấp", 10, verification.noDisputes],
            ["Lịch sử hoàn thành", 10, verification.completedTrips],
          ].map(([x, p, ok]) => (
            <div className="flex items-center justify-between text-sm" key={x}>
              <span
                className={
                  ok === true
                    ? ""
                    : ok === false
                      ? "text-red-500"
                      : "text-slate-400"
                }
              >
                {ok === true ? "✓" : ok === false ? "×" : "○"} {x}
              </span>
              <b
                className={ok === true ? "text-emerald-600" : "text-slate-400"}
              >
                {ok === true
                  ? `+${p}`
                  : ok === false
                    ? "+0"
                    : "Chưa có dữ liệu"}
              </b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function EvidenceUploader({ label }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center transition hover:border-brand-300">
      <UploadCloud className="mb-2 text-slate-400" />
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-slate-400">Ảnh/video minh chứng</p>
    </div>
  );
}
const ToastCtx = createContext();
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [notice, setNotice] = useState(null);
  const show = (value, requestedType = "success") => {
    const payload =
      value && typeof value === "object" && !(value instanceof Error)
        ? value
        : { message: value instanceof Error ? value.message : value };
    setNotice({
      message: String(payload.message || ""),
      type: payload.type || (value instanceof Error ? "error" : requestedType),
      id: Date.now() + Math.random(),
    });
  };
  show.success = (message) => show(message, "success");
  show.error = (message) => show(message, "error");
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(null), 3500);
      return () => clearTimeout(t);
    }
  }, [notice?.id]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          aria-live={notice.type === "error" ? "assertive" : "polite"}
          className={`fixed bottom-6 left-4 right-4 z-[80] rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-2xl sm:left-auto sm:max-w-md ${notice.type === "error" ? "bg-red-700" : "bg-slate-900"}`}
        >
          {notice.type === "error" ? "!" : "✓"} {notice.message}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export function NotificationCenter() {
  const { user } = useAuth();
  const panelId = useId();
  const [open, setOpen] = useState(false),
    [items, setItems] = useState([]);
  const load = () =>
    user &&
    api(`/notifications/${user.id}`)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    let active = true;
    if (user)
      api(`/notifications/${user.id}`)
        .then((data) => active && setItems(data))
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);
  if (!user) return null;
  const unread = items.filter((x) => !x.read).length;
  async function all() {
    await api(`/notifications/user/${user.id}/read-all`, { method: "PUT" });
    load();
  }
  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          load();
        }}
        className="relative rounded-xl p-2 hover:bg-white/10"
        aria-label="Thông báo"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-12 w-[calc(100vw-2rem)] max-w-[340px] overflow-hidden rounded-2xl border bg-white text-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b p-4">
            <b>Thông báo</b>
            <button
              onClick={all}
              className="text-xs font-semibold text-brand-600"
            >
              Đánh dấu đã đọc
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length ? (
              items.map((n) => (
                <div
                  className={`border-b p-4 last:border-0 ${n.read ? "" : "bg-blue-50/60"}`}
                  key={n.id}
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-200" : "bg-brand-500"}`}
                    />
                    <div>
                      <p className="text-sm font-bold">{n.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {n.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Không có thông báo" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const dash = user ? `/dashboard/${user.role}` : "/login";
  const closeMenu = () => setOpen(false);
  const logoutAndLeave = () => {
    closeMenu();
    logout();
    window.location.assign("/");
  };
  useEffect(() => {
    closeMenu();
  }, [location.pathname, location.search, location.hash]);
  const navLink =
    "py-2 text-xs font-bold leading-[16.5px] text-white transition-colors hover:text-pace-blue";
  const cta =
    "flex min-h-[36px] items-center justify-center rounded-[2px] border-[0.8px] border-transparent bg-pace-blue px-[18px] text-[11px] font-bold uppercase leading-[16.5px] tracking-[0.22px] text-white transition hover:border-pace-blue hover:bg-white hover:text-pace-blue";
  const ctaTo = user?.role === "owner" ? "/owner/cars/new" : "/cars";
  const ctaText = user?.role === "owner" ? "Đăng xe cho thuê" : "Thuê xe ngay";
  return (
    <header className="sticky top-0 z-40 bg-pace-dark font-ui text-white">
      <div className="container-app flex h-[58px] items-center justify-between">
        <Link to="/" onClick={closeMenu} aria-label="PaceCar - trang chủ">
          <PaceLogo />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/help" className={navLink}>
            Hỗ trợ
          </Link>
          {!user && (
            <Link to="/register" className={navLink}>
              Đăng kí
            </Link>
          )}
          <Link to={dash} className={navLink}>
            {user ? "Bảng điều khiển" : "Đăng nhập"}
          </Link>
          {user && <NotificationCenter />}
          {user && (
            <button
              type="button"
              onClick={logoutAndLeave}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="rounded-[2px] p-2 hover:bg-white/10"
            >
              <LogOut size={18} />
            </button>
          )}
          <Link to={ctaTo} className={cta}>
            {ctaText}
          </Link>
        </nav>
        <button
          className="grid h-11 w-11 place-items-center rounded-[2px] text-white hover:bg-white/10 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div
          id="mobile-navigation"
          className="border-t border-white/10 bg-pace-dark p-4 md:hidden"
        >
          <div className="container-app flex flex-col gap-1 px-0 text-xs font-bold">
            <Link
              to="/help"
              onClick={closeMenu}
              className="rounded-[2px] px-3 py-3 hover:bg-white/10"
            >
              Hỗ trợ
            </Link>
            {!user && (
              <Link
                to="/register"
                onClick={closeMenu}
                className="rounded-[2px] px-3 py-3 hover:bg-white/10"
              >
                Đăng kí
              </Link>
            )}
            <Link
              to={dash}
              onClick={closeMenu}
              className="rounded-[2px] px-3 py-3 hover:bg-white/10"
            >
              {user ? "Bảng điều khiển" : "Đăng nhập"}
            </Link>
            {user && (
              <>
                <div className="flex items-center justify-between rounded-[2px] px-3 py-2 hover:bg-white/10">
                  <Link
                    to="/profile"
                    onClick={closeMenu}
                    className="flex-1 py-1"
                  >
                    Hồ sơ cá nhân
                  </Link>
                  <NotificationCenter />
                </div>
                <button
                  type="button"
                  onClick={logoutAndLeave}
                  className="flex items-center gap-2 rounded-[2px] px-3 py-3 text-left text-red-300 hover:bg-white/10"
                >
                  <LogOut size={18} /> Đăng xuất
                </button>
              </>
            )}
            <Link to={ctaTo} onClick={closeMenu} className={`${cta} mt-2`}>
              {ctaText}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
export function DashboardShell({ role, children }) {
  const labels = { renter: "Người thuê", owner: "Chủ xe", admin: "Quản trị" };
  const dashboard = `/dashboard/${role}`;
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);
  const itemClass = (active) =>
    `flex items-center gap-3 rounded-xl px-3 py-3 transition ${
      active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
    }`;
  const navClass = ({ isActive }) => itemClass(isActive);
  return (
    <div className="container-app py-8">
      <div className="grid gap-7 lg:grid-cols-[230px_1fr]">
        <aside className="card h-fit p-3 lg:sticky lg:top-24">
          <div className="flex items-center justify-between border-b p-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Không gian
              </p>
              <p className="mt-1 font-bold">{labels[role] || "Tài khoản"}</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              aria-label={
                menuOpen ? "Thu gọn menu tài khoản" : "Mở menu tài khoản"
              }
              aria-expanded={menuOpen}
              aria-controls="dashboard-navigation"
            >
              <ChevronDown
                size={20}
                className={`transition ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          <nav
            id="dashboard-navigation"
            className={`mt-2 space-y-1 text-sm font-semibold lg:block ${menuOpen ? "block" : "hidden"}`}
          >
            <Link
              to={dashboard}
              className={itemClass(
                location.pathname === dashboard && location.hash !== "#finance",
              )}
            >
              <LayoutDashboard size={18} /> Tổng quan
            </Link>
            <NavLink to="/bookings" className={navClass}>
              <FileText size={18} /> Đơn thuê xe
            </NavLink>
            {role === "owner" && (
              <>
                <NavLink to="/owner/cars" end className={navClass}>
                  <Car size={18} /> Xe của tôi
                </NavLink>
                <NavLink to="/owner/cars/new" className={navClass}>
                  <PlusCircle size={18} /> Đăng xe cho thuê
                </NavLink>
              </>
            )}
            {role === "renter" && (
              <NavLink to="/favorites" className={navClass}>
                <Heart size={18} /> Xe yêu thích
              </NavLink>
            )}
            {role === "admin" && (
              <>
                <NavLink to="/admin/analytics" className={navClass}>
                  <Activity size={18} /> Số liệu
                </NavLink>
                <NavLink to="/admin/car-approvals" className={navClass}>
                  <ClipboardCheck size={18} /> Duyệt tin xe
                </NavLink>
                <NavLink to="/admin/disputes" className={navClass}>
                  <ShieldAlert size={18} /> Trung tâm tranh chấp
                </NavLink>
                <NavLink to="/admin/promotions" className={navClass}>
                  <BadgePercent size={18} /> Quản lý ưu đãi
                </NavLink>
              </>
            )}
            <Link
              to={`${dashboard}#finance`}
              className={itemClass(
                location.pathname === dashboard && location.hash === "#finance",
              )}
            >
              <Wallet size={18} />{" "}
              {role === "renter" ? "Trust Score" : "Tài chính"}
            </Link>
            <NavLink
              to={
                role === "owner" || role === "admin" ? "/risk-alerts" : "/cars"
              }
              className={navClass}
            >
              <Car size={18} />{" "}
              {role === "owner" || role === "admin"
                ? "Cảnh báo rủi ro"
                : "Khám phá xe"}
            </NavLink>
            <NavLink to="/profile" className={navClass}>
              <User size={18} /> Hồ sơ
            </NavLink>
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="relative mt-20 overflow-hidden bg-pace-dark px-5 py-[62px] font-ui">
      {/* decorative swooshes (exported from Figma into /public/images) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-39.27px] top-[30.3px] flex h-[272.742px] w-[195.271px] items-center justify-center"
      >
        <div style={{ transform: "rotate(16.06deg)" }}>
          <div
            className="h-[245.682px] w-[132.478px] bg-contain bg-no-repeat"
            style={{ backgroundImage: "url(/images/footer-swoosh-right.svg)" }}
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-46px] top-[0.3px] flex h-[103.913px] w-[178.528px] items-center justify-center"
      >
        <div style={{ transform: "rotate(86.43deg)" }}>
          <div
            className="h-[173.052px] w-[93.314px] bg-contain bg-no-repeat"
            style={{ backgroundImage: "url(/images/footer-swoosh-left.svg)" }}
          />
        </div>
      </div>
      <div className="relative flex flex-col gap-10 md:flex-row md:items-center md:justify-center md:gap-[119px]">
        <div className="flex flex-col gap-6 md:w-[347px] md:shrink-0">
          <PaceLogo />
          <p className="text-sm leading-[23.8px] text-pace-foot-text">
            Nền tảng thuê xe dựa trên niềm tin, giúp mọi chuyến đi minh bạch và
            an toàn hơn.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:w-[96px] md:shrink-0">
          <b className="text-sm font-bold leading-[21px] text-white">
            Khám phá
          </b>
          <nav
            aria-label="Khám phá PaceCar"
            className="flex flex-col items-start gap-2 text-xs leading-[18px] text-pace-foot-link"
          >
            <Link className="footer-link hover:text-pace-blue" to="/cars">
              Tìm xe
            </Link>
            <a className="footer-link hover:text-pace-blue" href="/#how-it-works">
              Cách hoạt động
            </a>
            <Link className="footer-link hover:text-pace-blue" to="/help">
              Hỗ trợ tranh chấp
            </Link>
            <a
              className="footer-link hover:text-pace-blue"
              href="/licenses/index.html"
            >
              Giấy phép bộ chuyển đổi HEIC
            </a>
          </nav>
        </div>
        <div className="flex flex-col gap-3 md:w-[98px] md:shrink-0">
          <b className="text-sm font-bold leading-[21px] text-white">Liên hệ</b>
          <div className="flex flex-col items-start gap-2 text-xs leading-[18px] text-pace-foot-link">
            <a
              className="footer-link hover:text-pace-blue"
              href="mailto:hello@pacecar.vn"
            >
              hello@pacecar.vn
            </a>
            <a className="footer-link hover:text-pace-blue" href="tel:19001000">
              1900 1000
            </a>
            <span>Hà Nội, Việt Nam</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
export function Layout({ children }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-white p-3 font-bold text-brand-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Bỏ qua điều hướng, đến nội dung chính
      </a>
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
export function PageHead({ eyebrow, title, desc }) {
  return (
    <div className="mb-8">
      <p className="mb-2 text-sm font-bold uppercase tracking-wider text-brand-600">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        {title}
      </h1>
      {desc && <p className="mt-3 max-w-2xl text-slate-500">{desc}</p>}
    </div>
  );
}
export function PriceBreakdown({ rental, fee, delivery = 0, deposit }) {
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
      <div className="flex justify-between">
        <span>Tiền thuê xe</span>
        <b>{money(rental)}</b>
      </div>
      <div className="flex justify-between">
        <span>Phí nền tảng</span>
        <b>{money(fee)}</b>
      </div>
      <div className="flex justify-between">
        <span>Phí giao xe</span>
        <b>{money(delivery)}</b>
      </div>
      <div className="border-t pt-3 flex justify-between">
        <span>Tiền cọc (hoàn lại)</span>
        <b>{money(deposit)}</b>
      </div>
    </div>
  );
}
