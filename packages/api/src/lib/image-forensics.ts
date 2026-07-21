import { createHash } from 'node:crypto';
import Jimp from 'jimp';
import exifr from 'exifr';
import type { ImageForensics, ImageExif } from '@corexpert/core';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Per-image forensic extraction. Runs in the triage worker on the ORIGINAL
// bytes (before any downscale — downscaling destroys EXIF and alters hashes).
// Every step is best-effort: a failure logs and yields undefined rather than
// breaking triage. See docs/fraud-detection-spec.md.
// ---------------------------------------------------------------------------

/** SHA-256 of the raw bytes (hex). */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Perceptual hash (hex) via Jimp's pHash. Returns undefined on decode failure. */
export async function perceptualHash(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const image = await Jimp.read(Buffer.from(bytes));
    return image.hash(); // Jimp's perceptual hash, base-radix string
  } catch (err) {
    logger.warn('perceptualHash failed', { err: String(err) });
    return undefined;
  }
}

const EXIF_PICK = [
  'DateTimeOriginal',
  'GPSLatitude',
  'GPSLongitude',
  'Make',
  'Model',
  'Software',
] as const;

/** Extract the EXIF fields we score on. Best-effort; sets `stripped` if none. */
export async function extractExif(bytes: Uint8Array): Promise<ImageExif> {
  let raw: Record<string, unknown> | undefined;
  try {
    raw = await exifr.parse(Buffer.from(bytes), { pick: EXIF_PICK as unknown as string[] });
  } catch (err) {
    logger.warn('extractExif failed', { err: String(err) });
  }

  if (!raw || Object.keys(raw).length === 0) {
    return { stripped: true };
  }

  const exif: ImageExif = {};

  const dto = raw['DateTimeOriginal'];
  if (dto instanceof Date && !Number.isNaN(dto.getTime())) {
    exif.dateTimeOriginal = dto.toISOString();
  }

  const lat = raw['GPSLatitude'];
  const lng = raw['GPSLongitude'];
  // exifr with default options returns GPS already converted to signed decimals.
  if (typeof lat === 'number' && typeof lng === 'number') {
    exif.gps = { lat, lng };
  }

  if (typeof raw['Make'] === 'string') exif.cameraMake = raw['Make'].trim();
  if (typeof raw['Model'] === 'string') exif.cameraModel = raw['Model'].trim();
  if (typeof raw['Software'] === 'string') exif.software = raw['Software'].trim();

  // Embedded EXIF thumbnail: editors often leave the original un-edited
  // thumbnail behind, so a mismatch vs the full image is a strong tamper flag.
  try {
    const thumb = await exifr.thumbnail(Buffer.from(bytes));
    if (thumb && thumb.byteLength > 0) {
      const thumbImage = await Jimp.read(Buffer.from(thumb));
      exif.thumbnailPHash = thumbImage.hash();
    }
  } catch {
    // No thumbnail (or undecodable) — not a signal either way.
  }

  return exif;
}

/**
 * Full forensic pass over one image's original bytes. `plateReadout` is filled
 * separately by the plate cross-check (a later phase), not here.
 */
export async function extractForensics(bytes: Uint8Array): Promise<ImageForensics> {
  const [pHash, exif] = await Promise.all([perceptualHash(bytes), extractExif(bytes)]);
  const forensics: ImageForensics = { sha256: sha256(bytes), exif };
  if (pHash) forensics.pHash = pHash;
  return forensics;
}

/** Hamming distance between two equal-length Jimp hashes; Infinity if unusable. */
export function hashDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}
