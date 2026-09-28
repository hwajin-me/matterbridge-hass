import { convertFanPercentage, getFanSpeedCount, stepFanPercentage } from '../src/fanSpeed.js';
import type { HassState } from '../src/homeAssistant.js';

function fan(attributes: Record<string, unknown>): HassState {
  return { entity_id: 'fan.test', state: 'on', attributes } as unknown as HassState;
}

describe('Fan speed steps', () => {
  it('should recognize step metadata and reject invalid capabilities', () => {
    expect(getFanSpeedCount(fan({ percentage_step: 20 }))).toBe(5);
    expect(getFanSpeedCount(fan({ percentage_step: 33.33 }))).toBe(3);
    expect(getFanSpeedCount(fan({ speed_count: 5 }))).toBe(5);
    expect(getFanSpeedCount(fan({ percentage_step: 20, speed_count: 3 }))).toBe(5);
    for (const percentage_step of [0, -1, 101, Number.NaN, Infinity, '20', 30]) {
      expect(getFanSpeedCount(fan({ percentage_step }))).toBeUndefined();
    }
    expect(getFanSpeedCount()).toBeUndefined();
  });

  it('should snap five-speed commands without turning small positive requests off', () => {
    const state = fan({ percentage_step: 20 });
    for (const [requested, accepted] of [
      [1, 20],
      [20, 20],
      [29, 20],
      [30, 40],
      [40, 40],
      [60, 60],
      [79, 80],
      [100, 100],
    ]) {
      expect(convertFanPercentage(requested, state)).toBe(accepted);
    }
    expect(convertFanPercentage(0, state)).toBeNull();
    for (const value of [-1, 101, Number.NaN, Infinity]) expect(convertFanPercentage(value, state)).toBeUndefined();
    expect(convertFanPercentage(29)).toBe(29);
    expect(convertFanPercentage(29, fan({ percentage_step: 0 }))).toBe(29);
    expect(convertFanPercentage(65, fan({ percentage_step: 100 / 3 }))).toBe(66);
  });

  it('should move one device speed and honor boundaries, wrap and off exclusion', () => {
    expect(stepFanPercentage(40, 5, true, false, true)).toBe(60);
    expect(stepFanPercentage(40, 5, false, false, true)).toBe(20);
    expect(stepFanPercentage(20, 5, false, false, true)).toBe(0);
    expect(stepFanPercentage(20, 5, false, false, false)).toBe(20);
    expect(stepFanPercentage(100, 5, true, false, true)).toBe(100);
    expect(stepFanPercentage(100, 5, true, true, true)).toBe(0);
    expect(stepFanPercentage(100, 5, true, true, false)).toBe(20);
    expect(stepFanPercentage(0, 5, false, true, true)).toBe(100);
    expect(stepFanPercentage(0, 5, true, false, false)).toBe(20);
    expect(stepFanPercentage(33, 3, true, false, true)).toBe(66);
  });
});
