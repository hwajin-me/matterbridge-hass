import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

/** Minimal DOM fixture for exercising dashboard event handlers without a browser or robot. */
class Element {
  children: Element[] = [];
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  style: Record<string, string> = {};
  naturalWidth = 100;
  naturalHeight = 100;
  src = '';
  onchange?: () => void;
  onclick?: (event?: unknown) => void;
  onload?: () => void;
  constructor(readonly tag = '') {}
  replaceChildren(...children: Element[]): void {
    this.children = children;
    if (this.tag === 'select') this.value = children[0]?.value ?? '';
  }
  append(...children: Element[]): void {
    this.children.push(...children);
  }
  getBoundingClientRect(): object {
    return { left: 10, top: 20, width: 200, height: 200 };
  }
}

it('selects map destinations without moving until explicitly submitted and disables resized or stale maps', async () => {
  const elements = new Map<string, Element>();
  const element = (id: string): Element => {
    let value = elements.get(id);
    if (!value) {
      value = new Element(['vacuum', 'map'].includes(id) ? 'select' : 'div');
      elements.set(id, value);
    }
    return value;
  };
  const location = { width: 100, height: 100, stale: false, pixel: { x: 25, y: 75 }, position: { x: 250, y: 750 }, room: 'Living', calibration: [{}], updated: 'recent' };
  const posts: unknown[] = [];
  const context = createContext({
    document: { hidden: true, getElementById: element, createElement: (tag: string) => new Element(tag), createTextNode: () => new Element(), querySelectorAll: () => [] },
    setTimeout: vi.fn(),
    AbortSignal,
    Date,
    fetch: async (_url: string, options: { method?: string; body?: string }) => {
      if (options.method === 'POST') posts.push(JSON.parse(options.body ?? '{}'));
      const data =
        options.method === 'POST'
          ? { ok: true }
          : _url.includes('vacuum-map?')
            ? { image: 'data:image/png;base64,test', location, revision: 'map-v1' }
            : {
                vacuums: [
                  {
                    entityId: 'vacuum.robot',
                    name: 'Robot',
                    state: 'idle',
                    commands: [],
                    maps: ['image.map'],
                    companions: [],
                    metadata: { rooms: [], maps: [], presets: [] },
                    metadataRevision: 'rooms-v1',
                    advancedControls: { goTo: 'move' },
                  },
                ],
              };
      return { ok: true, json: async (): Promise<unknown> => data };
    },
  });
  runInContext(readFileSync(new URL('../apps/frontend/build/dashboard.js', import.meta.url), 'utf8'), context);
  await runInContext('refresh()', context);
  element('map-image').onload?.();
  expect(element('robot-marker').hidden).toBe(false);
  expect(element('robot-marker').style.left).toBe('25%');
  element('map-image').onclick?.({ clientX: 60, clientY: 170 });
  expect(posts).toHaveLength(0);
  expect(element('go-to').disabled).toBe(false);
  element('go-to').onclick?.();
  await runInContext('Promise.resolve()', context);
  expect(posts).toEqual([{ vacuum: 'vacuum.robot', command: 'goTo', map: 'image.map', point: { x: 25, y: 75 }, revision: 'map-v1' }]);
  await runInContext('refresh()', context);
  element('map-image').naturalWidth = 1280;
  element('map-image').onload?.();
  expect(element('robot-marker').hidden).toBe(true);
  expect(element('go-to').disabled).toBe(true);
  element('map-image').naturalWidth = 100;
  location.stale = true;
  await runInContext('refresh()', context);
  element('map-image').onload?.();
  element('map-image').onclick?.({ clientX: 60, clientY: 170 });
  expect(element('go-to').disabled).toBe(true);
  expect(posts).toHaveLength(1);
});
