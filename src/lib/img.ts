/**
 * Responsive image helpers. Wikimedia thumbnails encode their width in the
 * path (".../1280px-Name.jpg"), so we can request exactly the size a slot
 * needs. Only standard thumbnail steps are used (they're cached at the edge),
 * and we never ask for more than the URL already provides.
 */
const STEPS = [250, 330, 500, 960, 1280, 1920];
const THUMB = /\/(\d+)px-([^/]+)$/;
const PROVIDER_WIDTH = /w_(\d+)/;
const providerImage = (url: string) => /^https:\/\/[^/]+\.aoneroom\.com\//.test(url) && PROVIDER_WIDTH.test(url);

export function isResizable(url?: string | null) {
  return !!url && (providerImage(url) || (/(upload|thumb)\.wikimedia\.org\/.+\/thumb\//.test(url) && THUMB.test(url)));
}

export function sized(url: string | null | undefined, width: number): string | undefined {
  if (!url) return undefined;
  if (!isResizable(url)) return url;
  if (providerImage(url)) return url.replace(PROVIDER_WIDTH, `w_${Math.min(Number(url.match(PROVIDER_WIDTH)![1]), Math.ceil(width))}`);
  const max = Number(url.match(THUMB)![1]);
  const step = STEPS.find((s) => s >= width) ?? STEPS[STEPS.length - 1];
  return url.replace(THUMB, `/${Math.min(step, max)}px-$2`);
}

export function srcSet(url: string | null | undefined, widths: number[] = STEPS): string | undefined {
  if (!url || !isResizable(url)) return undefined;
  if (providerImage(url)) {
    const max = Number(url.match(PROVIDER_WIDTH)![1]);
    return widths.filter((w) => w <= max).map((w) => `${sized(url, w)} ${w}w`).join(', ') || undefined;
  }
  const max = Number(url.match(THUMB)![1]);
  const usable = widths.filter((w) => w <= max);
  if (!usable.length) return undefined;
  return usable.map((w) => `${url.replace(THUMB, `/${w}px-$2`)} ${w}w`).join(', ');
}
