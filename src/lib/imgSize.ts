export interface ImageSize {
  width: number;
  height: number;
}

function getPngSize(buf: Buffer): ImageSize {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function getJpegSize(buf: Buffer): ImageSize | null {
  try {
    let i = 2;
    while (i + 8 < buf.length) {
      while (i < buf.length && buf[i] === 0xff) i++;
      const marker = buf[i++];
      if (marker === 0xd9) break;

      const segLen = buf.readUInt16BE(i);

      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { height: buf.readUInt16BE(i + 3), width: buf.readUInt16BE(i + 5) };
      }

      i += segLen;
    }
  } catch {
    // malformed JPEG or buffer too small
  }
  return null;
}

function getWebpSize(buf: Buffer): ImageSize | null {
  if (buf.length < 30) return null;
  const fmt = buf.slice(12, 16).toString('ascii');

  if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return null;
}

export function getImageSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return getPngSize(buf);
  if (buf[0] === 0xff && buf[1] === 0xd8) return getJpegSize(buf);
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return getWebpSize(buf);

  return null;
}
