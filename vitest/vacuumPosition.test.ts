import { readVacuumPosition, transformVacuumPoint, vacuumPoint } from '../src/vacuumPosition.js';

const calibration = [
  { vacuum: { x: 1000, y: 2000 }, map: { x: 0, y: 100 } },
  { vacuum: { x: 2000, y: 2000 }, map: { x: 100, y: 100 } },
  { vacuum: { x: 1000, y: 3000 }, map: { x: 0, y: 0 } },
];
const now = Date.parse('2026-09-28T00:00:00Z');

describe('vacuum position calibration', () => {
  it('converts translated, scaled and reflected coordinates both ways', () => {
    expect(transformVacuumPoint({ x: 1500, y: 2500 }, calibration)).toEqual({ x: 50, y: 50 });
    expect(transformVacuumPoint({ x: 50, y: 50 }, calibration, true)).toEqual({ x: 1500, y: 2500 });
    const rotated = calibration.map((pair) => ({ ...pair, map: { x: pair.map.y, y: pair.map.x } }));
    expect(transformVacuumPoint({ x: 1250, y: 2800 }, rotated)).toEqual({ x: 20, y: 25 });
  });
  it('rejects malformed points and singular calibration rather than guessing position', () => {
    for (const value of [null, [1, 2], { x: '1', y: 2 }, { x: Number.NaN, y: 1 }, { x: Infinity, y: 1 }, { x: 1e8, y: 1 }]) expect(vacuumPoint(value)).toBeNull();
    expect(vacuumPoint({ x: 0, y: -10 })).toEqual({ x: 0, y: -10 });
    expect(transformVacuumPoint({ x: 1, y: 1 }, [])).toBeNull();
    expect(transformVacuumPoint({ x: 1, y: 1 }, [calibration[0], calibration[0], calibration[1]])).toBeNull();
  });
  it('reads the robot room and image dimensions, flags stale timestamps and preserves raw coordinates without calibration', () => {
    const attrs = {
      vacuum_position: { x: 1500, y: 2500, a: 90 },
      vacuum_room_name: '거실',
      calibration_points: calibration,
      image: { width: 100, height: 200, scale: 2, rotation: 90 },
    };
    expect(readVacuumPosition(attrs, new Date(now).toISOString(), now)).toMatchObject({ room: '거실', pixel: { x: 50, y: 50 }, width: 400, height: 200, stale: false });
    expect(readVacuumPosition(attrs, new Date(now - 120001).toISOString(), now).stale).toBe(true);
    expect(readVacuumPosition(attrs, 'bad', now).stale).toBe(true);
    expect(readVacuumPosition({ vacuum_position: attrs.vacuum_position }, new Date(now).toISOString(), now)).toMatchObject({
      pixel: null,
      position: { x: 1500, y: 2500 },
      calibration: [],
      width: null,
    });
    expect(readVacuumPosition({ ...attrs, calibration_points: [null, {}, {}] }, '', now).calibration).toEqual([]);
    expect(readVacuumPosition({ ...attrs, image: { width: 100, height: 200, scale: 2, rotation: '90' } }, '', now).width).toBeNull();
  });
});
