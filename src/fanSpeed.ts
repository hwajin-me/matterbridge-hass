/**
 * @file src/fanSpeed.ts
 * @description Maps Home Assistant fan speed capabilities to Matter percentages.
 * @license Apache-2.0
 */
import type { HassState } from './homeAssistant.js';

/**
 * Read the number of discrete speeds represented by HA's percentage step.
 *
 * @param {HassState} [state] Source fan capabilities.
 * @returns {number | undefined} Speed count (1–100), or undefined for absent/invalid metadata.
 */
export function getFanSpeedCount(state?: HassState): number | undefined {
  const step = state?.attributes.percentage_step;
  if (typeof step === 'number' && Number.isFinite(step) && step >= 1 && step <= 100) {
    const count = Math.round(100 / step);
    // Allow rounded recurring steps such as 33.33%, but not arbitrary nonuniform ranges.
    if (Math.abs(count * step - 100) <= 0.1) return count;
  }
  const count = state?.attributes.speed_count;
  return typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 100 ? count : undefined;
}

/**
 * Map a percentage to the nearest supported manual speed, preserving zero as off.
 *
 * @param {number} value Requested percentage (0–100).
 * @param {HassState} [state] Source fan capabilities.
 * @returns {number | null | undefined} HA percentage, null for off, undefined for invalid input.
 */
export function convertFanPercentage(value: number, state?: HassState): number | null | undefined {
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined;
  if (value === 0) return null;
  const count = getFanSpeedCount(state);
  if (count === undefined) return value;
  const speed = Math.max(1, Math.round((value * count) / 100));
  // HA's ordered-speed conversion uses integer percentages rounded down.
  return Math.floor((speed * 100) / count);
}

/**
 * Move one supported speed up or down, honoring Matter wrap and lowest-off flags.
 *
 * @param {number} current Current percentage (0–100).
 * @param {number} count Number of supported running speeds (1–100).
 * @param {boolean} increase Whether to increase instead of decrease.
 * @param {boolean} wrap Whether to wrap at the boundary.
 * @param {boolean} lowestOff Whether zero is included in the steps.
 * @returns {number} Target percentage (0–100).
 */
export function stepFanPercentage(current: number, count: number, increase: boolean, wrap: boolean, lowestOff: boolean): number {
  const minimum = lowestOff ? 0 : 1;
  let speed = Math.round((current * count) / 100) + (increase ? 1 : -1);
  if (speed > count) speed = wrap ? minimum : count;
  if (speed < minimum) speed = wrap ? count : minimum;
  return Math.floor((speed * 100) / count);
}
