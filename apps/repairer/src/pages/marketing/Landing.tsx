import { Link } from 'react-router';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';

/** The three-step promise from the brief. */
const STEPS = [
  { step: 'Deploy', body: 'Damage vehicle in, instructions out. AI image triage assesses the damage in minutes.' },
  { step: 'Match', body: 'We match the vehicle and the damage with the most qualified repairer — no onboarding, no weighted commissions.' },
  { step: 'Repair', body: 'The repairer accepts, we step away, and the relationship flourishes.' },
];

export function LandingPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
            Deploy · Match · Repair
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mt-4 tracking-tight">
            Creating the perfect match
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mt-6 max-w-2xl mx-auto">
            We specialise in matching the most qualified repairer with the vehicle and the damage —
            an ethical approach to reducing downtime and controlling costs.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/for-customers"
              className="bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-emerald-700"
            >
              I need repairs managed
            </Link>
            <Link
              to="/for-repairers"
              className="bg-white text-gray-800 font-medium px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              I'm a repairer
            </Link>
          </div>
        </div>
      </section>

      {/* Deploy / Match / Repair */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.step} className="rounded-xl border border-gray-200 p-6">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mt-4">{s.step}</h3>
              <p className="text-gray-600 mt-2 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two audience journeys — the core of the brief's landing page */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">Warranty, fleet, broker, insurer or MGA?</h2>
            <p className="text-gray-600 mt-3 flex-1">
              Seeking an alternative to traditional accident management? Access a best-in-class
              repairer network, intelligent deployment and support services focused on reducing
              cost and vehicle downtime.
            </p>
            <Link
              to="/for-customers"
              className="mt-6 inline-block bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-emerald-700 text-center"
            >
              Explore the customer journey
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">A repairer or group?</h2>
            <p className="text-gray-600 mt-3 flex-1">
              Looking for quality, cost-effective repair capacity? Join the XChange for a simple
              subscription, get matched to relevant work on a fastest-finger-first basis, and
              replace weighted commissions with a straightforward match fee.
            </p>
            <Link
              to="/for-repairers"
              className="mt-6 inline-block bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-emerald-700 text-center"
            >
              Explore the repairer subscription
            </Link>
          </div>
        </div>
      </section>

      {/* Ethos strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900">An ethical approach, built for simplicity</h2>
        <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
          We don't want to replace traditional accident management — we're here as an alternative.
          Our intelligent XChange solution supports AI image triage, matches the damaged vehicle
          with the right repairer, and then lets the relationship flourish.
        </p>
        <div className="mt-8">
          <Link to="/learn-more" className="text-emerald-600 font-medium hover:underline">
            Would you like to speak to a member of our team? →
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
