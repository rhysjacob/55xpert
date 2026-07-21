import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

const NAV = [
  { to: '/about', label: 'About us' },
  { to: '/partnerships', label: 'Group partnerships' },
  { to: '/for-repairers', label: 'For repairers' },
  { to: '/for-customers', label: 'For customers' },
];

/** Public marketing chrome: brand nav + footer, wrapping the unauthenticated site. */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-emerald-600 whitespace-nowrap">
            Repair XChange
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'text-emerald-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">
              Sign in
            </Link>
            <Link
              to="/sign-up"
              className="text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <p className="text-lg font-bold text-emerald-600">Repair XChange</p>
            <p className="text-gray-500 mt-2">Creating the perfect match — deploy, match, repair.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Company</p>
            <ul className="space-y-1 text-gray-600">
              <li><Link to="/about" className="hover:text-gray-900">About us</Link></li>
              <li><Link to="/partnerships" className="hover:text-gray-900">Group partnerships</Link></li>
              <li><Link to="/learn-more" className="hover:text-gray-900">Learn more</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Get involved</p>
            <ul className="space-y-1 text-gray-600">
              <li><Link to="/for-repairers" className="hover:text-gray-900">For repairers</Link></li>
              <li><Link to="/for-customers" className="hover:text-gray-900">For customers</Link></li>
              <li><Link to="/sign-up" className="hover:text-gray-900">Register your business</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Talk to us</p>
            <p className="text-gray-600">
              Want to learn more?{' '}
              <Link to="/learn-more" className="text-emerald-600 hover:underline">Arrange a call</Link>.
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-xs text-gray-400">
            © {'2026'} Repair XChange. An ethical approach to post-incident repair deployment.
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Standard page heading for interior marketing pages. */
export function PageHero({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="bg-gradient-to-b from-emerald-50 to-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {eyebrow && <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">{title}</h1>
        {subtitle && <p className="text-lg text-gray-600 mt-3 max-w-2xl">{subtitle}</p>}
      </div>
    </div>
  );
}
