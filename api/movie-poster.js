const ALLOWED_HOST = 'image.tmdb.org';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default async function handler(request, response) {
  try {
    const rawUrl = Array.isArray(request.query?.url) ? request.query.url[0] : request.query?.url;
    const posterUrl = new URL(String(rawUrl || ''));
    if (posterUrl.protocol !== 'https:' || posterUrl.hostname !== ALLOWED_HOST || !posterUrl.pathname.startsWith('/t/p/')) {
      response.status(400).json({ error: 'Invalid poster URL' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(posterUrl, {
      headers: { Accept: 'image/*' },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !contentType.startsWith('image/')) {
      response.status(502).json({ error: 'Poster is unavailable' });
      return;
    }

    const image = Buffer.from(await upstream.arrayBuffer());
    if (image.length > MAX_IMAGE_BYTES) {
      response.status(413).json({ error: 'Poster is too large' });
      return;
    }

    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', String(image.length));
    response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(200).send(image);
  } catch {
    response.status(502).json({ error: 'Poster request failed' });
  }
}
