# Image Fraud Detection — Technical Spec

Status: draft for review · Author: Claude Code · Scope: everything except capture
binding (deferred by product).

## 1. Goal & non-goals

**Goal.** Attach a `fraudRisk` score + itemised reasons to every case at triage
time, and route medium/high-risk cases into the existing Xpert review queue.

**Non-goals.**
- Not auto-rejection. Every signal here is defeatable by a motivated fraudster;
  the output is a *risk score that routes to a human*, never a verdict.
- Not capture binding (live in-app camera). Deferred by product — noted because
  it would subsume several weaker signals below, so revisit the weighting when
  it lands.
- Not courtroom-grade forensics. We want cheap signals that catch the
  opportunistic majority and raise friction.

## 2. Threat model (priority order)

| # | Fraud mode | Primary defence in this spec |
|---|---|---|
| 1 | Pre-existing/old damage claimed as a new incident | EXIF timing, weather cross-check |
| 2 | A different vehicle's damage | plate/colour cross-check (½ built already) |
| 3 | Same damage claimed twice / stock/internet photo | perceptual hashing |
| 4 | Photoshopped or AI-generated damage | tamper signals + AI fraud-screen |
| 5 | Exaggerated real damage | (out of scope — handled by AI severity + Xpert) |

Warranty fraud (#1) is assumed primary. If that assumption is wrong, re-rank —
it changes which signals earn their keep.

## 3. Architectural principle: piggyback the triage worker

`packages/api/src/handlers/triage/worker.ts` already, per case:
- issues an S3 `GetObject` for every image, and
- decodes the bytes with Jimp (`prepareImageForBedrock`).

All pixel/metadata signals attach here — **no extra S3 reads, no new decode**.
The raw pre-downscale bytes (before `prepareImageForBedrock` caps the edge) are
what we analyse, since downscaling destroys EXIF and alters hashes.

⚠️ Ordering bug to avoid: today the worker downscales *before* anything else. We
must extract EXIF + hash from the **original** buffer, then downscale for
Bedrock. Extract-then-shrink, not shrink-then-extract.

One consequence: forensics only run for cases that reach triage. Cases that
never triage are never scored — acceptable, since an unscored case can't be
published/priced anyway.

## 4. Data model changes

### 4.1 `CaseImage` (packages/core/src/types/case.ts) — new optional block

```ts
export interface ImageForensics {
  /** Perceptual hash (dHash/pHash, hex) for duplicate detection. */
  pHash?: string;
  /** SHA-256 of the raw bytes — exact-dupe + integrity. */
  sha256?: string;
  exif?: {
    dateTimeOriginal?: string;   // ISO, from EXIF
    gps?: { lat: number; lng: number };
    cameraMake?: string;
    cameraModel?: string;
    software?: string;           // e.g. "Adobe Photoshop 25.0" → edit flag
    /** Hash of the embedded EXIF thumbnail; mismatch vs main image = tamper. */
    thumbnailPHash?: string;
    /** True if the file carried no usable EXIF at all (common & innocent). */
    stripped?: boolean;
  };
  /** Populated by the plate OCR + DVLA cross-check (REGISTRATION_PLATE only). */
  plateReadout?: string;
}
```

Add `forensics?: ImageForensics` to `CaseImage`. All optional → backward
compatible with the ~existing rows.

### 4.2 `TriageResult` (same file) — new fraud block

```ts
export interface FraudReason {
  code: FraudReasonCode;      // enum, see §5
  detail: string;             // human sentence for the Xpert
  weight: number;             // contribution to the score
  imageType?: ImageType;      // which image, if applicable
}

export interface FraudAssessment {
  score: number;              // 0–100, sum of weights, capped
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: FraudReason[];
  /** Signals that could not run (e.g. no EXIF, no GPS) — for transparency. */
  notRun: FraudReasonCode[];
}
```

Add `fraudAssessment?: FraudAssessment` to `TriageResult`.

## 5. Signal catalogue

Each signal is cheap, independently weak, and emits zero-or-more `FraudReason`s.
`w:` is the **starting** weight (needs calibration — see §7). Confidence is my
estimate of signal quality, not the fraudster's guilt.

### Tier A — timing & provenance (from EXIF)

| Signal | Rule | w | Confidence |
|---|---|---|---|
| `PHOTO_PREDATES_INCIDENT` | `dateTimeOriginal` < `incidentDate` − 1d | 35 | high when present |
| `PHOTO_LONG_AFTER_INCIDENT` | `dateTimeOriginal` > incident + N days | 15 | med |
| `PHOTO_AFTER_CASE_CREATED` | original timestamp *after* case creation is impossible for a real prior incident | 20 | med |
| `PHOTOS_TIME_SCATTERED` | spread between the 3–4 photos' `dateTimeOriginal` > 24h | 20 | med |
| `GPS_FAR_FROM_POSTCODE` | haversine(gps, postcode centroid) > 50km | 15 | low-med (GPS coarse) |
| `EDIT_SOFTWARE_TAG` | `software` matches Photoshop/GIMP/etc. | 30 | high |
| `MIXED_CAMERAS` | >1 distinct `cameraModel` across one session's photos | 15 | low-med |

**Read discipline (non-negotiable):** *missing* EXIF is common and innocent
(messaging apps, screenshots strip it) → emits `notRun`, **never** a score.
*Correct* EXIF is weak positive evidence (trivially forged with `exiftool`) →
we never *reduce* risk for good-looking EXIF. Only **inconsistency** scores.

### Tier B — duplicate / reuse

| Signal | Rule | w | Confidence |
|---|---|---|---|
| `EXACT_DUPLICATE` | `sha256` seen on another case | 40 | high |
| `NEAR_DUPLICATE` | `pHash` Hamming ≤ 6 vs another case's image | 35 | high |
| `INTERNAL_DUPLICATE` | two images *within this case* are near-identical (padding slots) | 10 | med |
| `KNOWN_STOCK_IMAGE` | (optional) reverse-image-search hit on the open web | 30 | med |

Needs a hash store — see §6.3.

### Tier C — tamper / synthetic (pixel-level)

| Signal | Rule | w | Confidence |
|---|---|---|---|
| `THUMBNAIL_MISMATCH` | EXIF thumbnail pHash far from main image | 30 | high, cheap |
| `DOUBLE_COMPRESSION` | quantisation-ghost analysis flags recompressed region | 20 | med |
| `C2PA_PRESENT` | valid Content Credentials manifest → **lowers** risk / provenance note | −10 | high (rare) |
| `SYNTHID_OR_AI_TAG` | embedded AI-gen marker (SynthID/C2PA `ai-generated`) | 40 | high when present |

Deliberately **not** including ELA — high false-positive, defeated by one
re-save, not actionable. Thumbnail-mismatch is the high-ROI tamper signal.

### Tier D — semantic (reuse the AI you already run)

| Signal | Rule | w | Confidence |
|---|---|---|---|
| `VEHICLE_MISMATCH` | plate OCR / visible car make-model-colour ≠ registered vehicle | 35 | high |
| `CROSS_PHOTO_INCONSISTENT` | angles don't show the same car (colour/trim/plate/bg) | 25 | med |
| `SCREEN_REPHOTOGRAPH` | moiré / bezel / reflection → photo-of-a-photo | 25 | med |
| `SCENE_TIME_MISMATCH` | weather in image ≠ historical weather for postcode+date (snow in July, wet in "dry") | 20 | med |

`VEHICLE_MISMATCH` is nearly free: the vision model **already** volunteers this
(a past case: *"red BMW 1 Series, not a Nissan Qashqai as stated"*) — we just
don't capture it. Formalise it in the triage prompt as a structured field.

## 6. Components to build

### 6.1 `packages/core/src/utils/fraud-score.ts` (pure)
`scoreFraud(inputs) → FraudAssessment`. Pure function: takes the extracted
signals, applies weights + banding, returns the assessment. Unit-testable with
no I/O — this is where the first real tests in the repo should live.

Banding (starting): `LOW < 30 ≤ MEDIUM < 60 ≤ HIGH`.

### 6.2 `packages/api/src/lib/image-forensics.ts`
- `extractExif(bytes) → ImageForensics['exif']` — via **`exifr`** (fast, pure
  JS, robust; add to `packages/api`). Jimp's EXIF is too limited.
- `perceptualHash(bytes) → string` — Jimp already ships pHash
  (`image.hash()` / `Jimp.distanceFromHash`); no new dep.
- `sha256(bytes) → string` — `node:crypto`.
- `thumbnailHash(bytes)` — pull the EXIF thumbnail via `exifr`, hash it.
Called from the worker on the **original** buffer.

### 6.3 Duplicate store
New table `corexpert-{stage}-image-hashes` (CDK, mirror the existing table
constructs):
- PK `sha256` → exact-dupe via `GetItem` (O(1)).
- Near-dupe: store the `pHash` and query by an **LSH band key** GSI (split the
  hash into k bands; a shared band = candidate; confirm by Hamming). For dev
  volume, a bounded `Scan`-and-compare of recent hashes is acceptable and much
  simpler — start there, add LSH when volume warrants. **Log the cap** so
  "0 dupes" never silently means "only scanned 100."
- Write every image's hashes here at confirm/triage time.

### 6.4 Plate cross-check
- OCR the `REGISTRATION_PLATE` image (Bedrock vision can read it in the same
  call — cheapest; or Textract).
- Compare against `caseData.vehicle` (make/model/colour) and the OneAutoAPI
  record (`vehicles/lookup.ts` already integrates it). Emit `VEHICLE_MISMATCH`.

### 6.5 Weather cross-check (Tier D, optional/last)
`postcode` + `incidentDate` → historical weather API → compare against a
weather descriptor the vision model extracts from the scene. Cheap, and the
*good* version of the "does the scene match the claimed time" instinct that
shadow analysis fails at.

### 6.6 Worker integration
In `triage/worker.ts`, after the S3 fetch and **before** downscaling:
1. `extractExif` + hashes per image → persist onto `CaseImage.forensics`.
2. Dup lookups against the hash store.
3. Feed the triage prompt the fraud-screen ask (Tier C/D semantic signals) as
   structured output fields.
4. Call `scoreFraud(...)` → `triageResult.fraudAssessment`.
5. Fold into routing: `requiresXpertReview ||= fraudAssessment.band !== 'LOW'`.

## 7. Scoring, calibration & routing

- Score = capped sum of fired weights (cap 100). No signal alone auto-fails;
  the design intent is that **combinations** push into HIGH.
- Weights above are guesses. Ship them behind the same SSM-config pattern used
  for the model picker and payment-grace period, so they're tunable without a
  redeploy once real cases accumulate. Log every fired reason; review the
  distribution after N cases and re-weight.
- Routing (**decided**): any non-LOW band → **badge + always refer to Xpert**.
  Never auto-reject, never block publish — a human always makes the call. This
  **overrides the "INELIGIBLE is terminal" shortcut** in the worker: a
  suspected-fraud case reaches the queue even when we wouldn't take the job
  (repeat-offender / pattern value). LOW → normal flow, assessment still stored.

## 8. Xpert UI

`apps/admin/src/pages/XpertReview.tsx` gains a Fraud panel: band pill
(green/amber/red), the itemised `reasons` (code + detail + which image), and
the `notRun` list so the Xpert sees *"GPS check: no location data"* rather than
a silent pass. Xpert queue list (`XpertQueue.tsx`) shows the band pill so
high-risk cases sort to the top.

## 9. Phasing (highest ROI first)

1. **Foundation** — `ImageForensics`/`FraudAssessment` types, `fraud-score.ts`
   (+ tests), EXIF extraction, Tier-A timing rules, Xpert panel. Self-contained,
   no new infra beyond the `exifr` dep.
2. **Duplicates** — hash store table + Tier-B signals. Highest fraud-catch per
   unit effort after timing.
3. **Semantic** — Tier-D via the existing vision call: `VEHICLE_MISMATCH`
   (formalise the mismatch the model already reports), cross-photo, screen
   re-photo. Mostly a prompt + schema change.
4. **Tamper** — thumbnail-mismatch, double-compression, C2PA/SynthID reading.
5. **Weather** cross-check.
6. (Later) reverse-image web search; LSH for near-dup at scale.

## 10. Open decisions for you

1. **Threat model** — is warranty fraud (old-damage-as-new) really primary? It
   sets the weighting.
2. ~~HIGH-band action~~ — **DECIDED**: any non-LOW band badges and always refers
   to Xpert; never auto-reject, never block publish. See §7.
3. **Retro-scan** — run forensics over existing cases' images (bytes are still
   in S3 with EXIF intact), or new cases only?
4. **Weather / reverse-image** pull in third-party APIs (cost + a data-sharing
   consideration for customer photos). In scope?
5. **`exifr` dependency** OK to add to `packages/api`?
```

Nothing here is built — this is a plan, not code.
