import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Case, CaseImage } from '@corexpert/core';

const BUCKET = process.env['IMAGE_BUCKET'] ?? '';
const VIEW_EXPIRY = 900; // 15 minutes — long enough for a review session

const s3 = new S3Client({});

/** A case image augmented with a short-lived presigned GET URL for viewing. */
export type ViewableImage = CaseImage & { url: string };

/**
 * Generate a presigned GET URL for a single stored image.
 * Images live in a private S3 bucket, so the frontend can't load them by key —
 * it needs a signed URL.
 */
async function presignImage(image: CaseImage): Promise<ViewableImage> {
  const command = new GetObjectCommand({
    Bucket: image.s3Bucket || BUCKET,
    Key: image.s3Key,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: VIEW_EXPIRY });
  return { ...image, url };
}

/**
 * Return a copy of the case with every image augmented with a presigned GET URL.
 * Used by the Xpert/admin case views so reviewers can actually see the damage
 * photos rather than just filenames.
 */
export async function withViewableImages(caseData: Case): Promise<Case & { images: ViewableImage[] }> {
  const images = await Promise.all((caseData.images ?? []).map(presignImage));
  return { ...caseData, images };
}

/** Presign a list of images (for endpoints that only need the photos, not the case). */
export async function presignImages(images: CaseImage[]): Promise<ViewableImage[]> {
  return Promise.all((images ?? []).map(presignImage));
}
