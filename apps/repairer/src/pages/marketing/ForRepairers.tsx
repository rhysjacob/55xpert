import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';

const SUBSCRIPTION = [
  'XChange notifications — instant alerts for new, relevant jobs',
  'Intelligent Support — operational guidance to enhance workflow and control',
  'Access to the competitive XChange pricing matrix',
];

const BENEFITS = [
  {
    title: 'Low-cost access to quality work',
    body: 'Your subscription (less than £2 per day) unlocks full access to The Repair XChange — a reliable, profitable, economical source of work designed to support your growth.',
  },
  {
    title: 'Simple, low-cost match fee',
    body: 'Traditional accident-management commissions are replaced with a low-cost £25 Match Fee — payable only when you accept a job. This keeps your margins strong and your commercials predictable.',
  },
  {
    title: 'A pricing matrix that offsets your subscription',
    body: 'Our enhanced pricing matrix keeps repair values competitive and commercially attractive — so the revenue uplift from each job more than offsets your daily subscription. Stronger margins, fair and consistent pricing, clear profitability on every instruction.',
  },
  {
    title: 'Transparent job allocation',
    body: 'New instructions include the key job details and are sent to multiple qualifying repairers within your coverage area. Capability-based matching, no favouritism — every qualifying repairer sees the opportunity.',
  },
  {
    title: 'Fastest-finger-first acceptance',
    body: 'When you accept a job (“Match”), we immediately issue full customer instructions via CAPS and step aside — leaving you to manage the relationship directly.',
  },
  {
    title: 'Reliable, profitable & economical work',
    body: 'A steady stream of high-quality instructions means predictable volume, strong margins, reduced admin and a clear operational flow for your workshop or mobile operation.',
  },
];

export function ForRepairersPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Repairer subscription"
        title="Reliable, profitable work — matched to your capacity"
        subtitle="A low-cost subscription that connects you to relevant, high-quality repair work, replacing weighted commissions with a simple, predictable match fee."
      />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid gap-10 lg:grid-cols-3">
        {/* Pricing card */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-8 sticky top-24">
            <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Subscription</p>
            <p className="mt-2">
              <span className="text-4xl font-bold text-gray-900">&lt; £2</span>
              <span className="text-gray-600"> / day</span>
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Plus a low-cost <span className="font-semibold text-gray-900">£25 Match Fee</span> — payable only when you accept a job.
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
              Start the subscription journey
            </Link>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Already a partner?{' '}
              <Link to="/sign-in" className="text-emerald-600 hover:underline">Sign in</Link>
            </p>
          </div>
        </div>

        {/* Benefits */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Repairer benefits</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900">{b.title}</h3>
                <p className="text-gray-600 mt-2 text-sm leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900">Simple, frictionless onboarding</h3>
            <p className="text-sm text-gray-600 mt-2">
              No complex contract negotiations. To join The Repair XChange, repairers simply:
            </p>
            <ol className="mt-3 space-y-2 text-sm text-gray-700 list-decimal list-inside">
              <li>Complete the onboarding form</li>
              <li>Read and accept the Terms &amp; Conditions</li>
              <li>Provide credit-card details for subscription and match fees</li>
            </ol>
            <p className="text-sm text-gray-600 mt-3">
              All done online in minutes — giving you fast, low-friction access to a reliable, profitable source of work.
            </p>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
