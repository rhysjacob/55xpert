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
  /** Optional mark. Served from the app's own origin, not the client's CDN. */
  logoUrl?: string;
  /**
   * True when logoUrl is a full lockup that already contains the company name.
   * The name and tagline are then suppressed rather than repeated beside it.
   */
  logoIsLockup?: boolean;
  /** Reversed-out logo, required when navTheme is 'dark'. */
  logoUrlOnDark?: string;
  /** 'dark' renders the nav as a black bar, as on a dark marketing site. */
  navTheme?: 'light' | 'dark';
  /** Accent gradient, used sparingly — a hairline, not a paint job. */
  accentFrom?: string;
  accentTo?: string;
  /** Webfont stack. fontUrl is injected only for brands that set it. */
  fontBody?: string;
  fontHeading?: string;
  fontUrl?: string;
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
 *
 * The logo is their horizontal lockup (425x189), self-hosted in public/brands
 * rather than hotlinked. They publish it white-on-transparent for their dark
 * site; this copy is recoloured to their black so it reads on the portal's
 * light background — the same colourway as the black mark on their own site.
 */
const PRECISION_BRAND: Brand = {
  id: 'precision',
  name: 'Precision Repair Group',
  tagline: 'Partnering independence',
  primary: '#161616',
  primaryDark: '#000000',
  logoUrl: '/brands/precision-logo.svg',
  logoIsLockup: true,
  logoUrlOnDark: '/brands/precision-logo-white.svg',
  navTheme: 'dark',
  // The only colour on their site: the gradient inside the P mark. Everything
  // else is black, white and grey — so this is an accent, never a fill.
  accentFrom: '#004ee8',
  accentTo: '#9e60fd',
  // What their site actually renders in. Both are open-licensed (SIL OFL), so
  // matching their typography is legitimate — unlike Polysans, which their
  // stylesheet declares but never applies.
  fontBody: "'Inter', system-ui, sans-serif",
  fontHeading: "'Mona Sans', 'Inter', system-ui, sans-serif",
  fontUrl:
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Mona+Sans:wght@300;400;500;600;700&display=swap',
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
  if (brand.accentFrom) root.style.setProperty('--brand-accent-from', brand.accentFrom);
  if (brand.accentTo) root.style.setProperty('--brand-accent-to', brand.accentTo);
  if (brand.fontBody) root.style.setProperty('--brand-font-body', brand.fontBody);
  if (brand.fontHeading) root.style.setProperty('--brand-font-heading', brand.fontHeading);

  // Only brands that specify a webfont pay for the request.
  if (brand.fontUrl && !document.querySelector(`link[data-brand-font]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = brand.fontUrl;
    link.setAttribute('data-brand-font', brand.id);
    document.head.appendChild(link);
  }

  document.title = brand.nameAccent ? `${brand.name} ${brand.nameAccent}` : brand.name;
}
