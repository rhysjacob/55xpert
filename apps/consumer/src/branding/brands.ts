/**
 * White-label branding for the consumer portal.
 *
 * One build serves every brand: the brand is resolved at runtime from the
 * hostname the SPA was loaded from, so adding a client is a config entry plus
 * a DNS/CloudFront alias — not a second build, bucket or pipeline. Vite inlines
 * `VITE_*` at build time, which is exactly what we are avoiding here.
 */

export interface Brand {
  /** Stable key, also accepted by the ?brand= demo override. */
  id: string;
  /** Wordmark. */
  name: string;
  /** Optional second word, rendered muted beside the name. */
  nameAccent?: string;
  /** Strapline under the wordmark on signed-out screens. */
  tagline: string;
  /** Primary brand colour, and the darker shade used for hover/active. */
  primary: string;
  primaryDark: string;
  /** Optional mark shown beside the wordmark. */
  logoUrl?: string;
}

export const DEFAULT_BRAND: Brand = {
  id: 'corexpert',
  name: 'Repair XChange',
  nameAccent: 'Warranty',
  tagline: 'Warranty · Vehicle Damage Assessment',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
};

/**
 * Taken from precisionrepairgroup.com: the site is monochrome — near-black,
 * white and greys — so the primary is their black rather than a colour.
 * Their display face (Polysans) is licensed to them and deliberately not used.
 * TODO: self-host the logo before this faces real customers; it is currently
 * hotlinked from their Webflow CDN and will break if they redeploy.
 */
const PRECISION_BRAND: Brand = {
  id: 'precision',
  name: 'Precision Repair Group',
  tagline: 'Partnering independence',
  primary: '#161616',
  primaryDark: '#000000',
  logoUrl:
    'https://cdn.prod.website-files.com/692ae1e783f75d08781c5c46/692b338c77c6980b2e58bb09_precision%20black%20300x300.png',
};

export const BRANDS: Brand[] = [DEFAULT_BRAND, PRECISION_BRAND];

/**
 * Hostnames that map to a non-default brand. Lowercase, no port. CloudFront
 * domains are listed alongside the real ones so a brand can be demoed before
 * its DNS exists.
 */
const HOSTNAME_BRANDS: Record<string, Brand> = {
  // dev: FrontendStack output ConsumerPrecisionUrl
  'd1tl5y9m0dbx9s.cloudfront.net': PRECISION_BRAND,
  'claims.precisionrepairgroup.com': PRECISION_BRAND,
  'portal.precisionrepairgroup.com': PRECISION_BRAND,
};

/** Register a CloudFront domain against a brand (see cdk FrontendStack outputs). */
export function registerHostname(hostname: string, brand: Brand): void {
  HOSTNAME_BRANDS[hostname.toLowerCase()] = brand;
}

/**
 * Resolve the brand for a hostname. `search` allows `?brand=<id>` to force a
 * brand — a demo/QA aid so a client can be shown their skin before any DNS
 * exists. It only selects between brands already compiled in, so it exposes
 * nothing that isn't already public.
 */
export function resolveBrand(hostname: string, search = ''): Brand {
  const forced = new URLSearchParams(search).get('brand');
  if (forced) {
    const match = BRANDS.find((b) => b.id === forced.toLowerCase());
    if (match) return match;
  }
  return HOSTNAME_BRANDS[hostname.toLowerCase()] ?? DEFAULT_BRAND;
}

/**
 * Push the brand into the document: CSS custom properties (consumed by the
 * `brand` Tailwind colours in index.css) and the tab title. Called before the
 * first render so there is no flash of the default brand.
 */
export function applyBrand(brand: Brand): void {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', brand.primary);
  root.style.setProperty('--brand-primary-dark', brand.primaryDark);
  document.title = brand.nameAccent ? `${brand.name} ${brand.nameAccent}` : brand.name;
}
