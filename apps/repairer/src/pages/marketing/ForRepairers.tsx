import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';

const SUBSCRIPTION = [
  'Access to XChange job notifications',
  'Free access to the Compliance Document Repository',
  'Access to intelligent support services focused on enhancing operational controls',
];

const BENEFITS = [
  {
    title: 'A match fee, not commissions',
    body: "Traditional accident-management commissions are replaced by a simple 'Match' fee — no invoice discounts, no weighted repairer commissions.",
  },
  {
    title: 'Fastest-finger-first',
    body: "New instructions carry the key features of the job and go to multiple qualifying repairers. When you accept ('Match'), we issue the detailed customer instructions and step away.",
  },
  {
    title: 'Extended contract periods',
    body: 'Longer-term agreements are available, giving you surety on these favourable terms.',
  },
  {
    title: 'Reliable, profitable & economical work',
    body: 'A dependable source of work, with customers encouraged to apply simplified commercial propositions for swift benefit assessment.',
  },
];

export function ForRepairersPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Repairer subscription"
        title="Quality work, matched to your capacity"
        subtitle="A simple subscription that connects you to relevant, profitable repair work — without the onboarding overhead."
      />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid gap-10 lg:grid-cols-3">
        {/* Pricing card */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-8 sticky top-24">
            <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Subscription</p>
            <p className="mt-2">
              <span className="text-4xl font-bold text-gray-900">£2</span>
              <span className="text-gray-600"> / day</span>
            </p>
            <ul className="mt-6 space-y-3">
              {SUBSCRIPTION.map((s) => (
                <li key={s} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-emerald-600">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/sign-up"
              className="mt-8 block text-center bg-emerald-600 text-white font-medium px-5 py-3 rounded-lg hover:bg-emerald-700"
            >
              Register your business
            </Link>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Already a partner?{' '}
              <Link to="/sign-in" className="text-emerald-600 hover:underline">Sign in</Link>
            </p>
          </div>
        </div>

        {/* Benefits */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Why repairers join the XChange</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900">{b.title}</h3>
                <p className="text-gray-600 mt-2 text-sm leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900">How it works</h3>
            <ol className="mt-3 space-y-2 text-sm text-gray-700 list-decimal list-inside">
              <li>Subscribe and set your repair capabilities and coverage.</li>
              <li>Receive notifications of matching jobs with the key details.</li>
              <li>Accept the ones you want — fastest finger first.</li>
              <li>Get the full customer instructions and get to work.</li>
            </ol>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
