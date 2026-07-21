import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { AuthLayout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';

export function ConfirmSignUpPage() {
  const { confirmSignUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await confirmSignUp({ username: emailParam, confirmationCode: code });
      navigate('/sign-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardBody>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Verify your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            We sent a code to <strong>{emailParam}</strong>
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Confirmation code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="6-digit code"
              autoComplete="one-time-code"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Verify
            </Button>
          </form>
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
