import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { badRequest } from './http.js';
import { toVtt } from './subtitles.js';

/**
 * Admin uploads (posters, thumbnails, subtitles). Files land in
 * data/uploads and are served from /uploads with long-lived caching.
 * In production, point UPLOADS_DIR at a mounted volume or swap this module
 * for an object-storage adapter (S3, R2, GCS) — callers only use the URL.
 */
mkdirSync(path.join(config.uploadsDir, 'images'), { recursive: true });
mkdirSync(path.join(config.uploadsDir, 'subtitles'), { recursive: true });

export const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }).single('file');
export const subtitleUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1.5 * 1024 * 1024, files: 1 } }).single('file');

/** Identify the format from the file's magic bytes, never from the client-supplied type. */
function sniffImage(buf: Buffer): 'jpg' | 'png' | 'webp' | 'avif' | 'gif' | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(4, 12).toString('ascii').startsWith('ftypavi')) return 'avif';
  if (buf.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
  return null;
}

const name = (ext: string) => `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${ext}`;

export async function saveImage(file?: Express.Multer.File): Promise<string> {
  if (!file) throw badRequest('Choose an image to upload.');
  const ext = sniffImage(file.buffer);
  if (!ext) throw badRequest('Upload a JPG, PNG, WebP, AVIF or GIF image.');
  const fileName = name(ext);
  await writeFile(path.join(config.uploadsDir, 'images', fileName), file.buffer);
  return `/uploads/images/${fileName}`;
}

export async function saveSubtitle(file?: Express.Multer.File): Promise<string> {
  if (!file) throw badRequest('Choose a subtitle file to upload.');
  if (!/\.(srt|vtt)$/i.test(file.originalname)) throw badRequest('Upload an .srt or .vtt subtitle file.');
  const vtt = toVtt(file.buffer);
  if (!/-->/.test(vtt)) throw badRequest('That file doesn’t contain any subtitle cues.');
  const fileName = name('vtt');
  await writeFile(path.join(config.uploadsDir, 'subtitles', fileName), vtt);
  return `/uploads/subtitles/${fileName}`;
}
