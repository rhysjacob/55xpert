import { useSearchParams } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { isSubscriptionActive, type SubscriptionStatus } from '@corexpert/core';

interface ProfileResponse {
  repairer?: { subscriptionStatus?: SubscriptionStatus; stripeCustomerId?: string };
}

/** Redirect the browser to a Stripe-hosted URL returned by the API. */
function useRedirectMutation(path: string, pick: (d: { checkoutUrl?: string; url?: string }) => string | undefined) {
  return useMutation({
    mutationFn: () => api.post<{ checkoutUrl?: string; url?: string }>(path),
    onSuccess: (data) => {
      const url = pick(data);
      if (url) window.location.href = url;
    },
  });
}

export function BillingPage() {
  const [params] = useSearchParams();
  const returned = params.get('status'); // success | cancelled (from Checkout)

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<ProfileResponse>('/api/v1/repairer/profile'),
  });

  const subscribe = useRedirectMutation('/api/v1/repairer/subscription', (d) => d.checkoutUrl);
  const manage = useRedirectMutation('/api/v1/repairer/billing-portal', (d) => d.url);

  const status = data?.repairer?.subscriptionStatus;
  const active = isSubscriptionActive(status);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

        {returned === 'success' && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">
            Subscription started — welcome aboard. Your card is saved and the first
            payment is on the 1st.
          </div>
        )}
        {returned === 'cancelled' && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
            Checkout cancelled — you can subscribe whenever you're ready.
          </div>
        )}

        <Card>
          <CardHeader><h2 className="font-semibold">Subscription</h2></CardHeader>
          <CardBody>
            {isLoading ? (
              <p className="text-gray-500">Loading…</p>
            ) : active ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-medium text-gray-900">Active</span>
                  {status && status !== 'active' && (
                    <span className="text-xs text-gray-500">({status})</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  £60/month. Manage your card, view invoices, or cancel in the Stripe
                  billing portal.
                </p>
                <Button onClick={() => manage.mutate()} loading={manage.isPending}>
                  Manage billing
                </Button>
              </>
            ) : (
              <>
                <p className="text-gray-700 mb-1">
                  Subscribe to accept jobs on The Repair Xchange.
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {status === 'past_due' || status === 'unpaid'
                    ? 'Your last payment failed — resubscribe to continue accepting jobs.'
                    : '£60/month. Start now and the rest of this month is free — your first payment is on the 1st.'}
                </p>
                <Button onClick={() => subscribe.mutate()} loading={subscribe.isPending}>
                  Subscribe — £60/month
                </Button>
              </>
            )}
            {(subscribe.error || manage.error) && (
              <p className="text-sm text-red-600 mt-3">
                {(subscribe.error ?? manage.error) instanceof Error
                  ? (subscribe.error ?? (manage.error as Error)).message
                  : 'Something went wrong'}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
