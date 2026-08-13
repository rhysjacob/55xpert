import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { AuthLayout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';

export function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: firstName,
            family_name: lastName,
          },
        },
      });
      navigate(`/confirm?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardBody>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Create your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Min 8 chars, upper + lower + digit"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Create account
            </Button>
          </form>
          <p className="mt-4 text-sm text-center text-gray-500">
            Already have an account?{' '}
            <Link to="/sign-in" className="text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </CardBody>
      </Card>
    </AuthLayout>
  );
}
