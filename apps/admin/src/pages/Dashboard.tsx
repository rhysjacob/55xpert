import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface DashboardStats {
  totalCases: number;
  totalJobs: number;
  totalUsers: number;
  totalPayments: number;
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/api/v1/admin/dashboard'),
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {isLoading ? (
        <p className="text-gray-500">Loading stats...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardBody>
                <p className="text-3xl font-bold text-indigo-600">{data?.totalCases ?? 0}</p>
                <p className="text-sm text-gray-500">Total Cases</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-3xl font-bold text-green-600">{data?.totalJobs ?? 0}</p>
                <p className="text-sm text-gray-500">Total Jobs</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-3xl font-bold text-blue-600">{data?.totalUsers ?? 0}</p>
                <p className="text-sm text-gray-500">Total Users</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-3xl font-bold text-yellow-600">{data?.totalPayments ?? 0}</p>
                <p className="text-sm text-gray-500">Total Payments</p>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/cases">
              <Card className="hover:shadow-md transition-shadow">
                <CardBody className="text-center py-6">
                  <p className="font-semibold text-gray-900">Manage Cases</p>
                  <p className="text-sm text-gray-500 mt-1">View and filter all cases</p>
                </CardBody>
              </Card>
            </Link>
            <Link to="/xpert/queue">
              <Card className="hover:shadow-md transition-shadow">
                <CardBody className="text-center py-6">
                  <p className="font-semibold text-gray-900">Xpert Queue</p>
                  <p className="text-sm text-gray-500 mt-1">Cases requiring expert review</p>
                </CardBody>
              </Card>
            </Link>
            <Link to="/repairers">
              <Card className="hover:shadow-md transition-shadow">
                <CardBody className="text-center py-6">
                  <p className="font-semibold text-gray-900">Manage Repairers</p>
                  <p className="text-sm text-gray-500 mt-1">Verify and manage repairers</p>
                </CardBody>
              </Card>
            </Link>
          </div>
        </>
      )}
    </Layout>
  );
}
