import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';
import { ContactForm } from '../../components/marketing/ContactForm';
import { Card, CardBody } from '../../components/ui/Card';

/** The capability blocks from the brief — each with a lead paragraph + highlights. */
const CAPABILITIES = [
  {
    title: 'Intelligent capability',
    body: 'We ingest your damage-capture images directly into our system using a guided four-corner capture process. This lets vehicle owners, drivers or fleet managers submit high-quality images instantly — giving you a reliable foundation for accurate assessment.',
    points: ['Direct image ingestion', 'Consistent capture standards', 'Faster incident understanding'],
  },
  {
    title: 'Image X Assess',
    body: 'Once your images are ingested, our neuro-model triages the damage in seconds. We align every cost estimate and pro-forma invoice directly to your rate card, ensuring full transparency and consistency across your repair network.',
    points: ['AI-driven triage from your images', 'Rule-aligned pricing', 'Automated pro-forma generation'],
  },
  {
    title: 'Realtime intelligence assessment',
    body: 'A white-labelled report is available instantly from the images you provide — delivering immediate clarity on damage severity, repair route, and cost expectations.',
    points: ['Instant reporting', 'White-label output', 'Operational accuracy'],
  },
];

const INTEGRATION = [
  'Direct image ingestion from your platform, app, FNOL tool, or customer journey',
  'Instant AI triage aligned to your rate card, repair rules, and matrices',
  'Flexible integration with existing APIs — or creation of new ones where needed',
  'Realtime reporting delivered straight back into your system, fully white-labelled',
  'Consistent deployment logic across warranty, fleet, broker, insurer, or MGA operations',
];

export function LearnMorePage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Our solution"
        title="Precise, efficient, bespoke damage assessment"
        subtitle="To revolutionise the automotive repair industry with damage assessment tailored to the unique needs of our partners — enhancing operational efficiency and customer satisfaction."
      />

      {/* Capabilities */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid gap-6 md:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <div key={c.title} className="rounded-2xl border border-gray-200 p-7 flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900">{c.title}</h3>
            <p className="text-gray-600 mt-3 text-sm leading-relaxed flex-1">{c.body}</p>
            <ul className="mt-4 space-y-2">
              {c.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-emerald-600">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Bespoke integration */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">Bespoke integration</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-2">Connects seamlessly with your systems</h2>
            <p className="text-gray-600 mt-4 leading-relaxed">
              Whether you already have established APIs or need new ones creating, we integrate
              directly into your workflow — ingesting your images, triaging the damage instantly,
              and returning a fully aligned repair assessment.
            </p>
          </div>
          <ul className="space-y-3">
            {INTEGRATION.map((p) => (
              <li key={p} className="flex gap-3 text-gray-700">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FraudLens + Adaptive Knowledge */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-7">
          <h3 className="text-lg font-semibold text-gray-900">FraudLens authenticity profiles</h3>
          <p className="text-gray-600 mt-3 text-sm leading-relaxed">
            FraudLens is a built-in authenticity layer designed to detect manipulation, editing or
            tampering. Every image is validated before triage begins, so assessments are based on
            genuine, unaltered data. It operates across all vehicle types and brands, applying
            adaptive fraud-detection logic that mirrors the scrutiny of an expert technician — with
            the speed and consistency of AI.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 p-7">
          <h3 className="text-lg font-semibold text-gray-900">Adaptive knowledge</h3>
          <p className="text-gray-600 mt-3 text-sm leading-relaxed">
            Our assessment engine learns from every validated image, ensuring each triage feels
            personal, accurate, and aligned with your operational standards. FraudLens ensures the
            integrity of the input; Adaptive Knowledge ensures the precision of the output —
            together delivering assessments that are authentic, accurate, and aligned to your
            repair rules.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">Speak to a member of our team</h2>
        <Card>
          <CardBody>
            <ContactForm />
          </CardBody>
        </Card>
      </section>
    </MarketingLayout>
  );
}
