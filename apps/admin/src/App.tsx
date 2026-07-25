import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SignInPage } from './pages/SignIn';
import { DashboardPage } from './pages/Dashboard';
import { MIPage } from './pages/MI';
import { CoveragePage } from './pages/Coverage';
import { CasesPage } from './pages/Cases';
import { CaseDetailPage } from './pages/CaseDetail';
import { JobsPage } from './pages/Jobs';
import { RepairersPage } from './pages/Repairers';
import { XpertQueuePage } from './pages/XpertQueue';
import { XpertReviewPage } from './pages/XpertReview';
import { ModelConfigPage } from './pages/ModelConfig';

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
            {/* Public auth route */}
            <Route path="/sign-in" element={<SignInPage />} />

            {/* Protected admin/xpert routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/mi" element={<MIPage />} />
              <Route path="/coverage" element={<CoveragePage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/cases/:caseId" element={<CaseDetailPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/repairers" element={<RepairersPage />} />
              <Route path="/xpert/queue" element={<XpertQueuePage />} />
              <Route path="/xpert/cases/:caseId" element={<XpertReviewPage />} />
              <Route path="/settings/model" element={<ModelConfigPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
