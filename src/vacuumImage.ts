import { get as httpGet } from 'node:http';
import { get as httpsGet, type RequestOptions } from 'node:https';

/**
 * Retrieves a bounded image from a fixed HA proxy endpoint without following redirects.
 * @param {string} host Configured HA WebSocket origin.
 * @param {string} token HA access token, retained server-side.
 * @param {string} entityId Image or camera entity ID, never a URL.
 * @param {RequestOptions} tls Existing HA TLS settings.
 * @returns {Promise<string>} Raster image data URL (maximum 8 MiB, 10 seconds).
 */
export async function fetchVacuumImage(host: string, token: string, entityId: string, tls: RequestOptions = {}): Promise<string> {
  if (!/^(camera|image)\.[a-z0-9_]+$/.test(entityId)) throw new Error('Invalid image entity');
  const url = new URL(host);
  url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Home Assistant URL');
  url.pathname = `/api/${entityId.startsWith('camera.') ? 'camera_proxy' : 'image_proxy'}/${entityId}`;
  url.search = '';
  url.hash = '';
  return await new Promise<string>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsGet : httpGet)(url, { ...tls, headers: { Authorization: `Bearer ${token}` } }, (response) => {
      const mime = response.headers['content-type']?.split(';')[0].trim();
      if (response.statusCode !== 200 || !mime || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
        response.destroy();
        reject(new Error('Home Assistant did not return a raster image'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) request.destroy(new Error('Map image exceeds 8 MiB'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(`data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`));
    });
    const timer = setTimeout(() => request.destroy(new Error('Map request timed out')), 10000);
    request.on('error', reject);
    request.on('close', () => clearTimeout(timer));
  });
}
