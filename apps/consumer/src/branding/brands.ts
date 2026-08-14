/**
 * White-label branding for the consumer portal.
 *
 * One build serves every brand: the brand is resolved at runtime from the
 * hostname the SPA was loaded from, so adding a client is a config entry plus
 * a DNS/CloudFront alias — not a second build, bucket or pipeline. Vite inlines
 * `VITE_*` at build time, which is exactly what we are avoiding here.
 */
import type { MotifId } from './BrandMotif';

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
  /** Tab icon. Self-hosted like the logo; SVG so one file covers every size. */
  faviconUrl?: string;
  /** 'dark' renders the nav as a black bar, as on a dark marketing site. */
  navTheme?: 'light' | 'dark';
  /** Accent gradient: the hairline under a dark nav, and the page surface when
   *  `surface` is 'gradient'. */
  accentFrom?: string;
  accentTo?: string;
  /**
   * Page background. 'gradient' paints the accent gradient across the whole
   * app — cards stay white on top of it — for brands whose own site is built
   * on a colour field. Default is the neutral light grey.
   */
  surface?: 'light' | 'gradient';
  /** Graphic device from the brand's own site. See BrandMotif.tsx. */
  motif?: MotifId;
  /** Webfont stack. fontUrl is injected only for brands that set it. */
  fontBody?: string;
  fontHeading?: string;
  fontUrl?: string;
  /**
   * Cognito app client for this brand (AuthStack output
   * Consumer<Brand>ClientId). Signing up against it is what binds the user to
   * this brand's warranty tenant server-side. Omit to use the default client.
   */
  userPoolClientId?: string;
  /**
   * The warranty tenant this brand's portal belongs to. Only used to check that
   * a case actually belongs to this tenant before showing tenant-specific
   * wording — the portal a case is *viewed* on proves nothing, since any user
   * can reach any portal. Never sent to the API; the server takes the tenant
   * from the signed token.
   */
  warrantyCompanyId?: string;
  /**
   * What this company says when a case is referred rather than priced. Brands
   * that set it are saying "we handle referrals ourselves" — the consumer is
   * offered a hand-off to one of the company's own sites instead of the neutral
   * "an Xpert is reviewing this".
   */
  referral?: BrandReferralCopy;
  /**
   * What this company says once a case is published to repairers. The default
   * names The Repair Xchange, which is the truth for a consumer-submitted case
   * but means nothing to a warranty company's own customer.
   */
  publishedNotice?: string;
}

/**
 * Referral wording, split so the action reads as part of the sentence rather
 * than as a button bolted underneath it.
 */
export interface BrandReferralCopy {
  /** Sentence around the action, e.g. "… – ", "click here", " to allocate …". */
  before: string;
  linkText: string;
  after: string;
  /** Shown in place of the above once the hand-off has been requested. */
  requestedTitle: string;
  requestedDetail: string;
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
 * Taken from precisionrepairgroup.com. Their chrome is monochrome — near-black
 * nav, white and greys — so the primary is their black; the blue→violet
 * gradient is the field their hero sits on and is carried here as the page
 * surface. Their display face (Polysans) is licensed to them and deliberately
 * not used.
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
  faviconUrl: '/brands/precision-favicon.svg',
  navTheme: 'dark',
  // Their blue→violet: the gradient inside the P mark, and the field their own
  // hero sits on. Carried across the portal surface at Rhys's request so the
  // two read as one property; cards stay white so damage photos and the
  // red/amber verdict banners keep their meaning.
  accentFrom: '#004ee8',
  accentTo: '#9e60fd',
  surface: 'gradient',
  // The fast-forward chevrons from their hero.
  motif: 'chevrons',
  // What their site actually renders in. Both are open-licensed (SIL OFL), so
  // matching their typography is legitimate — unlike Polysans, which their
  // stylesheet declares but never applies.
  fontBody: "'Inter', system-ui, sans-serif",
  fontHeading: "'Mona Sans', 'Inter', system-ui, sans-serif",
  fontUrl:
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Mona+Sans:wght@300;400;500;600;700&display=swap',
  // dev: AuthStack output ConsumerPrecisionClientId. Signing up here is what
  // binds the user to the Precision Repair Group tenant.
  userPoolClientId: '2ps8ohl1sftbq7fm6ni23v1p8i',
  // dev: the Precision Repair Group row in the warranty-companies table.
  warrantyCompanyId: '4496a9cb-01fa-436b-8dc9-c6553d61c8ad',
  // Precision take referred work into their own sites rather than leaving the
  // customer waiting on a review, so their referral wording is an offer, not a
  // status. Their words, verbatim.
  referral: {
    before: 'This does NOT qualify for mobile repair solution – ',
    linkText: 'click here',
    after: ' to allocate to most suitable Precision Site',
    requestedTitle: 'Sent to Precision Repair Group',
    requestedDetail:
      "They'll allocate the most suitable site for this repair and contact you directly.",
  },
  // Their customer is buying a Precision repair, not a listing on a marketplace
  // they have never heard of.
  publishedNotice: 'This has been sent to a Precision Mobile Repairer',
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

  // Drives the surface rules in index.css: which page background is painted and
  // whether text sitting directly on it reverses out. An attribute rather than
  // a class so the CSS reads as a state, and so nothing can strip it by
  // rewriting className on <html>.
  root.dataset['brandSurface'] = brand.surface ?? 'light';

  // Only brands that specify a webfont pay for the request.
  if (brand.fontUrl && !document.querySelector(`link[data-brand-font]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = brand.fontUrl;
    link.setAttribute('data-brand-font', brand.id);
    document.head.appendChild(link);
  }

  // Tab icon. Replaces any existing <link rel="icon"> rather than appending, so
  // a brand's mark can't lose to the document's own icon.
  if (brand.faviconUrl) {
    const icon =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
      document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
    icon.type = 'image/svg+xml';
    icon.href = brand.faviconUrl;
  }

  document.title = brand.nameAccent ? `${brand.name} ${brand.nameAccent}` : brand.name;
}
