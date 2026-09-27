import type http from 'http';
import { listObjects, getObjectRange, presignGet } from '../lib/aws.js';
import { getAvifSize } from '../lib/imgSize.js';

interface GalleryImage {
  fullUrl: string;
  mobileUrl: string;
  width?: number;
  height?: number;
  mobileWidth?: number;
  mobileHeight?: number;
}

type Size = { width: number; height: number };

const VALID_GALLERY_TYPES = new Set([
  'weddings', 'portrait', 'love-story', 'family',
  'studio', 'pregnancy', 'baptism', 'newborn',
]);

// Objects are immutable (a replaced photo gets a new key), so a key's
// dimensions never change. Keep them for the life of the process: only
// the first request after a restart pays for the range reads. Failures
// are not cached, so they're retried on the next request.
const sizeCache = new Map<string, Size>();

async function getSize(key: string, requestId: string): Promise<Size | null> {
  const cached = sizeCache.get(key);
  if (cached) return cached;

  try {
    const size = getAvifSize(await getObjectRange(key));
    if (size) sizeCache.set(key, size);
    return size;
  } catch {
    console.error(`[${requestId}] Failed to get size for ${key}, skipping dimensions`);
    return null;
  }
}

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

  const keys = await listObjects(galleryType);
  const images = keys.filter(k => !k.endsWith('/')); // filter out folder markers

  // One timestamp for the whole response, so every URL in it comes from
  // the same signing window even if the request straddles a boundary.
  const now = Date.now();

  const results: GalleryImage[] = await Promise.all(
    images.map(async (key) => {
      const fileName = key.split('/').pop()!;
      const image: GalleryImage = {
        fullUrl: presignGet(key, now),
        mobileUrl: presignGet(`${galleryType}/mobile/${fileName}`, now),
      };

      const size = await getSize(key, requestId);
      if (size) {
        image.width = size.width;
        image.height = size.height;
        image.mobileWidth = Math.floor(size.width / 3);
        image.mobileHeight = Math.floor(size.height / 3);
      }
      return image;
    })
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(results));
}