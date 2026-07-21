import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SignInPage } from './pages/SignIn';
import { SignUpPage } from './pages/SignUp';
import { ConfirmSignUpPage } from './pages/ConfirmSignUp';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { DashboardPage } from './pages/Dashboard';
import { AvailableJobsPage } from './pages/AvailableJobs';
import { JobDetailPage } from './pages/JobDetail';
import { JobDetailsPage } from './pages/JobDetails';
import { MyJobsPage } from './pages/MyJobs';
import { ProfilePage } from './pages/Profile';
import { PreferencesPage } from './pages/Preferences';

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
            {/* Public auth routes */}
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/confirm" element={<ConfirmSignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected repairer routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/jobs" element={<AvailableJobsPage />} />
              <Route path="/jobs/:jobId" element={<JobDetailPage />} />
              <Route path="/jobs/:jobId/details" element={<JobDetailsPage />} />
              <Route path="/my-jobs" element={<MyJobsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/preferences" element={<PreferencesPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
