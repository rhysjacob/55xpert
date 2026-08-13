/**
 * Brand motifs — the small graphic device a client's marketing site leans on,
 * reused here so the portal reads as theirs rather than as a skinned generic.
 *
 * Inline SVG rather than an <img>, because the motif is drawn in currentColor:
 * the same shape has to work reversed-out at 8% on a gradient and solid in the
 * brand colour beside a heading. An asset file could not do both without two
 * copies.
 */
import { useBrand } from './useBrand';

export type MotifId = 'chevrons';

/**
 * Precision's mark: a truncated chevron followed by a full one — the
 * fast-forward device from the hero of precisionrepairgroup.com.
 */
function Chevrons({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 110 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M0 0 L44 26.7 L44 73.3 L0 100 Z" />
      <path d="M50 0 L110 50 L50 100 Z" />
    </svg>
  );
}

const MOTIFS: Record<MotifId, (p: { className?: string }) => React.ReactElement> = {
  chevrons: Chevrons,
};

/**
 * The current brand's motif, or nothing for brands that have none. Sized and
 * coloured by the caller through `className` — this only supplies the shape.
 */
export function BrandMotif({ className }: { className?: string }) {
  const brand = useBrand();
  if (!brand.motif) return null;
  const Motif = MOTIFS[brand.motif];
  return <Motif className={className} />;
}

/**
 * The motif as page texture: oversized, barely-there, pinned to the top-right
 * of the viewport and non-interactive. Only rendered on gradient surfaces —
 * on the default light background it would be grubby rather than subtle.
 */
export function BrandWatermark() {
  const brand = useBrand();
  if (!brand.motif || brand.surface !== 'gradient') return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none fixed -top-16 -right-24 -z-10 w-[36rem] max-w-[80vw] text-white/[0.07]"
    >
      <BrandMotif className="w-full h-auto" />
    </div>
  );
}

/**
 * The motif at heading size, in the brand accent. Sits before an <h1>/<h2> that
 * introduces a screen — not every heading, or it stops being an accent.
 */
export function HeadingMotif({ className = '' }: { className?: string }) {
  const brand = useBrand();
  if (!brand.motif) return null;
  return (
    <BrandMotif
      className={`h-[0.62em] w-auto shrink-0 opacity-90 ${className}`}
    />
  );
}
