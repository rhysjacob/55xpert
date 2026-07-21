import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';
import { ContactForm } from '../../components/marketing/ContactForm';
import { Card, CardBody } from '../../components/ui/Card';

/**
 * The XChange divisions from the brief. `comingSoon` marks Salvage X; Image X
 * links through to the AI triage product (the Warranty app / Image X landing).
 */
const DIVISIONS = [
  { name: 'Parts XChange', body: 'Advocates of the fastest-growing bodyshop parts marketplace.' },
  { name: 'Compliance X', body: 'Links to helpful policies designed to support our partners.' },
  { name: 'Image X', body: 'An intuitive, intelligent approach to triage and assessment.' },
  { name: 'Legal X', body: 'Best-in-class legal service for our XChange family to utilise.' },
  { name: 'Finance XChange', body: 'For repairers wanting to reduce payment-term periods.' },
  { name: 'Payment X', body: 'Bespoke payment solutions (pin card services) tailored to your business.' },
  { name: 'Salvage X', body: 'Coming soon.', comingSoon: true },
];

export function PartnershipsPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Group partnerships"
        title="One XChange, multiple divisions"
        subtitle="Designed to improve efficiency and reduce costs — with our ethical approach underpinning everything we do."
      />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DIVISIONS.map((d) => (
            <div
              key={d.name}
              className="rounded-xl border border-gray-200 p-6 hover:border-emerald-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">{d.name}</h3>
                {d.comingSoon && (
                  <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-gray-600 mt-2 text-sm leading-relaxed">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Speak-to-us form */}
      <section className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Want to learn more?</h2>
            <p className="text-gray-600 mt-2">
              Leave your details and a preferred time — we'll arrange a call with the right person.
            </p>
          </div>
          <Card>
            <CardBody>
              <ContactForm />
            </CardBody>
          </Card>
        </div>
      </section>
    </MarketingLayout>
  );
}
