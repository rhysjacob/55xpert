import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useBrand } from '../../branding/useBrand';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const brand = useBrand();

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-brand">
              {brand.logoUrl && (
                <img src={brand.logoUrl} alt="" className="h-12 w-12 object-contain" />
              )}
              <span>
                {brand.name}
                {brand.nameAccent && (
                  <span className="font-normal text-gray-400"> {brand.nameAccent}</span>
                )}
              </span>
            </Link>
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
  const brand = useBrand();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt="" className="mx-auto mb-4 h-44 w-44 object-contain" />
        )}
        <h1 className="text-3xl font-bold text-brand">{brand.name}</h1>
        <p className="text-gray-500 mt-1">{brand.tagline}</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
