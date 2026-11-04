import React, { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ToastProvider, Layout } from "./components/UI";
import { useAuth } from "./auth/AuthContext";
import {
  Landing,
  HelpCenter,
  Cars,
  CarDetail,
  Login,
  Register,
  VerifyEmail,
  LegalInformation,
  Booking,
  RenterDashboard,
  OwnerDashboard,
  AdminDashboard,
  Contract,
  Evidence,
  Dispute,
  NotFound,
} from "./pages";

const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminDisputes = lazy(() => import("./pages/AdminDisputes"));
const AdminPromotions = lazy(() => import("./pages/AdminPromotions"));
const lazyNamed = (loader, name) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));
const FavoritesPage = lazyNamed(
  () => import("./pages/Management"),
  "FavoritesPage",
);
const MyBookings = lazyNamed(() => import("./pages/Management"), "MyBookings");
const Profile = lazyNamed(() => import("./pages/Management"), "Profile");
const RiskAlerts = lazyNamed(() => import("./pages/Management"), "RiskAlerts");
const AdminCarApprovals = lazyNamed(
  () => import("./pages/Listing"),
  "AdminCarApprovals",
);
const CarListingWizard = lazyNamed(
  () => import("./pages/Listing"),
  "CarListingWizard",
);
const OwnerCarsPage = lazyNamed(() => import("./pages/Listing"), "OwnerCarsPage");

function AnalyticsTracker() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    fetch("/api/analytics/page-view", { method: "POST", keepalive: true }).then(
      (response) => {
        if (!response.ok)
          console.warn("Could not record page view:", response.status);
      },
    ).catch((error) => console.warn("Could not record page view:", error));
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const recordActivity = () => {
      if (document.visibilityState !== "visible") return;
      const token = localStorage.getItem("pacecar-token");
      if (!token) return;
      fetch("/api/analytics/activity", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).then((response) => {
        if (!response.ok && response.status !== 401)
          console.warn("Could not record user activity:", response.status);
      }).catch((error) =>
        console.warn("Could not record user activity:", error),
      );
    };
    recordActivity();
    const interval = window.setInterval(recordActivity, 60_000);
    document.addEventListener("visibilitychange", recordActivity);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", recordActivity);
    };
  }, [user?.id]);

  return null;
}
function RequireRole({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  const allowed = Array.isArray(role)
    ? role.includes(user.role)
    : user.role === role;
  if (role && !allowed)
    return <Navigate to={`/dashboard/${user.role}`} replace />;
  return children;
}
export default function App() {
  return (
    <ToastProvider>
      <Layout>
        <AnalyticsTracker />
        <Suspense
          fallback={
            <div className="container-app grid min-h-[40vh] place-items-center py-12 text-sm text-slate-500">
              Đang tải màn hình...
            </div>
          }
        >
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/cars" element={<Cars />} />
          <Route path="/cars/:id" element={<CarDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/terms" element={<LegalInformation />} />
          <Route path="/privacy" element={<LegalInformation />} />
          <Route path="/booking/:carId" element={<Booking />} />
          <Route
            path="/dashboard/renter"
            element={
              <RequireRole role="renter">
                <RenterDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/dashboard/owner"
            element={
              <RequireRole role="owner">
                <OwnerDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/dashboard/admin"
            element={
              <RequireRole role="admin">
                <AdminDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/bookings"
            element={
              <RequireRole>
                <MyBookings />
              </RequireRole>
            }
          />
          <Route
            path="/owner/cars"
            element={
              <RequireRole role="owner">
                <OwnerCarsPage />
              </RequireRole>
            }
          />
          <Route
            path="/owner/cars/new"
            element={
              <RequireRole role="owner">
                <CarListingWizard />
              </RequireRole>
            }
          />
          <Route
            path="/owner/cars/:id/edit"
            element={
              <RequireRole role="owner">
                <CarListingWizard />
              </RequireRole>
            }
          />
          <Route
            path="/admin/car-approvals"
            element={
              <RequireRole role="admin">
                <AdminCarApprovals />
              </RequireRole>
            }
          />
          <Route
            path="/admin/promotions"
            element={
              <RequireRole role="admin">
                <AdminPromotions />
              </RequireRole>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <RequireRole role="admin">
                <AdminAnalytics />
              </RequireRole>
            }
          />
          <Route
            path="/admin/disputes"
            element={
              <RequireRole role="admin">
                <AdminDisputes />
              </RequireRole>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireRole>
                <Profile />
              </RequireRole>
            }
          />
          <Route
            path="/risk-alerts"
            element={
              <RequireRole role={["owner", "admin"]}>
                <RiskAlerts />
              </RequireRole>
            }
          />
          <Route
            path="/favorites"
            element={
              <RequireRole>
                <FavoritesPage />
              </RequireRole>
            }
          />
          <Route
            path="/contract/:bookingId"
            element={
              <RequireRole>
                <Contract />
              </RequireRole>
            }
          />
          <Route
            path="/evidence/:bookingId"
            element={
              <RequireRole>
                <Evidence />
              </RequireRole>
            }
          />
          <Route
            path="/disputes/:bookingId"
            element={
              <RequireRole>
                <Dispute />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </Layout>
    </ToastProvider>
  );
}
