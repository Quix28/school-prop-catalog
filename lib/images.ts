/** Allowed image types, shared by upload and serving. No SVG: it can carry script. */
export const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

/** Detects the format from the file's bytes; the client's Content-Type can lie. */
export function sniffImageExt(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}
