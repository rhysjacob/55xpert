import Jimp from 'jimp';

// Bedrock/Anthropic reject any single image whose base64 payload exceeds 5 MB.
// Stay comfortably under that to leave room for the JSON envelope.
const MAX_BASE64_BYTES = 4_500_000;
// Anthropic downsamples images larger than 1568px on the long edge, so capping
// here costs no useful detail while drastically shrinking large phone photos.
const MAX_EDGE = 1568;

/** Approximate base64-encoded length of a raw byte buffer (4 chars / 3 bytes). */
function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

/**
 * Ensure an image fits within Bedrock's per-image size limit. Images already
 * under the limit pass through untouched; oversized ones are downscaled to
 * {@link MAX_EDGE} and re-encoded as JPEG, dropping quality if still too large.
 */
export async function prepareImageForBedrock(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  if (base64Length(bytes.byteLength) <= MAX_BASE64_BYTES) {
    return { base64: Buffer.from(bytes).toString('base64'), mimeType };
  }

  const image = await Jimp.read(Buffer.from(bytes));
  if (image.bitmap.width > MAX_EDGE || image.bitmap.height > MAX_EDGE) {
    image.scaleToFit(MAX_EDGE, MAX_EDGE);
  }

  let quality = 85;
  let out = await image.quality(quality).getBufferAsync(Jimp.MIME_JPEG);
  while (base64Length(out.byteLength) > MAX_BASE64_BYTES && quality > 40) {
    quality -= 15;
    out = await image.quality(quality).getBufferAsync(Jimp.MIME_JPEG);
  }

  return { base64: out.toString('base64'), mimeType: Jimp.MIME_JPEG };
}
