import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useBrand } from '../../branding/useBrand';
import { BrandWatermark } from '../../branding/BrandMotif';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const brand = useBrand();

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  const dark = brand.navTheme === 'dark';
  const navLogo = (dark && brand.logoUrlOnDark) || brand.logoUrl;

  return (
    // `isolate` so the watermark's negative z-index puts it above this element's
    // own background but still behind the nav and content.
    <div className="relative isolate min-h-screen bg-app">
      <BrandWatermark />
      <nav
        className={dark ? 'bg-brand' : 'bg-white border-b border-gray-200'}
        style={dark ? { backgroundColor: 'var(--brand-primary)' } : undefined}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <Link
              to="/"
              className={`flex items-center gap-2 text-xl font-bold ${dark ? 'text-white' : 'text-brand'}`}
            >
              {navLogo && (
                <img
                  src={navLogo}
                  alt={brand.logoIsLockup ? brand.name : ''}
                  className={brand.logoIsLockup ? 'h-14 w-auto' : 'h-12 w-12 object-contain'}
                />
              )}
              {!brand.logoIsLockup && (
                <span>
                  {brand.name}
                  {brand.nameAccent && (
                    <span className="font-normal text-gray-400"> {brand.nameAccent}</span>
                  )}
                </span>
              )}
            </Link>
            {user && (
              <div className="flex items-center gap-4">
                <span className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className={`text-sm ${
                    dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {/* The one place their colour appears: a hairline of the mark's gradient. */}
        {dark && <div className="h-0.5 bg-brand-gradient" />}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const brand = useBrand();

  // On a gradient field the black lockup disappears, so use the reversed-out
  // one — the same swap the dark nav makes.
  const onGradient = brand.surface === 'gradient';
  const logo = (onGradient && brand.logoUrlOnDark) || brand.logoUrl;

  return (
    <div className="relative isolate min-h-screen bg-app flex flex-col items-center justify-center px-4 py-12">
      <BrandWatermark />
      <div className="mb-8 text-center">
        {logo && (
          <img
            src={logo}
            alt={brand.logoIsLockup ? brand.name : ''}
            className={
              brand.logoIsLockup
                ? 'mx-auto h-24 w-auto max-w-full'
                : 'mx-auto mb-4 h-44 w-44 object-contain'
            }
          />
        )}
        {/* A lockup already carries the name, and the strapline under it reads
            as marketing copy on what is really a sign-in form — so a lockup
            brand gets the mark alone. */}
        {!brand.logoIsLockup && (
          <>
            <h1 className={`text-3xl font-bold ${onGradient ? 'text-white' : 'text-brand'}`}>
              {brand.name}
            </h1>
            <p className="text-on-app-muted mt-1">{brand.tagline}</p>
          </>
        )}
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
