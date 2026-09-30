/**
 * The only image formats accepted and served. SVG is deliberately absent: it can carry script.
 * One map for both routes, so the upload and serving allowlists cannot drift apart.
 */
export const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

/**
 * Identifies the format from the file's first bytes. The multipart Content-Type is whatever
 * the client claims, so an HTML page labelled image/gif would otherwise be stored as a .gif.
 */
export function sniffImageExt(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}
