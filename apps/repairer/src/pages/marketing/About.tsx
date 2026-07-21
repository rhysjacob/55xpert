import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';

const PRINCIPLES = [
  'We are a group of individuals committed to an ethical, simple approach to post-incident repair deployment.',
  "We don't want to replace traditional accident management solutions — we want to be there as an alternative.",
  'XChange is an enabler for warranty companies, fleets, brokers and insurers to use as a network performance comparison tool, or for in-house network control.',
  'All of our repairer partners consistently operate to the highest standards, so you can be assured of best-in-class service and quality.',
];

const TEAM = [
  { name: 'Jon Capstick', role: 'Founder & Director' },
];

export function AboutPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About us"
        title="Deploy, Match, Repair"
        subtitle="An intelligent, innovative XChange solution, designed for simplicity."
      />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-6">
        {PRINCIPLES.map((p, i) => (
          <p key={i} className="text-lg text-gray-700 leading-relaxed">{p}</p>
        ))}
        <p className="text-lg text-gray-700 leading-relaxed">
          We support through AI image triage and match the damaged vehicle with the right
          repairer — then let the relationship flourish. Our focus remains on reduced costs for
          everyone.
        </p>
      </section>

      {/* Meet the team */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h2 className="text-2xl font-bold text-gray-900 text-center">Meet the team</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-8">
            {TEAM.map((m) => (
              <div key={m.name} className="text-center w-48">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 mx-auto flex items-center justify-center text-3xl font-bold text-emerald-700">
                  {m.name.split(' ').map((w) => w[0]).join('')}
                </div>
                <p className="font-semibold text-gray-900 mt-4">{m.name}</p>
                <p className="text-sm text-gray-500">{m.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
        <Link
          to="/learn-more"
          className="inline-block bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-emerald-700"
        >
          Speak to a member of our team
        </Link>
      </section>
    </MarketingLayout>
  );
}
