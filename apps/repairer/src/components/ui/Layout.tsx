import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="text-xl font-bold text-emerald-600">
                Repair XChange
              </Link>
              <div className="hidden sm:flex gap-4">
                <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
                <Link to="/jobs" className="text-sm text-gray-600 hover:text-gray-900">Available Jobs</Link>
                <Link to="/my-jobs" className="text-sm text-gray-600 hover:text-gray-900">My Jobs</Link>
                <Link to="/profile" className="text-sm text-gray-600 hover:text-gray-900">Profile</Link>
              </div>
            </div>
            {user && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-emerald-600">Repair XChange</h1>
        <p className="text-gray-500 mt-1">Repairer Portal</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
