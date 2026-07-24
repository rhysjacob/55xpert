import { Link } from 'react-router';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';

/** The intelligent-triage key benefits from the brief. */
const BENEFITS = [
  { title: 'Accuracy', body: 'AI triage aligned to your repair rules, matrices and operational logic.' },
  { title: 'Speed', body: 'Instant assessment and reduced downtime — faster decisions, fewer delays.' },
  { title: 'Control', body: 'Predictable costs and a consistent, ethical approach to deployment.' },
];

export function LandingPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
            Triage · Deploy · Match · Repair
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mt-4 tracking-tight">
            Creating the perfect match
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mt-6 max-w-2xl mx-auto">
            We specialise in matching the most qualified repairer with the vehicle and the damage —
            powered by instant, AI-driven triage for accurate assessment and controlled costs.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register-interest"
              className="bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-emerald-700"
            >
              Register your interest
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

      {/* Intelligent Triage */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">Intelligent triage</p>
          <h2 className="text-3xl font-bold text-gray-900 mt-2">
            Instant, accurate, AI-driven damage assessment
          </h2>
          <p className="text-gray-600 mt-4 leading-relaxed">
            The Repair XChange uses advanced AI tools to triage damage instantly — aligned to your
            business rules, repair matrices, and operational logic. That means faster decisions,
            fewer delays, and a consistent, ethical approach to post-incident assessment.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900">{b.title}</h3>
              <p className="text-gray-600 mt-2 text-sm leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why — savings / ROI */}
      <section className="bg-emerald-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold">Why The Repair XChange — let us show you the savings</h2>
          <p className="text-emerald-50 mt-4 max-w-2xl mx-auto">
            We'll model your return on investment against your current accident-management costs and
            build a commitment designed around the savings for your business.
          </p>
          <Link
            to="/register-interest"
            className="mt-8 inline-block bg-white text-emerald-700 font-medium px-6 py-3 rounded-lg hover:bg-emerald-50"
          >
            Explore your savings
          </Link>
        </div>
      </section>

      {/* Two audience journeys */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">For warranty providers, fleets, brokers, insurers &amp; MGAs</h2>
            <p className="text-gray-600 mt-3 flex-1">
              Are you seeking an alternative solution to traditional accident management? If the
              answer is yes, register your interest and we'll be in touch.
            </p>
            <Link
              to="/register-interest"
              className="mt-6 inline-block bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-emerald-700 text-center"
            >
              Register interest
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">For repairers &amp; groups</h2>
            <p className="text-gray-600 mt-3 flex-1">
              Are you a repairer or group looking for quality, cost-effective repair capacity? If the
              answer is yes, follow the repairer subscription journey to explore further.
            </p>
            <Link
              to="/for-repairers"
              className="mt-6 inline-block bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-emerald-700 text-center"
            >
              Repairer subscription journey
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
