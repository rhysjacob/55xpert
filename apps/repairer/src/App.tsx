import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OnboardingGate } from './components/OnboardingGate';
import { OnboardingPage } from './pages/Onboarding';
import { SignInPage } from './pages/SignIn';
import { SignUpPage } from './pages/SignUp';
import { ConfirmSignUpPage } from './pages/ConfirmSignUp';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { DashboardPage } from './pages/Dashboard';
import { AvailableJobsPage } from './pages/AvailableJobs';
import { JobDetailPage } from './pages/JobDetail';
import { JobDetailsPage } from './pages/JobDetails';
import { MyJobsPage } from './pages/MyJobs';
import { MIPage } from './pages/MI';
import { ProfilePage } from './pages/Profile';
import { PreferencesPage } from './pages/Preferences';
import { BillingPage } from './pages/Billing';
import { LandingPage } from './pages/marketing/Landing';
import { AboutPage } from './pages/marketing/About';
import { PartnershipsPage } from './pages/marketing/Partnerships';
import { ForRepairersPage } from './pages/marketing/ForRepairers';
import { ForCustomersPage } from './pages/marketing/ForCustomers';
import { LearnMorePage } from './pages/marketing/LearnMore';
import { RegisterInterestPage } from './pages/marketing/RegisterInterest';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public marketing site */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/partnerships" element={<PartnershipsPage />} />
            <Route path="/for-repairers" element={<ForRepairersPage />} />
            <Route path="/for-customers" element={<ForCustomersPage />} />
            <Route path="/learn-more" element={<LearnMorePage />} />
            <Route path="/register-interest" element={<RegisterInterestPage />} />

            {/* Public auth routes */}
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/confirm" element={<ConfirmSignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected repairer app */}
            <Route element={<ProtectedRoute />}>
              {/* Onboarding is protected but NOT behind the gate (would loop). */}
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route element={<OnboardingGate />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/jobs" element={<AvailableJobsPage />} />
                <Route path="/jobs/:jobId" element={<JobDetailPage />} />
                <Route path="/jobs/:jobId/details" element={<JobDetailsPage />} />
                <Route path="/my-jobs" element={<MyJobsPage />} />
                <Route path="/mi" element={<MIPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/preferences" element={<PreferencesPage />} />
                <Route path="/billing" element={<BillingPage />} />
              </Route>
            </Route>

            {/* Catch-all: never render a blank page on an unknown path. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
