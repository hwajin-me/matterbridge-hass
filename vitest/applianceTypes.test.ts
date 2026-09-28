import { FanControl } from 'matterbridge/matter/clusters';

import { convertMatterWindToHA } from '../src/converters.js';
import { addFanControl, hasFanFeature } from '../src/fanControl.js';
import { FanEntityFeature, type HassState } from '../src/homeAssistant.js';
import { getNativeHumidityConfig, humidityConditioner } from '../src/humidistat.js';
import type { MutableDevice } from '../src/mutableDevice.js';

function state(attributes: Record<string, unknown>): HassState {
  return { entity_id: 'humidifier.test', state: 'on', attributes } as unknown as HassState;
}

describe('Matter appliance capabilities', () => {
  it('should retain compatibility by default and validate native percent limits', () => {
    const source = state({ device_class: 'humidifier', humidity: 45, min_humidity: 30, max_humidity: 70, target_humidity_step: 5 });
    // oxlint-disable-next-line unicorn/no-useless-undefined -- Tests an absent optional configuration.
    expect(getNativeHumidityConfig(source, undefined)).toBeUndefined();
    expect(getNativeHumidityConfig(source, 'compatible')).toBeUndefined();
    expect(getNativeHumidityConfig(source, 'native-cold-mist')).toMatchObject({ mode: 0, mist: 1, target: 45 });
    expect(getNativeHumidityConfig(source, 'native-warm-mist')).toMatchObject({ mode: 0, mist: 2 });
    expect(getNativeHumidityConfig(state({ ...source.attributes, device_class: 'dehumidifier' }), 'native-cold-mist')).toEqual({ mode: 1, min: 30, max: 70, step: 5, target: 45 });
    for (const attributes of [
      { device_class: 'unknown' },
      { humidity: null },
      { humidity: 46 },
      { min_humidity: 70 },
      { max_humidity: 101 },
      { target_humidity_step: 0 },
      { target_humidity_step: 0.5 },
      { humidity: Number.NaN },
    ]) {
      expect(getNativeHumidityConfig(state({ ...source.attributes, ...attributes }), 'native-cold-mist')).toBeUndefined();
    }
    expect(humidityConditioner.code).toBe(0x007d);
  });

  it('should obey explicit capabilities and use attribute fallback only without a mask', () => {
    expect(hasFanFeature(state({ supported_features: 0, oscillating: true }), FanEntityFeature.OSCILLATE, true)).toBe(false);
    expect(hasFanFeature(state({ supported_features: 2 }), FanEntityFeature.OSCILLATE, false)).toBe(true);
    expect(hasFanFeature(state({}), FanEntityFeature.DIRECTION, false)).toBe(false);
    expect(hasFanFeature(state({}), FanEntityFeature.DIRECTION, true)).toBe(true);
  });

  it('should configure only the actual fan capabilities and advertised wind bitmap', () => {
    const addClusterServerObjs = vi.fn();
    const device = { addClusterServerObjs } as unknown as MutableDevice;
    addFanControl(device, 'fan.circulator', state({ supported_features: 3, percentage: 50, oscillating: false }));
    const cluster = addClusterServerObjs.mock.calls[0][1];
    expect(cluster.id).toBe(FanControl.id);
    expect(cluster.options.rockSupport).toEqual({ rockRound: true, rockUpDown: false, rockLeftRight: false });
    expect(cluster.options.airflowDirection).toBeUndefined();
    expect(cluster.options.windSupport).toBeUndefined();
    addFanControl(device, 'fan.circulator', state({ supported_features: 9, percentage: 40, preset_modes: ['normal', 'natural_wind'], preset_mode: 'natural_wind' }));
    expect(addClusterServerObjs.mock.calls[1][1].options.windSupport).toEqual({ sleepWind: false, naturalWind: true });
  });

  it('should execute Matter step commands using the configured fan speed count', async () => {
    const addClusterServerObjs = vi.fn();
    const device = { addClusterServerObjs } as unknown as MutableDevice;
    addFanControl(device, 'fan.stepped', state({ supported_features: 1, percentage_step: 20, percentage: 40 }));
    const server = addClusterServerObjs.mock.calls[0][1].type;
    const actor = { state: { percentSetting: 40, percentCurrent: 40 } };
    await server.prototype.step.call(actor, { direction: FanControl.StepDirection.Increase });
    expect(actor.state.percentSetting).toBe(60);
    expect(actor.state.percentCurrent).toBe(40);
    await server.prototype.step.call(actor, { direction: FanControl.StepDirection.Decrease });
    expect(actor.state.percentSetting).toBe(40);
    actor.state.percentSetting = 100;
    await server.prototype.step.call(actor, { direction: FanControl.StepDirection.Increase, wrap: true, lowestOff: false });
    expect(actor.state.percentSetting).toBe(20);
  });

  it('should map wind presets and restore manual speed without inventing unsupported modes', () => {
    const source = state({ preset_modes: ['normal', 'sleep_wind'], percentage: 35, supported_features: 9 });
    expect(convertMatterWindToHA({ sleepWind: true }, source)).toBe('sleep_wind');
    expect(convertMatterWindToHA({ naturalWind: true }, source)).toBeUndefined();
    expect(convertMatterWindToHA({ sleepWind: true, naturalWind: true }, source)).toBeUndefined();
    expect(convertMatterWindToHA({}, source)).toBe(35);
    expect(convertMatterWindToHA({}, state({ preset_modes: ['normal'], supported_features: 8 }))).toBe('normal');
    expect(convertMatterWindToHA(null, source)).toBeUndefined();
    expect(convertMatterWindToHA({}, state({ preset_modes: [] }))).toBeUndefined();
  });
});
