import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';

const NAV = [
  // `end` so the Dashboard link isn't active on every route.
  { to: '/', label: 'Dashboard', end: true },
  { to: '/mi', label: 'MI' },
  { to: '/coverage', label: 'Coverage' },
  { to: '/cases', label: 'Cases' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/repairers', label: 'Repairers' },
  { to: '/complaints', label: 'Complaints' },
  { to: '/queries', label: 'Queries' },
  { to: '/xpert/queue', label: 'Xpert Queue' },
  { to: '/settings/model', label: 'Model' },
  { to: '/settings/rules', label: 'Companies' },
  { to: '/networks', label: 'Networks' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  // Navigating away should dismiss the menu — otherwise it stays open over the
  // page the user just chose.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <Link to="/" className="text-xl font-bold text-indigo-600 whitespace-nowrap">
                Repair XChange <span className="font-normal text-gray-400">Admin</span>
              </Link>
              {/* Twelve links only fit once the viewport is genuinely wide; below
                  that they collapse into the menu button on the right. */}
              <div className="hidden xl:flex gap-4">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      `text-sm whitespace-nowrap ${
                        isActive ? 'text-indigo-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user && (
                <div className="hidden xl:flex items-center gap-4 min-w-0">
                  <span className="text-sm text-gray-600 truncate max-w-[220px]" title={user.email}>
                    {user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
                  >
                    Sign out
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-controls="admin-mobile-menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                className="xl:hidden -mr-2 inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div id="admin-mobile-menu" className="xl:hidden border-t border-gray-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-base ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
            {user && (
              <div className="border-t border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600 truncate" title={user.email}>
                    {user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
        <h1 className="text-3xl font-bold text-indigo-600">Repair XChange</h1>
        <p className="text-gray-500 mt-1">Admin</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
