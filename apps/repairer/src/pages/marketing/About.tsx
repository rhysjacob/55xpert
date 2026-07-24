import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';

const WHY = [
  'Reduce operational and repair costs',
  'Improve customer experience and cycle times',
  'Gain transparent network performance insights',
  'Deploy repairs with accuracy and confidence',
];

const HOW = [
  { step: 'Triage', body: 'We analyse damage using advanced AI tools tailored to your operational rules.' },
  { step: 'Deploy', body: 'We classify the repair type and determine the optimal route.' },
  { step: 'Match', body: 'Our system intelligently pairs each job with the right repairer based on capability, geography, performance and availability.' },
  { step: 'Repair', body: 'The repairer receives clear instructions, completes the work, and the relationship flourishes through transparency and performance tracking.' },
];

export function AboutPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About us"
        title="Triage • Deploy • Match • Repair"
        subtitle="An ethical, transparent and simplified approach to post-incident assessment and repair deployment."
      />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-10">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Who we are</h2>
          <p className="text-lg text-gray-700 leading-relaxed mt-3">
            The Repair XChange is a collective of industry-experienced individuals committed to
            delivering an ethical, transparent, and simplified approach to post-incident assessment
            and repair deployment. Our mission is to remove complexity, reduce cost, and elevate
            customer experience across the entire repair ecosystem.
          </p>
          <p className="text-lg text-gray-700 leading-relaxed mt-4">
            We believe in clarity, fairness, and intelligent automation — and we've built our
            platform to reflect those values.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">What we do</h2>
          <p className="text-lg text-gray-700 leading-relaxed mt-3">
            The Repair XChange acts as an intelligent enabler for warranty companies, fleets,
            brokers, and insurers. Whether you're looking to enhance your internal network control
            or benchmark performance across multiple repair networks, our platform provides the
            visibility and efficiency you need.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Why organisations choose The Repair XChange</h2>
          <ul className="mt-4 space-y-3">
            {WHY.map((w) => (
              <li key={w} className="flex gap-3 text-lg text-gray-700">
                <span className="text-emerald-600">✓</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <p className="text-gray-600 mt-4">
            Our solution is designed to be simple, powerful, and adaptable to your business rules.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Our repairer network</h2>
          <p className="text-lg text-gray-700 leading-relaxed mt-3">
            Every repair partner within The Repair XChange operates to the highest professional
            standards. We work only with trusted repairers who deliver best-in-class service,
            quality workmanship, and consistent customer care — so that every triaged incident is
            matched with a repairer capable of delivering the right outcome, first time.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h2 className="text-2xl font-bold text-gray-900 text-center">How it works</h2>
          <p className="text-gray-600 text-center mt-3 max-w-2xl mx-auto">
            At its core is a powerful AI-driven triage engine that assesses damage using the latest
            technology, aligned to your specific business rules and repair matrices.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {HOW.map((h, i) => (
              <div key={h.step} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mt-4">{h.step}</h3>
                <p className="text-gray-600 mt-2 text-sm leading-relaxed">{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Why it matters</h2>
        <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
          The Repair XChange brings together technology, ethics, and operational excellence to
          create a repair ecosystem that works better for everyone — businesses, repairers, and
          customers. It's repair fulfilment, reimagined.
        </p>
        <Link
          to="/learn-more"
          className="mt-8 inline-block bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-emerald-700"
        >
          Speak to a member of our team
        </Link>
      </section>
    </MarketingLayout>
  );
}
