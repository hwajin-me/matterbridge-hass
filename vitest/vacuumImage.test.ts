import { EventEmitter } from 'node:events';

import { fetchVacuumImage } from '../src/vacuumImage.js';

const network = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('node:http', () => ({ get: network.get }));
vi.mock('node:https', () => ({ get: network.get }));

function response(status = 200, mime = 'image/png', bytes = Buffer.from('image-bytes')): void {
  network.get.mockImplementation((_url: URL, _options: unknown, callback: (value: unknown) => void) => {
    const request = new EventEmitter();
    const stream = Object.assign(new EventEmitter(), { statusCode: status, headers: { 'content-type': mime }, destroy: vi.fn() });
    Object.assign(request, {
      destroy: (error: Error) => {
        request.emit('error', error);
        request.emit('close');
      },
    });
    queueMicrotask(() => {
      callback(stream);
      stream.emit('data', bytes);
      stream.emit('end');
      request.emit('close');
    });
    return request;
  });
}

beforeEach(() => {
  network.get.mockReset();
  response();
});

describe('vacuum image proxy', () => {
  it('uses authenticated fixed image and camera endpoints and retains TLS options', async () => {
    for (const id of ['image.floor', 'camera.floor']) {
      expect(await fetchVacuumImage('wss://ha.example/api/websocket?token=discard', 'private', id, { ca: 'custom-ca', rejectUnauthorized: true })).toBe(
        'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
      );
    }
    expect(network.get.mock.calls.map((call) => String(call[0]))).toEqual(['https://ha.example/api/image_proxy/image.floor', 'https://ha.example/api/camera_proxy/camera.floor']);
    expect(network.get.mock.calls[0][1]).toEqual({ ca: 'custom-ca', rejectUnauthorized: true, headers: { Authorization: 'Bearer private' } });
  });
  it('rejects URLs, traversal and unsupported origins before sending credentials', async () => {
    for (const id of ['https://example.org', 'camera.foo/../secrets', 'sensor.map']) {
      await expect(fetchVacuumImage('ws://localhost', 'private', id)).rejects.toThrow('Invalid image entity');
    }
    await expect(fetchVacuumImage('ftp://localhost', 'private', 'image.floor')).rejects.toThrow('Invalid Home Assistant URL');
    expect(network.get).not.toHaveBeenCalled();
  });
  it.each([302, 401, 500])('rejects HTTP %s without following redirects', async (status) => {
    response(status);
    await expect(fetchVacuumImage('ws://localhost', 'private', 'image.floor')).rejects.toThrow('did not return a raster image');
    expect(network.get).toHaveBeenCalledTimes(1);
  });
  it('rejects SVG and oversized bodies', async () => {
    response(200, 'image/svg+xml');
    await expect(fetchVacuumImage('ws://localhost', 'private', 'image.floor')).rejects.toThrow('raster image');
    response(200, 'image/png', Buffer.alloc(8 * 1024 * 1024 + 1));
    await expect(fetchVacuumImage('ws://localhost', 'private', 'image.floor')).rejects.toThrow('8 MiB');
  });
  it('aborts a stalled request after ten seconds', async () => {
    vi.useFakeTimers();
    try {
      network.get.mockImplementation(() => {
        const request = new EventEmitter();
        return Object.assign(request, {
          destroy: (error: Error) => {
            request.emit('error', error);
            request.emit('close');
          },
        });
      });
      const result = fetchVacuumImage('ws://localhost', 'private', 'image.floor').catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10000);
      expect(await result).toEqual(new Error('Map request timed out'));
    } finally {
      vi.useRealTimers();
    }
  });
});
