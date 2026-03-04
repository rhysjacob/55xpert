import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { AuthLayout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';

export function ForgotPasswordPage() {
  const { resetPassword, confirmResetPassword } = useAuth();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword({ username: email });
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
      setSuccess('Password reset! You can now sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardBody>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Reset your password</h2>
          {success ? (
            <div>
              <p className="text-sm text-green-600 mb-4">{success}</p>
              <Link to="/sign-in" className="text-emerald-600 hover:underline text-sm">
                Back to sign in
              </Link>
            </div>
          ) : step === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                Send reset code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-4">
              <Input
                label="Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="6-digit code"
              />
              <Input
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                Reset password
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
