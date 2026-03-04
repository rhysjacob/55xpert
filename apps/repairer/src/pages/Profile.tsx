import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface RepairerProfile {
  businessName: string;
  contactName: string;
  phone: string;
  address: string;
  postcode: string;
  isVerified: boolean;
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [success, setSuccess] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<RepairerProfile>('/api/v1/repairer/profile'),
  });

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.businessName ?? '');
      setContactName(profile.contactName ?? '');
      setPhone(profile.phone ?? '');
      setAddress(profile.address ?? '');
      setPostcode(profile.postcode ?? '');
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (data: Partial<RepairerProfile>) =>
      api.put('/api/v1/repairer/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSuccess('Profile updated successfully.');
      setTimeout(() => setSuccess(''), 3000);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ businessName, contactName, phone, address, postcode });
  };

  if (isLoading) {
    return <Layout><div className="text-center py-12 text-gray-500">Loading profile...</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Business Profile</h1>

        {profile?.isVerified === false && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              Your account is pending verification. You'll be able to accept jobs once an admin verifies your business.
            </p>
          </div>
        )}

        <Card>
          <CardHeader><h2 className="font-semibold">Business Details</h2></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Business name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
              <Input
                label="Contact name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
              <Input
                label="Phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <Input
                label="Postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                required
              />

              {mutation.isError && (
                <p className="text-sm text-red-600">
                  {mutation.error instanceof Error ? mutation.error.message : 'Update failed'}
                </p>
              )}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <Button type="submit" loading={mutation.isPending}>
                Save changes
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
