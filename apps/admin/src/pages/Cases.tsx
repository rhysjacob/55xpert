import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';

interface CaseItem {
  caseId: string;
  referenceNo: string;
  status: string;
  vehicle?: { make?: string; model?: string; year?: number };
  createdAt: string;
  triageResult?: { totalEstimatedCost?: number };
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

const STATUSES = [
  '', 'DRAFT', 'IMAGES_UPLOADED', 'TRIAGE_PENDING', 'TRIAGE_COMPLETE',
  'XPERT_REVIEW', 'PUBLISHED', 'ACCEPTED', 'COMPLETED', 'CANCELLED',
];

export function CasesPage() {
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-cases', statusFilter],
    queryFn: () =>
      api.get<{ items: CaseItem[] }>(
        `/api/v1/admin/cases${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
  });

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Cases</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading cases...</p>
      ) : !data?.items.length ? (
        <Card>
          <CardBody>
            <p className="text-center text-gray-500 py-8">No cases found.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Reference</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Vehicle</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Est. Cost</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.caseId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <Link to={`/cases/${c.caseId}`} className="text-indigo-600 hover:underline">
                      {c.referenceNo}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-700">
                    {c.vehicle ? `${c.vehicle.make} ${c.vehicle.model}` : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {c.triageResult?.totalEstimatedCost
                      ? formatPence(c.triageResult.totalEstimatedCost)
                      : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
