import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface Repairer {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  repairer?: {
    businessName: string;
    postcode: string;
    isVerified: boolean;
  };
  createdAt: string;
}

export function RepairersPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-repairers'],
    queryFn: () => api.get<{ items: Repairer[] }>('/api/v1/admin/repairers'),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ userId, isVerified }: { userId: string; isVerified: boolean }) =>
      api.patch(`/api/v1/admin/repairers/${userId}`, { isVerified }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-repairers'] }),
  });

  const activateMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.patch(`/api/v1/admin/repairers/${userId}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-repairers'] }),
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Repairers</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !data?.items.length ? (
        <Card>
          <CardBody>
            <p className="text-center text-gray-500 py-8">No repairers registered.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Business</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Postcode</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">Verified</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">Active</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.userId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {r.repairer?.businessName ?? '-'}
                  </td>
                  <td className="py-3 px-4 text-gray-700">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="py-3 px-4 text-gray-700">{r.email}</td>
                  <td className="py-3 px-4 text-gray-700">{r.repairer?.postcode ?? '-'}</td>
                  <td className="py-3 px-4 text-center">
                    {r.repairer?.isVerified ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-red-600">No</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {r.isActive ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-red-600">No</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      {!r.repairer?.isVerified ? (
                        <Button
                          size="sm"
                          loading={verifyMutation.isPending}
                          onClick={() => verifyMutation.mutate({ userId: r.userId, isVerified: true })}
                        >
                          Verify
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={verifyMutation.isPending}
                          onClick={() => verifyMutation.mutate({ userId: r.userId, isVerified: false })}
                        >
                          Unverify
                        </Button>
                      )}
                      {r.isActive ? (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={activateMutation.isPending}
                          onClick={() => activateMutation.mutate({ userId: r.userId, isActive: false })}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={activateMutation.isPending}
                          onClick={() => activateMutation.mutate({ userId: r.userId, isActive: true })}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
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
