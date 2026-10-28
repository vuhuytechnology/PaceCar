import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ToastProvider, Layout } from "./components/UI";
import { useAuth } from "./auth/AuthContext";
import {
  FavoritesPage,
  MyBookings,
  Profile,
  RiskAlerts,
} from "./pages/Management";
import {
  AdminCarApprovals,
  CarListingWizard,
  OwnerCarsPage,
} from "./pages/Listing";
import AdminPromotions from "./pages/AdminPromotions";
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
      </Layout>
    </ToastProvider>
  );
}
