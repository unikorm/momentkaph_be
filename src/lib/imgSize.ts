export function getAvifSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;

  const ispeData = findIspe(buf, 0, buf.length);
  if (ispeData === null) return null;

  // ispe is a FullBox: 4 version/flags bytes, then width and height as big-endian u32s.
  const width = buf.readUInt32BE(ispeData + 4);
  const height = buf.readUInt32BE(ispeData + 8);
  return { width, height };
}

// helpers

// Walks the boxes in [start, end), descending into the containers on the
// path to ispe (meta -> iprp -> ipco). Returns the dataOffset of the first
// ispe found, or null.
function findIspe(buf: Buffer, start: number, end: number): number | null {
  let p = start;
  while (p + 8 <= end) {
    const box = readBox(buf, p);
    if (box.size < 8) break; // 0 (= to EOF) or 1 (= 64-bit largesize) — bail instead of looping

    if (box.type === 'ispe') return box.dataOffset;

    // Descend, don't skip. meta is a FullBox so its children start 4 bytes
    // past the header; iprp and ipco are plain boxes.
    if (box.type === 'meta') {
      const found = findIspe(buf, box.dataOffset + 4, p + box.size);
      if (found !== null) return found;
    } else if (box.type === 'iprp' || box.type === 'ipco') {
      const found = findIspe(buf, box.dataOffset, p + box.size);
      if (found !== null) return found;
    }

    p += box.size;
  }
  return null;
}

function readBox(buf: Buffer, offset: number): { type: string; size: number; dataOffset: number } {
  const size = buf.readUInt32BE(offset);
  const type = buf.toString('ascii', offset + 4, offset + 8);
  return { type, size, dataOffset: offset + 8 };
}