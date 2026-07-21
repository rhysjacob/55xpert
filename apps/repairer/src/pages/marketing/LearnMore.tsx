import { useState, type FormEvent } from 'react';
import { MarketingLayout, PageHero } from '../../components/marketing/MarketingLayout';
import { ContactForm } from '../../components/marketing/ContactForm';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

/** Newsletter opt-in. No backend yet — confirms locally. */
function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // TODO: wire to a subscriber list.
    setDone(true);
  };
  return done ? (
    <p className="text-sm text-emerald-700">You're on the list — thanks!</p>
  ) : (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@business.com"
        required
        className="sm:flex-1"
        aria-label="Email address"
      />
      <Button type="submit">Keep me posted</Button>
    </form>
  );
}

export function LearnMorePage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Learn more"
        title="Speak to a member of our team"
        subtitle="Leave your details and a preferred time, and we'll be in touch."
      />

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-10">
        <Card>
          <CardBody>
            <ContactForm />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Stay in the know</h3>
            <p className="text-sm text-gray-600 mb-4">
              Sign up to stay up to date with XChange news and updates.
            </p>
            <NewsletterSignup />
          </CardBody>
        </Card>
      </section>
    </MarketingLayout>
  );
}
