/**
 * @file src/measurements.ts
 * @description Validated Home Assistant measurement conversions to Matter units.
 * @license Apache-2.0
 */

/**
 * Converts a finite measurement using explicit unit factors, rejecting unknown units and overflow.
 *
 * @param {unknown} value - Numeric Home Assistant measurement.
 * @param {string | undefined} unit - Home Assistant unit symbol.
 * @param {Readonly<Record<string, number>>} factors - Multipliers to the destination unit.
 * @returns {number | null} Rounded safe integer, or null for invalid input.
 */
export function scaleMeasurement(value: unknown, unit: string | undefined, factors: Readonly<Record<string, number>>): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || unit === undefined || !Object.hasOwn(factors, unit)) return null;
  const converted = Math.round(value * factors[unit]);
  return Number.isSafeInteger(converted) ? converted : null;
}

/**
 * Converts energy to the Matter cumulative energy structure in milliwatt-hours.
 *
 * @param {unknown} value - Nonnegative energy measurement.
 * @param {string | undefined} unit - Wh, kWh, MWh, J, kJ, MJ, or GJ.
 * @returns {{ energy: number } | null} Matter energy value, or null for invalid input.
 */
export function energyToMatter(value: unknown, unit?: string): { energy: number } | null {
  const energy = scaleMeasurement(value, unit, { Wh: 1000, kWh: 1000000, MWh: 1000000000, J: 1 / 3.6, kJ: 1000 / 3.6, MJ: 1000000 / 3.6, GJ: 1000000000 / 3.6 });
  return energy === null || (typeof value === 'number' && value < 0) ? null : { energy };
}

/**
 * Encodes volume flow as tenths of a cubic metre per hour (Matter FlowMeasurement).
 *
 * @param {unknown} value - Nonnegative volume flow rate.
 * @param {string | undefined} unit - HA volume flow unit; gal denotes US liquid gallons.
 * @returns {number | null} Value in 0..65534, or null for invalid or unrepresentable flow.
 */
export function flowToMatter(value: unknown, unit?: string): number | null {
  const flow = scaleMeasurement(value, unit, {
    'm³/h': 10,
    'm³/min': 600,
    'm³/s': 36000,
    'L/h': 0.01,
    'L/min': 0.6,
    'L/s': 36,
    'mL/s': 0.036,
    'ft³/min': 16.9901079552,
    'gal/d': 0.03785411784 / 24,
    'gal/h': 0.03785411784,
    'gal/min': 2.2712470704,
  });
  return flow === null || (typeof value === 'number' && value < 0) || flow > 65534 ? null : flow;
}

/**
 * Encodes lux logarithmically according to Matter IlluminanceMeasurement.
 *
 * @param {unknown} value - Illuminance in lux.
 * @returns {number | null} 0 for darkness, 1..65534 for positive light, or null for invalid input.
 */
export function illuminanceToMatter(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value === 0) return 0;
  return Math.max(1, Math.min(65534, Math.round(10000 * Math.log10(value) + 1)));
}

/**
 * Matches sensor state classes, including HA sensors that do not provide statistics metadata.
 *
 * @param {string} expected - Mapping's state class.
 * @param {string | undefined} actual - HA sensor state class.
 * @param {string | undefined} deviceClass - HA device class.
 * @returns {boolean} Whether this mapping accepts the sensor.
 */
export function matchesSensorStateClass(expected: string, actual: string | undefined, deviceClass: string | undefined): boolean {
  if (actual === expected) return true;
  if (deviceClass === 'energy') return expected === 'total_increasing' && actual === 'total';
  return expected === 'measurement' && actual === undefined;
}
