/**
 * Route table. Every page is code-split with React.lazy so the initial
 * bundle stays small on slow mobile networks.
 */
import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AdminLayout, DashboardLayout, PublicLayout } from "@/components/layout/Layouts";
import { RequireAuth, RequireRole } from "@/components/layout/Guards";

const p = <T,>(f: () => Promise<{ default: React.ComponentType<T> }>) => lazy(f);

// Public
const HomePage = p(() => import("@/pages/public/HomePage"));
const BrowsePage = p(() => import("@/pages/public/BrowsePage"));
const ListingPage = p(() => import("@/pages/public/ListingPage"));
const CheckoutPage = p(() => import("@/pages/public/CheckoutPage"));
const ProfilePage = p(() => import("@/pages/public/ProfilePage"));
const CitiesPage = p(() => import("@/pages/public/CitiesPage"));
const HowItWorksPage = p(() => import("@/pages/public/HowItWorksPage"));
const TrustPage = p(() => import("@/pages/public/TrustPage"));
const NotFoundPage = p(() => import("@/pages/public/NotFoundPage"));
// Auth
const LoginPage = p(() => import("@/pages/auth/LoginPage"));
const RegisterPage = p(() => import("@/pages/auth/RegisterPage"));
const ForgotPasswordPage = p(() => import("@/pages/auth/ForgotPasswordPage"));
const VerifyPhonePage = p(() => import("@/pages/auth/VerifyPhonePage"));
// Legal
const TermsPage = p(() => import("@/pages/legal/TermsPage"));
const PrivacyPage = p(() => import("@/pages/legal/PrivacyPage"));
const RentalAgreementPage = p(() => import("@/pages/legal/RentalAgreementPage"));
const RefundPolicyPage = p(() => import("@/pages/legal/RefundPolicyPage"));
// Dashboard
const OverviewPage = p(() => import("@/pages/dashboard/OverviewPage"));
const RentalsPage = p(() => import("@/pages/dashboard/RentalsPage"));
const OwnerBookingsPage = p(() => import("@/pages/dashboard/OwnerBookingsPage"));
const BookingDetailPage = p(() => import("@/pages/dashboard/BookingDetailPage"));
const MyListingsPage = p(() => import("@/pages/dashboard/MyListingsPage"));
const ListingFormPage = p(() => import("@/pages/dashboard/ListingFormPage"));
const ListingCalendarPage = p(() => import("@/pages/dashboard/ListingCalendarPage"));
const MessagesPage = p(() => import("@/pages/dashboard/MessagesPage"));
const EarningsPage = p(() => import("@/pages/dashboard/EarningsPage"));
const WishlistPage = p(() => import("@/pages/dashboard/WishlistPage"));
const NotificationsPage = p(() => import("@/pages/dashboard/NotificationsPage"));
const DisputesPage = p(() => import("@/pages/dashboard/DisputesPage"));
const DisputeDetailPage = p(() => import("@/pages/dashboard/DisputeDetailPage"));
const AnalyticsPage = p(() => import("@/pages/dashboard/AnalyticsPage"));
const ProPage = p(() => import("@/pages/dashboard/ProPage"));
const SettingsPage = p(() => import("@/pages/dashboard/SettingsPage"));
// Admin
const AdminDashboardPage = p(() => import("@/pages/admin/AdminDashboardPage"));
const AdminAnalyticsPage = p(() => import("@/pages/admin/AdminAnalyticsPage"));
const AdminUsersPage = p(() => import("@/pages/admin/AdminUsersPage"));
const AdminUserDetailPage = p(() => import("@/pages/admin/AdminUserDetailPage"));
const AdminKycPage = p(() => import("@/pages/admin/AdminKycPage"));
const AdminListingsPage = p(() => import("@/pages/admin/AdminListingsPage"));
const AdminBookingsPage = p(() => import("@/pages/admin/AdminBookingsPage"));
const AdminBookingDetailPage = p(() => import("@/pages/admin/AdminBookingDetailPage"));
const AdminDisputesPage = p(() => import("@/pages/admin/AdminDisputesPage"));
const AdminDisputeDetailPage = p(() => import("@/pages/admin/AdminDisputeDetailPage"));
const AdminPaymentsPage = p(() => import("@/pages/admin/AdminPaymentsPage"));
const AdminPayoutsPage = p(() => import("@/pages/admin/AdminPayoutsPage"));
const AdminTrustPage = p(() => import("@/pages/admin/AdminTrustPage"));
const AdminSettingsPage = p(() => import("@/pages/admin/AdminSettingsPage"));
const AdminCategoriesPage = p(() => import("@/pages/admin/AdminCategoriesPage"));
const AdminCitiesPage = p(() => import("@/pages/admin/AdminCitiesPage"));
const AdminReconciliationPage = p(() => import("@/pages/admin/AdminReconciliationPage"));
const AdminAuditPage = p(() => import("@/pages/admin/AdminAuditPage"));

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<BrowsePage />} />
        <Route path="rent/:city" element={<BrowsePage />} />
        <Route path="rent/:category/:city" element={<BrowsePage />} />
        <Route path="rent/:category/:city/:locality" element={<BrowsePage />} />
        <Route path="listing/:id/:slug?" element={<ListingPage />} />
        <Route path="checkout/:listingId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="users/:id" element={<ProfilePage />} />
        <Route path="cities" element={<CitiesPage />} />
        <Route path="how-it-works" element={<HowItWorksPage />} />
        <Route path="trust-and-safety" element={<TrustPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="verify-phone" element={<RequireAuth><VerifyPhonePage /></RequireAuth>} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="rental-agreement" element={<RentalAgreementPage />} />
        <Route path="refund-policy" element={<RefundPolicyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
        <Route index element={<OverviewPage />} />
        <Route path="rentals" element={<RentalsPage />} />
        <Route path="bookings" element={<OwnerBookingsPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="listings" element={<MyListingsPage />} />
        <Route path="listings/new" element={<ListingFormPage />} />
        <Route path="listings/:id/edit" element={<ListingFormPage />} />
        <Route path="listings/:id/calendar" element={<ListingCalendarPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:id" element={<MessagesPage />} />
        <Route path="earnings" element={<EarningsPage />} />
        <Route path="wishlist" element={<WishlistPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="disputes/:id" element={<DisputeDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="pro" element={<ProPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="admin" element={<RequireRole roles={["ADMIN", "SUPPORT"]}><AdminLayout /></RequireRole>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:id" element={<AdminUserDetailPage />} />
        <Route path="kyc" element={<AdminKycPage />} />
        <Route path="listings" element={<AdminListingsPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="bookings/:id" element={<AdminBookingDetailPage />} />
        <Route path="disputes" element={<AdminDisputesPage />} />
        <Route path="disputes/:id" element={<AdminDisputeDetailPage />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="payouts" element={<AdminPayoutsPage />} />
        <Route path="trust" element={<AdminTrustPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="cities" element={<AdminCitiesPage />} />
        <Route path="reconciliation" element={<AdminReconciliationPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
      </Route>
    </Routes>
  );
}
