import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import type { DamagePanel } from '@corexpert/core';

interface JobFullDetails {
  jobId: string;
  status: string;
  caseId: string;
  vehicle: { registrationNo: string; make: string; model: string; year: number; colour: string };
  customer: { name: string; postcode: string; phone?: string; email?: string };
  panels: DamagePanel[];
  totalEstimatedCost: number;
  images: { imageType: string; url: string }[];
  acceptedAt: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function JobDetailsPage() {
  const { jobId } = useParams<{ jobId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['job-details', jobId],
    queryFn: () => api.get<JobFullDetails>(`/api/v1/jobs/${jobId}/details`),
    enabled: !!jobId,
    // An unpaid job stays unpaid until the repairer acts; retrying just delays
    // the prompt to pay.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  if (isLoading) {
    return <Layout><div className="text-center py-12 text-gray-500">Loading details...</div></Layout>;
  }

  // Not a failure: the job is accepted but the introduction fee is outstanding,
  // so send the repairer back to the job page to complete checkout.
  if (error instanceof ApiError && error.code === 'PAYMENT_REQUIRED') {
    return (
      <Layout>
        <div className="max-w-lg mx-auto text-center py-12">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Payment outstanding</h1>
          <p className="text-gray-600 mb-6">
            You've accepted this job, but the introduction fee hasn't been paid yet.
            Full customer and damage details unlock once payment completes.
          </p>
          <Link
            to={`/jobs/${jobId}`}
            className="inline-block bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-emerald-700"
          >
            Complete payment
          </Link>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="text-center py-12 text-red-500">
          {error instanceof Error ? error.message : 'Details not available'}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Job Details - {data.vehicle.make} {data.vehicle.model}
        </h1>

        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Customer Information</h2></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Name:</span>{' '}
                <span className="font-medium">{data.customer.name}</span>
              </div>
              <div>
                <span className="text-gray-500">Postcode:</span>{' '}
                <span className="font-medium">{data.customer.postcode}</span>
              </div>
              {data.customer.phone && (
                <div>
                  <span className="text-gray-500">Phone:</span>{' '}
                  <a href={`tel:${data.customer.phone}`} className="font-medium text-emerald-600">
                    {data.customer.phone}
                  </a>
                </div>
              )}
              {data.customer.email && (
                <div>
                  <span className="text-gray-500">Email:</span>{' '}
                  <a href={`mailto:${data.customer.email}`} className="font-medium text-emerald-600">
                    {data.customer.email}
                  </a>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Vehicle</h2></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Registration:</span>{' '}
                <span className="font-medium">{data.vehicle.registrationNo}</span>
              </div>
              <div>
                <span className="text-gray-500">Colour:</span>{' '}
                <span className="font-medium">{data.vehicle.colour}</span>
              </div>
              <div>
                <span className="text-gray-500">Make/Model:</span>{' '}
                <span className="font-medium">{data.vehicle.make} {data.vehicle.model}</span>
              </div>
              <div>
                <span className="text-gray-500">Year:</span>{' '}
                <span className="font-medium">{data.vehicle.year}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {data.images.length > 0 && (
          <Card className="mb-6">
            <CardHeader><h2 className="font-semibold">Damage Images</h2></CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-4">
                {data.images.map((img, i) => (
                  <div key={i}>
                    <img
                      src={img.url}
                      alt={img.imageType.replace(/_/g, ' ')}
                      className="w-full rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1 text-center">
                      {img.imageType.replace(/_/g, ' ')}
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Damage Breakdown</h2>
              <span className="text-lg font-bold text-gray-900">
                Total: {formatPence(data.totalEstimatedCost)}
              </span>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {data.panels.map((panel, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {panel.panelName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-sm text-gray-500">{panel.description}</p>
                  </div>
                  {panel.sizeEstimateCm !== undefined && (
                    <span className="text-sm text-gray-500">~{panel.sizeEstimateCm}cm</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{panel.damageType.replace(/_/g, ' ')}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{panel.severity}</span>
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                    {panel.repairMethod.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
