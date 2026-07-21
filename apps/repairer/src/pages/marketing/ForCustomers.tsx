import { Link } from 'react-router';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';

const BENEFITS = [
  {
    title: 'A best-in-class network',
    body: 'Access a relevant, capable repairer network — vetted to consistently high standards.',
  },
  {
    title: 'Support services that reduce cost',
    body: 'Access XChange partnership services focused on reducing cost and vehicle downtime.',
  },
  {
    title: 'A network tailored for you',
    body: 'We can tailor your repairer network, removing the need for onboarding.',
  },
  {
    title: 'Intelligent deployment',
    body: 'AI image triage and intelligent, needs-based deployment get the right vehicle to the right repairer.',
  },
  {
    title: 'Simplified commercial models',
    body: "We help your instructions stand out by encouraging sensible, simplified commercial models — rather than invoice discounts and weighted commissions.",
  },
];

export function ForCustomersPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Customer sign up"
        title="An alternative to traditional accident management"
        subtitle="For warranty companies, fleets, brokers, insurers and MGAs seeking a smarter, more ethical way to deploy post-incident repairs."
      />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="text-2xl font-bold text-gray-900">Benefits summarised</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900">{b.title}</h3>
              <p className="text-gray-600 mt-2 text-sm leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-emerald-50 border-y border-emerald-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h2 className="text-2xl font-bold text-gray-900">Ready to explore further?</h2>
          <p className="text-gray-600 mt-3">
            Start the customer sign-up journey, or arrange a call to see how the XChange could work
            for your organisation.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/learn-more"
              className="bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-emerald-700"
            >
              Arrange a call
            </Link>
            <Link
              to="/partnerships"
              className="bg-white text-gray-800 font-medium px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Explore group partnerships
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
