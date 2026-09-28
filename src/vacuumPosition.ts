/** A point in vacuum coordinates or image pixels, as documented by its source. */
export interface VacuumPoint {
  x: number;
  y: number;
}
/** Three matching vacuum/image points defining an affine transform. */
export interface VacuumCalibration {
  vacuum: VacuumPoint;
  map: VacuumPoint;
}
/** Validated location information from the selected map entity. */
export interface VacuumPosition {
  position: VacuumPoint | null;
  pixel: VacuumPoint | null;
  room: string | null;
  calibration: VacuumCalibration[];
  width: number | null;
  height: number | null;
  updated: string;
  stale: boolean;
}

/**
 * Narrows an external point without numeric coercion.
 * @param {unknown} value Source object.
 * @returns {VacuumPoint | null} Finite bounded coordinates, or null.
 */
export function vacuumPoint(value: unknown): VacuumPoint | null {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null;
  const { x, y } = value;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 1e7 && Math.abs(y) <= 1e7 ? { x, y } : null;
}

/**
 * Converts coordinates using three non-collinear calibration pairs, including rotation and reflection.
 * @param {VacuumPoint} point Input coordinates.
 * @param {VacuumCalibration[]} calibration Exactly three valid pairs.
 * @param {boolean} inverse Convert image pixels to vacuum coordinates when true.
 * @returns {VacuumPoint | null} Converted coordinates, or null for degenerate calibration.
 */
export function transformVacuumPoint(point: VacuumPoint, calibration: VacuumCalibration[], inverse = false): VacuumPoint | null {
  if (calibration.length !== 3) return null;
  const [a, b, c] = calibration.map((pair) => (inverse ? pair.map : pair.vacuum));
  const [p, q, r] = calibration.map((pair) => (inverse ? pair.vacuum : pair.map));
  const determinant = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(determinant) < 1e-8) return null;
  const u = ((point.x - a.x) * (c.y - a.y) - (c.x - a.x) * (point.y - a.y)) / determinant;
  const v = ((b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y)) / determinant;
  return vacuumPoint({ x: p.x + u * (q.x - p.x) + v * (r.x - p.x), y: p.y + u * (q.y - p.y) + v * (r.y - p.y) });
}

/**
 * Reads extractor attributes from the displayed map only; never mixes differently sized aliases.
 * @param {object} attributes HA map state attributes.
 * @param {string} updated HA source last_updated timestamp.
 * @param {number} now Current Unix time in milliseconds.
 * @returns {VacuumPosition} Position and calibration, with stale status after 120 seconds.
 */
export function readVacuumPosition(attributes: object, updated: string, now = Date.now()): VacuumPosition {
  const attrs: Record<string, unknown> = { ...attributes };
  const calibration: VacuumCalibration[] = [];
  if (Array.isArray(attrs.calibration_points) && attrs.calibration_points.length === 3) {
    for (const pair of attrs.calibration_points) {
      if (!pair || typeof pair !== 'object' || !('vacuum' in pair) || !('map' in pair)) break;
      const vacuum = vacuumPoint(pair.vacuum);
      const map = vacuumPoint(pair.map);
      if (!vacuum || !map) break;
      calibration.push({ vacuum, map });
    }
  }
  if (calibration.length !== 3 || !transformVacuumPoint({ x: 0, y: 0 }, calibration) || !transformVacuumPoint({ x: 0, y: 0 }, calibration, true)) calibration.length = 0;
  const position = vacuumPoint(attrs.vacuum_position);
  let width: number | null = null;
  let height: number | null = null;
  const image = attrs.image;
  if (image && typeof image === 'object' && 'width' in image && 'height' in image && 'scale' in image && 'rotation' in image) {
    const size = vacuumPoint({ x: image.width, y: image.height });
    if (
      size &&
      size.x > 0 &&
      size.y > 0 &&
      typeof image.scale === 'number' &&
      image.scale > 0 &&
      Number.isFinite(image.scale) &&
      typeof image.rotation === 'number' &&
      [0, 90, 180, 270].includes(image.rotation)
    ) {
      const rotated = image.rotation === 90 || image.rotation === 270;
      width = Math.trunc((rotated ? size.y : size.x) * image.scale);
      height = Math.trunc((rotated ? size.x : size.y) * image.scale);
      if (width <= 0 || height <= 0 || width > 32768 || height > 32768) {
        width = null;
        height = null;
      }
    }
  }
  const age = now - Date.parse(updated);
  return {
    position,
    pixel: position ? transformVacuumPoint(position, calibration) : null,
    room:
      typeof attrs.vacuum_room_name === 'string'
        ? attrs.vacuum_room_name.slice(0, 128)
        : typeof attrs.vacuum_room === 'number' && Number.isSafeInteger(attrs.vacuum_room)
          ? String(attrs.vacuum_room)
          : null,
    calibration,
    width,
    height,
    updated,
    stale: !Number.isFinite(age) || age > 120000 || age < -30000,
  };
}
