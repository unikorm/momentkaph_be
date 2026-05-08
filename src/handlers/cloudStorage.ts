import type http from 'http';
import { listObjects, getObjectRange } from '../lib/aws.js';
import { getImageSize } from '../lib/imgSize.js';

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
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  galleryType: string,
  requestId: string
): Promise<void> {
  if (!VALID_GALLERY_TYPES.has(galleryType)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const cdnUrl = process.env.CLOUD_STORAGE_CDN_URL!.replace(/\/$/, '');
  const keys = await listObjects(`${galleryType}/`);
  const images = keys.filter(k => !k.endsWith('/'));

  const results: GalleryImage[] = await Promise.all(
    images.map(async (key) => {
      const fullUrl = `${cdnUrl}/${key}`;
      const mobileUrl = fullUrl;
      const image: GalleryImage = { fullUrl, mobileUrl };

      try {
        const buf = await getObjectRange(key);
        const size = getImageSize(buf);
        if (size) {
          image.width = size.width;
          image.height = size.height;
          image.mobileWidth = Math.floor(size.width / 3);
          image.mobileHeight = Math.floor(size.height / 3);
        }
      } catch {
        // dimension extraction is best-effort
      }

      return image;
    })
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(results));
}
