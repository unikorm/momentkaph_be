import type http from 'http';
import { listObjects, getObjectRange } from '../lib/aws.js';
import { getAvifSize } from '../lib/imgSize.js';

interface GalleryImage {
  fullUrl: string;
  mobileUrl: string;
  width?: number;
  height?: number;
  mobileWidth?: number;
  mobileHeight?: number;
}

const VALID_GALLERY_TYPES = new Set([
  'weddings', 'portrait', 'love-story', 'family',
  'studio', 'pregnancy', 'baptism', 'newborn',
]);

export async function cloudStorageHandler(
  res: http.ServerResponse,
  galleryType: string,
  requestId: string
): Promise<void> {
  if (!VALID_GALLERY_TYPES.has(galleryType)) {
    console.error(`[${requestId}] Invalid gallery type: ${galleryType}`);
    res.writeHead(404);
    res.end();
    return;
  }

  const cdnUrl = process.env.CLOUD_STORAGE_BUCKET_PATH!.replace(/\/$/, '');
  const keys = await listObjects(galleryType);
  const images = keys.filter(k => !k.endsWith('/')); // filter out "folders"

  const results: GalleryImage[] = await Promise.all(
    images.map(async (key) => {
      const fullUrl = `${cdnUrl}/${key}`;
      const fileName = key.split('/').pop()!;
      const mobileUrl = `${cdnUrl}/${galleryType}/mobile/${fileName}`;
      const image: GalleryImage = { fullUrl, mobileUrl };

      try {
        const buf = await getObjectRange(key);
        const size = getAvifSize(buf);
        if (size) {
          image.width = size.width;
          image.height = size.height;
          image.mobileWidth = Math.floor(size.width / 3);
          image.mobileHeight = Math.floor(size.height / 3);
        }
      } catch {
        console.error(`[${requestId}] Failed to get size for ${key}, skipping dimensions`);
      }
      return image;
    })
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(results));
}
