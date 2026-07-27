import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { InfoTip } from '../components/ui/InfoTip';
import { INDICATIVE_COST_DISCLAIMER } from '../lib/copy';

interface JobSummary {
  jobId: string;
  status: string;
  vehicleSummary: { make: string; model: string; year: number; vehicleSize: string };
  damageSummary: string;
  indicativeCost: number;
  introductionFee: number;
  repairMethods: string[];
  location: { postcode: string; area: string };
  publishedAt: string;
  expiresAt: string;
  images: { imageType: string; url: string }[];
}

interface AcceptResponse {
  checkoutUrl: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [acceptError, setAcceptError] = useState('');

  const { data: job, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<JobSummary>(`/api/v1/jobs/${jobId}`),
    enabled: !!jobId,
  });

  const acceptMutation = useMutation({
    mutationFn: () => api.post<AcceptResponse>(`/api/v1/jobs/${jobId}/accept`),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        navigate('/my-jobs');
      }
    },
    onError: (err) => {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept job');
    },
  });

  if (isLoading) {
    return <Layout><div className="text-center py-12 text-gray-500">Loading job...</div></Layout>;
  }

  if (error || !job) {
    return (
      <Layout>
        <div className="text-center py-12 text-red-500">
          {error instanceof Error ? error.message : 'Job not found'}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {job.vehicleSummary.year} {job.vehicleSummary.make} {job.vehicleSummary.model}
            </h1>
            <p className="text-gray-500">{job.location.area}</p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        {job.images && job.images.length > 0 && (
          <Card className="mb-6">
            <CardHeader><h2 className="font-semibold">Damage Photos</h2></CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-3">
                {job.images.map((img, i) => (
                  <div key={i}>
                    <img
                      src={img.url}
                      alt={img.imageType.replace(/_/g, ' ')}
                      className="rounded-lg w-full h-48 object-cover bg-gray-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">{img.imageType.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Damage Summary</h2></CardHeader>
          <CardBody>
            <p className="text-gray-700 mb-4">{job.damageSummary}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Indicative cost<InfoTip text={INDICATIVE_COST_DISCLAIMER} /></p>
                <p className="text-xl font-bold text-gray-900">{formatPence(job.indicativeCost)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Introduction fee</p>
                <p className="text-xl font-bold text-emerald-600">{formatPence(job.introductionFee)}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Vehicle Details</h2></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Make:</span>{' '}
                <span className="font-medium">{job.vehicleSummary.make}</span>
              </div>
              <div>
                <span className="text-gray-500">Model:</span>{' '}
                <span className="font-medium">{job.vehicleSummary.model}</span>
              </div>
              <div>
                <span className="text-gray-500">Year:</span>{' '}
                <span className="font-medium">{job.vehicleSummary.year}</span>
              </div>
              <div>
                <span className="text-gray-500">Size:</span>{' '}
                <span className="font-medium">{job.vehicleSummary.vehicleSize}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Repair Methods Required</h2></CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {job.repairMethods.map((method) => (
                <span
                  key={method}
                  className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-sm"
                >
                  {method.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>

        {job.status === 'OPEN' && (
          <div className="text-center">
            {acceptError && <p className="text-sm text-red-600 mb-3">{acceptError}</p>}
            <p className="text-sm text-gray-500 mb-4">
              Accepting this job will redirect you to pay the {formatPence(job.introductionFee)} introduction fee.
              After payment, you'll receive the full customer and damage details.
            </p>
            <Button
              size="lg"
              loading={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
            >
              Accept Job
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
