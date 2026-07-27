import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { DamagePanel } from '@corexpert/core';

interface JobQuery {
  queryId: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  question: string;
  response?: string;
  createdAt: string;
  answeredAt?: string;
}

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

        <ExpertQuerySection jobId={data.jobId} />
      </div>
    </Layout>
  );
}

/**
 * "Raise a question / refer to an expert" (TRX-57) — the deliberate
 * get-out-of-jail flow on an accepted job. Not a reject: the match fee stands;
 * an Xpert helps. Shows the thread + any expert replies.
 */
function ExpertQuerySection({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['job-queries', jobId],
    queryFn: () => api.get<{ items: JobQuery[] }>(`/api/v1/repairer/jobs/${jobId}/queries`),
  });
  const items = data?.items ?? [];

  const raise = useMutation({
    mutationFn: () => api.post(`/api/v1/repairer/jobs/${jobId}/queries`, { question }),
    onSuccess: () => { setQuestion(''); setOpen(false); void qc.invalidateQueries({ queryKey: ['job-queries', jobId] }); },
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Need a hand with this job?</h2>
          {!open && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Refer to an expert</Button>}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Spotted something that doesn't add up — hidden damage, a sensor behind a panel, a tricky spec?
          Raise it with one of our experts rather than walking away. You keep the job and the match fee
          stands; we'll help you get it done.
        </p>

        {open && (
          <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) raise.mutate(); }} className="space-y-2">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={4000} required
              placeholder="Describe what you'd like an expert to look at…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" loading={raise.isPending} disabled={!question.trim()}>Send to an expert</Button>
            </div>
            {raise.isError && <p className="text-sm text-red-600">Couldn't send — please try again.</p>}
          </form>
        )}

        {items.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {items.map((q) => (
              <div key={q.queryId} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${q.status === 'ANSWERED' ? 'bg-emerald-100 text-emerald-800' : q.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-800'}`}>{q.status}</span>
                  <span className="text-xs text-gray-400">{new Date(q.createdAt).toLocaleString('en-GB')}</span>
                </div>
                <p className="text-gray-700 mt-1 whitespace-pre-wrap"><span className="text-gray-400">You:</span> {q.question}</p>
                {q.response && <p className="text-gray-800 mt-1 whitespace-pre-wrap bg-emerald-50 rounded-lg px-3 py-2"><span className="text-emerald-700 font-medium">Expert:</span> {q.response}</p>}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
