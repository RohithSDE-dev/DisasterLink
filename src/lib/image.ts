/**
 * Server-side validation for citizen-submitted photographs.
 *
 * Images arrive as data URLs (the client downscales them before upload). This
 * module rejects anything that is not a real JPEG/PNG/WebP payload: it checks the
 * declared MIME type against the decoded magic bytes, enforces a byte ceiling and
 * refuses SVG/HTML (which could carry script).
 */
export type ImageValidation =
  | { ok: true; dataUrl: string; mime: string; bytes: number; extension: string }
  | { ok: false; error: string };

export const MAX_IMAGE_BYTES = 700 * 1024; // ~700 KB decoded
export const MAX_DATA_URL_LENGTH = 1_000_000; // base64 overhead included

const SIGNATURES: { mime: string; extension: string; test: (buffer: Buffer) => boolean }[] = [
  {
    mime: "image/jpeg",
    extension: "jpg",
    test: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mime: "image/png",
    extension: "png",
    test: (buffer) =>
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a,
  },
  {
    mime: "image/webp",
    extension: "webp",
    test: (buffer) =>
      buffer.length > 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP",
  },
];

export function validateImageDataUrl(value: unknown): ImageValidation {
  if (typeof value !== "string" || !value.startsWith("data:")) {
    return { ok: false, error: "Photograph must be an uploaded image" };
  }
  if (value.length > MAX_DATA_URL_LENGTH) {
    return { ok: false, error: "Photograph is too large (maximum about 700 KB after compression)" };
  }
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) {
    return { ok: false, error: "Only JPEG, PNG or WebP images are accepted" };
  }
  const declaredMime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const base64 = match[2];
  if (base64.length % 4 !== 0) {
    return { ok: false, error: "Photograph payload is malformed" };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: "Photograph payload could not be decoded" };
  }
  if (buffer.length === 0) return { ok: false, error: "Photograph is empty" };
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Photograph is ${Math.round(buffer.length / 1024)} KB; the limit is ${MAX_IMAGE_BYTES / 1024} KB` };
  }
  const signature = SIGNATURES.find((entry) => entry.test(buffer));
  if (!signature) {
    return { ok: false, error: "File content is not a valid JPEG, PNG or WebP image" };
  }
  if (signature.mime !== declaredMime) {
    return { ok: false, error: `Declared type ${declaredMime} does not match the file content (${signature.mime})` };
  }
  return {
    ok: true,
    dataUrl: `data:${signature.mime};base64,${base64}`,
    mime: signature.mime,
    bytes: buffer.length,
    extension: signature.extension,
  };
}
