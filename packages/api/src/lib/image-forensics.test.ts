import { describe, it, expect } from 'vitest';
import Jimp from 'jimp';
import { extractForensics, extractExif, perceptualHash, sha256, hashDistance } from './image-forensics';

async function solidJpeg(width: number, height: number, colour: number): Promise<Uint8Array> {
  const img = new Jimp(width, height, colour);
  const buf = await img.getBufferAsync(Jimp.MIME_JPEG);
  return new Uint8Array(buf);
}

/**
 * A JPEG with COARSE structure (a light block on a dark field, positioned by
 * `seed`). pHash downsamples internally, so only large-scale structure
 * survives — fine patterns and flat colours all collide.
 */
async function patternedJpeg(seed: number): Promise<Uint8Array> {
  const img = new Jimp(64, 64, 0x000000ff);
  const ox = (seed % 2) * 32;
  const oy = (seed < 2 ? 0 : 1) * 32;
  for (let x = ox; x < ox + 32; x++) {
    for (let y = oy; y < oy + 32; y++) {
      img.setPixelColor(0xffffffff, x, y);
    }
  }
  const buf = await img.getBufferAsync(Jimp.MIME_JPEG);
  return new Uint8Array(buf);
}

describe('image-forensics', () => {
  it('reports stripped EXIF for an image with no metadata', async () => {
    const bytes = await solidJpeg(64, 64, 0xff0000ff);
    const exif = await extractExif(bytes);
    expect(exif.stripped).toBe(true);
    expect(exif.dateTimeOriginal).toBeUndefined();
  });

  it('sha256 is deterministic and content-addressed', async () => {
    const a = await solidJpeg(32, 32, 0x112233ff);
    const b = await solidJpeg(32, 32, 0x112233ff);
    const c = await solidJpeg(32, 32, 0x445566ff);
    expect(sha256(a)).toBe(sha256(b));
    expect(sha256(a)).not.toBe(sha256(c));
    expect(sha256(a)).toHaveLength(64);
  });

  it('perceptual hash: identical to itself (distance 0), differs on structure', async () => {
    // pHash keys on structure, so use patterned images — flat colours collide.
    const a = await patternedJpeg(0); // block top-left
    const b = await patternedJpeg(3); // block bottom-right
    const hA = await perceptualHash(a);
    const hB = await perceptualHash(b);
    expect(hA).toBeTruthy();
    expect(hB).toBeTruthy();
    expect(hashDistance(hA!, hA!)).toBe(0);
    expect(hashDistance(hA!, hB!)).toBeGreaterThan(0);
  });

  it('hashDistance returns Infinity for mismatched/empty hashes', () => {
    expect(hashDistance('abc', 'abcd')).toBe(Infinity);
    expect(hashDistance('', 'abc')).toBe(Infinity);
  });

  it('extractForensics returns sha256 + exif and never throws on a valid image', async () => {
    const bytes = await solidJpeg(64, 64, 0xabcdefff);
    const fx = await extractForensics(bytes);
    expect(fx.sha256).toHaveLength(64);
    expect(fx.exif).toBeDefined();
    expect(fx.pHash).toBeTruthy();
  });
});
