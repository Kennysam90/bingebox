import { Router } from 'express';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { intParam, notFound, route } from './http.js';

/**
 * Serves every subtitle track as same-origin WebVTT. Browsers only load
 * <track> files that are WebVTT and CORS-readable, so remote .srt files are
 * fetched once, converted, and cached on disk.
 */
export const subtitlesRouter = Router();

const CACHE_DIR = path.join(config.dataDir, 'cache', 'subtitles');
mkdirSync(CACHE_DIR, { recursive: true });
const MAX_BYTES = 1_500_000;

subtitlesRouter.get(
  '/:id.vtt',
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const row = db.prepare('SELECT url FROM subtitles WHERE id = ?').get(id) as { url: string } | undefined;
    if (!row) throw notFound('Subtitle not found.');
    const cacheFile = path.join(CACHE_DIR, `${id}-${hash(row.url)}.vtt`);

    let vtt: string | undefined;
    try {
      vtt = await readFile(cacheFile, 'utf8');
    } catch {
      const raw = await loadSource(row.url);
      vtt = toVtt(raw);
      await writeFile(cacheFile, vtt).catch(() => {});
    }
    res.set('Content-Type', 'text/vtt; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(vtt);
  })
);

async function loadSource(url: string): Promise<Buffer> {
  if (url.startsWith('/uploads/')) {
    const file = path.join(config.uploadsDir, path.normalize(url.slice('/uploads/'.length)).replace(/^(\.\.(\/|\\|$))+/, ''));
    if (!file.startsWith(config.uploadsDir)) throw notFound('Subtitle not found.');
    return readFile(file);
  }
  if (!/^https:\/\//.test(url)) throw notFound('Subtitle not found.');
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'follow' });
  if (!res.ok) throw notFound('Subtitle source is unavailable right now.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw notFound('Subtitle file is too large.');
  return buf;
}

/** Decodes UTF-8 (falling back to Windows-1252) and converts SRT to WebVTT. */
export function toVtt(buf: Buffer): string {
  let text = buf.toString('utf8');
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (text.startsWith('WEBVTT')) return text + '\n';
  const body = text
    // 00:01:02,345 --> 00:01:04,000  →  00:01:02.345 --> 00:01:04.000
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2')
    // Pad single-digit hours ("0:01:02.345") which some players reject.
    .replace(/(^|\s)(\d):(\d{2}:\d{2}\.\d{1,3})/gm, '$10$2:$3')
    // SubRip font tags aren't valid WebVTT.
    .replace(/<\/?font[^>]*>/gi, '');
  return `WEBVTT\n\n${body}\n`;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
