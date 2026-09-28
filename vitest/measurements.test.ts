/**
 * @file vitest/measurements.test.ts
 * @description Matter measurement encoding and Home Assistant metadata regression tests.
 * @license Apache-2.0
 */

import { energyToMatter, flowToMatter, illuminanceToMatter, matchesSensorStateClass, scaleMeasurement } from '../src/measurements.js';

describe('Matter measurements', () => {
  it.each([
    [1, 'Wh', 1000],
    [1.5, 'kWh', 1500000],
    [1, 'MWh', 1000000000],
    [3600, 'J', 1000],
    [3.6, 'kJ', 1000],
    [3.6, 'MJ', 1000000],
    [3.6, 'GJ', 1000000000],
    [0, 'Wh', 0],
  ])('converts energy %s %s to milliwatt-hours', (value, unit, expected) => {
    expect(energyToMatter(value, unit)).toEqual({ energy: expected });
  });

  it.each([
    [1, 'm³/h', 10],
    [1, 'm³/min', 600],
    [1, 'm³/s', 36000],
    [1000, 'L/h', 10],
    [10, 'L/min', 6],
    [1, 'L/s', 36],
    [1000, 'mL/s', 36],
    [1, 'ft³/min', 17],
    [24000, 'gal/d', 38],
    [1000, 'gal/h', 38],
    [10, 'gal/min', 23],
    [0, 'L/s', 0],
    [6553.4, 'm³/h', 65534],
  ])('converts flow %s %s to Matter units', (value, unit, expected) => {
    expect(flowToMatter(value, unit)).toBe(expected);
  });

  it.each([Number.NaN, Infinity, -Infinity, '1', null, undefined, -0.001, Number.MAX_VALUE])('rejects invalid or overflowing input %s', (value) => {
    expect(energyToMatter(value, 'kWh')).toBeNull();
    expect(flowToMatter(value, 'L/s')).toBeNull();
  });

  it('rejects unknown units, reserved flow values, and unsafe integers', () => {
    expect(energyToMatter(1, 'W')).toBeNull();
    expect(flowToMatter(1, 'm³')).toBeNull();
    expect(flowToMatter(6553.5, 'm³/h')).toBeNull();
    expect(scaleMeasurement(1, undefined, { W: 1000 })).toBeNull();
    expect(scaleMeasurement(1, 'toString', {})).toBeNull();
    expect(scaleMeasurement(Number.MAX_SAFE_INTEGER, 'W', { W: 1000 })).toBeNull();
    expect(scaleMeasurement(-1.5, 'W', { W: 1000 })).toBe(-1500);
  });

  it.each([
    [0, 0],
    [0.001, 1],
    [1, 1],
    [10, 10001],
    [100, 20001],
    [Number.MAX_VALUE, 65534],
  ])('encodes %s lux', (lux, expected) => {
    expect(illuminanceToMatter(lux)).toBe(expected);
  });

  it.each([-1, Number.NaN, Infinity, '10', undefined])('rejects invalid lux %s', (lux) => {
    expect(illuminanceToMatter(lux)).toBeNull();
  });

  it('accepts sensors without statistics metadata but requires cumulative energy metadata', () => {
    expect(matchesSensorStateClass('measurement', undefined, 'temperature')).toBe(true);
    expect(matchesSensorStateClass('measurement', 'measurement', 'power')).toBe(true);
    expect(matchesSensorStateClass('measurement', 'total', 'power')).toBe(false);
    expect(matchesSensorStateClass('total_increasing', 'total', 'energy')).toBe(true);
    expect(matchesSensorStateClass('total_increasing', 'total_increasing', 'energy')).toBe(true);
    expect(matchesSensorStateClass('total_increasing', undefined, 'energy')).toBe(false);
    expect(matchesSensorStateClass('total_increasing', 'measurement', 'energy')).toBe(false);
  });
});
