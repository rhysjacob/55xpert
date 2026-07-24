import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const TIME_SLOTS = ['Morning (9am–12pm)', 'Afternoon (12–5pm)', 'Evening (5–7pm)'];

/**
 * "Speak to a member of our team" lead-capture form from the brief (name,
 * business, email, contact number, preferred time slot).
 *
 * NOTE: there is no lead-capture backend yet. On submit this validates and
 * shows a confirmation only — wiring it to SES / a leads table is a follow-up.
 */
export function ContactForm({ heading = 'Speak to a member of our team' }: { heading?: string }) {
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [slot, setSlot] = useState(TIME_SLOTS[0]);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/api/v1/leads', {
        type: 'CONTACT',
        name,
        email,
        phone: phone || undefined,
        organisation: business || undefined,
        data: { preferredTime: slot },
      }),
  });
  const submitted = submit.isSuccess;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-2xl">
          ✓
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mt-4">Thanks, {name.split(' ')[0] || 'there'}!</h3>
        <p className="text-gray-600 mt-1">
          We'll be in touch {slot?.toLowerCase()} on the details you gave us.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">{heading}</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Business name" value={business} onChange={(e) => setBusiness(e.target.value)} required />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <Input label="Contact number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+44..." />
      </div>
      <div>
        <label htmlFor="slot" className="block text-sm font-medium text-gray-700 mb-1">
          Preferred time to contact
        </label>
        <select
          id="slot"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {TIME_SLOTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {submit.isError && (
        <p className="text-sm text-red-600">Sorry — something went wrong. Please try again.</p>
      )}
      <Button type="submit" className="w-full" loading={submit.isPending}>Request a call</Button>
    </form>
  );
}
