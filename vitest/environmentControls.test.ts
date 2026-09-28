import type { CommandHandlerData, MatterbridgeEndpoint } from 'matterbridge';
import { ModeSelect } from 'matterbridge/matter/clusters';
import type { Mock } from 'vitest';

import { type EnvironmentControl, addEnvironmentControls, getHumidityOptions, isValidModeList, updateEnvironmentControls } from '../src/environmentControls.js';
import type { HassEntity, HassState } from '../src/homeAssistant.js';
import type { HomeAssistantPlatform } from '../src/module.js';
import type { MutableDevice } from '../src/mutableDevice.js';

function state(entityId: string, attributes: Record<string, unknown>): HassState {
  return { entity_id: entityId, state: 'on', attributes } as unknown as HassState;
}

function fixture(initial: HassState): {
  device: { addSelect: unknown };
  platform: { ha: { hassStates: Map<string, HassState>; callService: Mock<() => Promise<void>> } };
  controls: EnvironmentControl[];
  command: (attribute: string, newMode: unknown) => Promise<void>;
} {
  const handlers = new Map<string, (data: CommandHandlerData) => Promise<void>>();
  const device = {
    addDeviceTypes: vi.fn(),
    setFriendlyName: vi.fn(),
    addSelect: vi.fn(),
    addCommandHandler: vi.fn((id: string, _command: string, handler: (data: CommandHandlerData) => Promise<void>) => handlers.set(id, handler)),
  };
  const platform = {
    ha: {
      hassStates: new Map([[initial.entity_id, initial]]),
      callService: vi.fn(async () => {
        await Promise.resolve();
      }),
    },
  };
  const controls = addEnvironmentControls(
    platform as unknown as HomeAssistantPlatform,
    device as unknown as MutableDevice,
    { entity_id: initial.entity_id } as HassEntity,
    initial,
  );
  const command = async (attribute: string, newMode: unknown): Promise<void> => handlers.get(`${initial.entity_id}.${attribute}`)?.({ request: { newMode } } as CommandHandlerData);
  return { device, platform, controls, command };
}

describe('environment controls', () => {
  it('accepts custom Unicode labels and rejects malformed, duplicate or oversized mode lists', () => {
    expect(isValidModeList(['무풍', 'Quiet', 'Turbo'])).toBe(true);
    for (const value of [null, [], [''], [' '], ['eco', 'eco'], [42], ['가'.repeat(22)], Array.from({ length: 256 }, (_, i) => String(i))]) {
      expect(isValidModeList(value)).toBe(false);
    }
  });

  it('builds bounded target humidity choices and respects the advertised step', () => {
    expect(getHumidityOptions(state('humidifier.room', { humidity: 45, min_humidity: 40, max_humidity: 50, target_humidity_step: 5 }))).toEqual(['40%', '45%', '50%']);
    expect(getHumidityOptions(state('humidifier.room', { humidity: 45, min_humidity: 40, max_humidity: 41, target_humidity_step: 0.5 }))).toEqual(['40%', '40.5%', '41%']);
    expect(getHumidityOptions(state('humidifier.room', { humidity: null }))).toHaveLength(101);
    for (const attributes of [
      {},
      { humidity: 45, min_humidity: 80, max_humidity: 50 },
      { humidity: 45, max_humidity: Infinity },
      { humidity: 45, target_humidity_step: 0 },
      { humidity: 45, target_humidity_step: 0.01 },
    ]) {
      expect(getHumidityOptions(state('humidifier.room', attributes))).toEqual([]);
    }
  });

  it('creates independent climate presets and fan labels with the correct initial mode and services', async () => {
    const f = fixture(state('climate.room', { preset_modes: ['eco', 'comfort'], preset_mode: 'comfort', fan_modes: ['Quiet', 'Turbo'], fan_mode: 'Quiet' }));
    expect(f.device.addSelect).toHaveBeenCalledWith('climate.room.preset_mode', 'Preset', ['eco', 'comfort'], 2);
    expect(f.device.addSelect).toHaveBeenCalledWith('climate.room.fan_mode', 'Fan mode', ['Quiet', 'Turbo'], 1);
    await f.command('preset_mode', 1);
    await f.command('fan_mode', 2);
    expect(f.platform.ha.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', 'climate.room', { preset_mode: 'eco' });
    expect(f.platform.ha.callService).toHaveBeenCalledWith('climate', 'set_fan_mode', 'climate.room', { fan_mode: 'Turbo' });
  });

  it.each(['humidifier', 'dehumidifier'])('uses humidifier services for device class %s', async (deviceClass) => {
    const f = fixture(
      state('humidifier.room', {
        device_class: deviceClass,
        humidity: 45,
        min_humidity: 40,
        max_humidity: 50,
        target_humidity_step: 5,
        available_modes: ['auto', 'sleep'],
        mode: 'auto',
      }),
    );
    expect(f.controls.map((c) => c.attribute)).toEqual(['mode', 'humidity']);
    await f.command('mode', 2);
    await f.command('humidity', 3);
    expect(f.platform.ha.callService).toHaveBeenCalledWith('humidifier', 'set_mode', 'humidifier.room', { mode: 'sleep' });
    expect(f.platform.ha.callService).toHaveBeenCalledWith('humidifier', 'set_humidity', 'humidifier.room', { humidity: 50 });
  });

  it('preserves startup mode IDs when live options reorder and rejects removed modes and invalid requests', async () => {
    const f = fixture(state('climate.room', { preset_modes: ['eco', 'comfort'] }));
    f.platform.ha.hassStates.set('climate.room', state('climate.room', { preset_modes: ['comfort', 'eco'] }));
    await f.command('preset_mode', 1);
    expect(f.platform.ha.callService).toHaveBeenLastCalledWith('climate', 'set_preset_mode', 'climate.room', { preset_mode: 'eco' });
    f.platform.ha.hassStates.set('climate.room', state('climate.room', { preset_modes: ['comfort'] }));
    for (const mode of [1, 0, 3, 1.5, Number.NaN, '2']) await expect(f.command('preset_mode', mode)).rejects.toThrow('Unsupported');
    expect(f.platform.ha.callService).toHaveBeenCalledTimes(1);
  });

  it('rejects unavailable devices, changed humidity limits and service failures', async () => {
    const initial = state('humidifier.room', { humidity: 45, min_humidity: 40, max_humidity: 50 });
    const f = fixture(initial);
    f.platform.ha.hassStates.set(initial.entity_id, { ...initial, state: 'unavailable' });
    await expect(f.command('humidity', 1)).rejects.toThrow('unavailable');
    f.platform.ha.hassStates.set(initial.entity_id, state(initial.entity_id, { humidity: 45, min_humidity: 45, max_humidity: 50 }));
    await expect(f.command('humidity', 1)).rejects.toThrow('Unsupported');
    f.platform.ha.callService.mockRejectedValueOnce(new Error('Service failed'));
    await expect(f.command('humidity', 6)).rejects.toThrow('Service failed');
  });

  it('updates child and remapped endpoints without sending service commands, ignoring unknown selections', async () => {
    const initial = state('climate.room', { preset_modes: ['eco', 'comfort'], fan_modes: ['Quiet', 'Turbo'] });
    const f = fixture(initial);
    const child = { hasAttributeServer: vi.fn(() => true), setAttribute: vi.fn(), log: {} };
    const root = { ...child, setAttribute: vi.fn(), getChildEndpointByOriginalId: vi.fn((id) => (id.endsWith('preset_mode') ? child : undefined)) };
    await updateEnvironmentControls(root as unknown as MatterbridgeEndpoint, state(initial.entity_id, { preset_mode: 'comfort', fan_mode: 'Turbo' }), f.controls);
    expect(child.setAttribute).toHaveBeenCalledWith(ModeSelect, 'currentMode', 2, child.log);
    expect(root.setAttribute).toHaveBeenCalledWith(ModeSelect, 'currentMode', 2, root.log);
    await updateEnvironmentControls(root as unknown as MatterbridgeEndpoint, state(initial.entity_id, { preset_mode: 'new preset' }), f.controls);
    await updateEnvironmentControls(root as unknown as MatterbridgeEndpoint, { ...initial, state: 'unavailable' }, f.controls);
    expect(child.setAttribute).toHaveBeenCalledTimes(1);
    expect(root.setAttribute).toHaveBeenCalledTimes(1);
    expect(f.platform.ha.callService).not.toHaveBeenCalled();
  });
});
