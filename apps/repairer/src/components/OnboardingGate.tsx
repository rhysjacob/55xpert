import { Navigate, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface OrgResponse {
  organisation?: { onboarding?: { completedAt?: string } };
}

/**
 * Funnels a repairer whose organisation hasn't completed onboarding into the
 * wizard. A legacy account with no organisation (the endpoint 404s) is left
 * alone — it isn't forced through onboarding. Wrap the protected app pages with
 * this, but NOT /onboarding itself (that would loop).
 */
export function OnboardingGate() {
  const location = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['repairer-org'],
    queryFn: () => api.get<OrgResponse>('/api/v1/repairer/organisation'),
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) return null; // ProtectedRoute already showed a loader

  const org = isError ? undefined : data?.organisation;
  const needsOnboarding = !!org && !org.onboarding?.completedAt;
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}
