import type { Mock, MockInstance } from 'vitest';

import { generateEntity } from '../src/helpers.js';
import { type HassEntity, type HassState, HomeAssistant, MediaPlayerEntityFeature, MediaPlayerService } from '../src/homeAssistant.js';
import { getMediaControls, registerMediaControls } from '../src/mediaControls.js';
import type { HomeAssistantPlatform } from '../src/module.js';

function fixture(): {
  entity: HassEntity;
  state: HassState;
  platform: HomeAssistantPlatform;
  registerVirtualDevice: Mock<(...args: [string, string, () => Promise<void>]) => Promise<boolean>>;
  callService: MockInstance<HomeAssistant['callService']>;
} {
  const ha = new HomeAssistant('ws://localhost:8123', 'test');
  const entity = generateEntity(ha, 'TV', 'media_player', null, null, [], 'playing', {
    supported_features: MediaPlayerEntityFeature.VOLUME_MUTE + MediaPlayerEntityFeature.VOLUME_STEP,
  });
  const state = ha.hassStates.get(entity.entity_id);
  if (!state) throw new Error('Missing fixture state');
  const registerVirtualDevice = vi.fn<(...args: [string, string, () => Promise<void>]) => Promise<boolean>>().mockResolvedValue(true);
  const callService = vi.spyOn(ha, 'callService').mockResolvedValue({ context: state.context, response: null });
  const platform = {
    ha,
    config: { splitNameStrategy: 'Friendly name' },
    stateCache: { get: vi.fn() },
    mediaControlEntities: new Set<string>(),
    log: { warn: vi.fn(), error: vi.fn() },
    registerVirtualDevice,
  } as unknown as HomeAssistantPlatform;
  return { entity, state, platform, registerVirtualDevice, callService };
}

describe('media command switches', () => {
  it('should register distinct bounded names when the core truncates long player names', async () => {
    const { entity, state, platform, registerVirtualDevice } = fixture();
    const other = generateEntity(platform.ha, 'Other TV', 'media_player', null, null, [], 'playing', {
      friendly_name: '거실 텔레비전 아주 긴 이름 두 번째',
      supported_features: MediaPlayerEntityFeature.VOLUME_MUTE,
    });
    state.attributes.friendly_name = '거실 텔레비전 아주 긴 이름 첫 번째';
    const ids = new Set<string>();
    registerVirtualDevice.mockImplementation(async (name) => {
      const id = name.slice(0, 32).replaceAll(' ', '');
      if (ids.has(id)) throw new Error('Endpoint already exists');
      ids.add(id);
      return true;
    });
    await registerMediaControls(platform, entity, state);
    const otherState = platform.ha.hassStates.get(other.entity_id);
    if (!otherState) throw new Error('Missing other state');
    await registerMediaControls(platform, other, otherState);
    expect(ids.size).toBe(6);
    for (const [name] of registerVirtualDevice.mock.calls) expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(32);
  });

  it('should distinguish players sharing an entity display name', async () => {
    const { entity, state, platform, registerVirtualDevice } = fixture();
    platform.config.splitNameStrategy = 'Entity name';
    const other = generateEntity(platform.ha, 'Second TV', 'media_player', null, null, [], 'on', { supported_features: MediaPlayerEntityFeature.VOLUME_MUTE });
    other.name = 'TV';
    const otherState = platform.ha.hassStates.get(other.entity_id);
    if (!otherState) throw new Error('Missing other state');
    await registerMediaControls(platform, entity, state);
    await registerMediaControls(platform, other, otherState);
    const names = registerVirtualDevice.mock.calls.map(([name]) => name.replaceAll(' ', ''));
    expect(new Set(names).size).toBe(6);
  });

  it('should continue registering remaining commands after one registration rejects', async () => {
    const { entity, state, platform, registerVirtualDevice } = fixture();
    registerVirtualDevice.mockRejectedValueOnce(new Error('Registration failed'));
    await expect(registerMediaControls(platform, entity, state)).resolves.toBeUndefined();
    expect(registerVirtualDevice).toHaveBeenCalledTimes(4);
    expect(platform.log.error).toHaveBeenCalledWith(expect.stringContaining('Registration failed'));
  });

  it.each([undefined, null, '1036', -1, 1.5, Number.NaN, Infinity, 2 ** 32, 0])('should expose no controls for an invalid or empty mask %s', (features) => {
    const { state } = fixture();
    expect(getMediaControls({ ...state, attributes: { ...state.attributes, supported_features: features } } as unknown as HassState)).toEqual([]);
  });

  it('should await registration and send explicit mute and unmute arguments', async () => {
    const { entity, state, platform, registerVirtualDevice, callService } = fixture();
    await registerMediaControls(platform, entity, state);
    expect(registerVirtualDevice.mock.calls.map(([name]) => name)).toEqual(['Mute TV', 'Unmute TV', 'Volume Down TV', 'Volume Up TV']);
    for (const [, , callback] of registerVirtualDevice.mock.calls) await callback();
    expect(callService.mock.calls).toEqual([
      ['media_player', MediaPlayerService.VOLUME_MUTE, entity.entity_id, { is_volume_muted: true }],
      ['media_player', MediaPlayerService.VOLUME_MUTE, entity.entity_id, { is_volume_muted: false }],
      ['media_player', MediaPlayerService.VOLUME_DOWN, entity.entity_id],
      ['media_player', MediaPlayerService.VOLUME_UP, entity.entity_id],
    ]);
  });

  it('should reject commands when the player becomes unavailable or drops the feature', async () => {
    const { entity, state, platform, registerVirtualDevice, callService } = fixture();
    await registerMediaControls(platform, entity, state);
    const callback = registerVirtualDevice.mock.calls[0][2];
    for (const availability of ['unavailable', 'unknown']) {
      state.state = availability;
      await expect(callback()).rejects.toThrow('unavailable');
    }
    state.state = 'playing';
    platform.ha.hassStates.set(entity.entity_id, { ...state, attributes: { ...state.attributes, supported_features: 0 } } as unknown as HassState);
    await expect(callback()).rejects.toThrow('no longer supported');
    platform.ha.hassStates.delete(entity.entity_id);
    await expect(callback()).rejects.toThrow('unavailable');
    expect(callService).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'unknown'])('should retain cached controls at %s discovery and surface registration failures', async (availability) => {
    const { entity, state, platform, registerVirtualDevice } = fixture();
    vi.mocked(platform.stateCache.get).mockReturnValue(state);
    registerVirtualDevice.mockResolvedValue(false);
    await registerMediaControls(platform, entity, { ...state, state: availability, attributes: { ...state.attributes, supported_features: undefined } });
    expect(registerVirtualDevice).toHaveBeenCalledTimes(4);
    expect(platform.log.warn).toHaveBeenCalledWith(expect.stringContaining('Could not register Mute'));
  });

  it('should log and propagate service failures instead of acknowledging success', async () => {
    const { entity, state, platform, registerVirtualDevice, callService } = fixture();
    await registerMediaControls(platform, entity, state);
    callService.mockRejectedValue(new Error('offline'));
    await expect(registerVirtualDevice.mock.calls[0][2]()).rejects.toThrow('offline');
    expect(platform.log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to call mute'));
  });
});
