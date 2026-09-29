import { AnsiLogger, LogLevel } from 'matterbridge/logger';

import { type HassEntity, type HassState, HomeAssistant } from '../src/homeAssistant.js';
import { HomeAssistantPlatform } from '../src/module.js';

type DiscoveryPlatform = {
  scheduleDiscovery: () => void;
  refreshDevices: () => Promise<void>;
  discoveryTask?: Promise<void>;
  discoveryStopped: boolean;
  isConfigured: boolean;
};
const methods = HomeAssistantPlatform.prototype as unknown as DiscoveryPlatform;

interface DiscoveryFixture extends DiscoveryPlatform {
  discoverDevices: ReturnType<typeof vi.fn<() => Promise<void>>>;
  updateHandler: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>;
  endpointNames: Map<string, string>;
  ha: HomeAssistant;
  log: AnsiLogger;
}

function fixture(): DiscoveryFixture {
  return {
    scheduleDiscovery: methods.scheduleDiscovery,
    refreshDevices: methods.refreshDevices,
    discoverDevices: vi.fn(async () => {}),
    updateHandler: vi.fn(async () => {}),
    endpointNames: new Map<string, string>(),
    ha: new HomeAssistant('ws://localhost:8123', 'test-token'),
    log: new AnsiLogger({ logName: 'Discovery', logLevel: LogLevel.FATAL }),
    discoveryTask: undefined as Promise<void> | undefined,
    discoveryStopped: false,
    isConfigured: true,
  };
}

describe('runtime device discovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should coalesce events and initialize only newly registered entity states', async () => {
    const platform = fixture();
    const state = { entity_id: 'switch.new', state: 'on', attributes: {} } as HassState;
    platform.ha.hassStates.set(state.entity_id, state);
    platform.ha.hassEntities.set(state.entity_id, { entity_id: state.entity_id, device_id: 'device' } as HassEntity);
    platform.discoverDevices.mockImplementation(async () => {
      platform.endpointNames.set(state.entity_id, '');
    });
    platform.scheduleDiscovery();
    platform.scheduleDiscovery();
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.discoverDevices).toHaveBeenCalledTimes(1);
    expect(platform.updateHandler).toHaveBeenCalledWith('device', state.entity_id, state, state);
    platform.scheduleDiscovery();
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.updateHandler).toHaveBeenCalledTimes(1);
  });

  it('should serialize scans and process events received during registration', async () => {
    const platform = fixture();
    let finish: () => void = () => {};
    platform.discoverDevices.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    platform.scheduleDiscovery();
    await vi.advanceTimersByTimeAsync(1000);
    platform.scheduleDiscovery();
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.discoverDevices).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.discoverDevices).toHaveBeenCalledTimes(2);
  });

  it('should skip scans before configuration and cancel queued work on shutdown', async () => {
    const platform = fixture();
    platform.isConfigured = false;
    platform.scheduleDiscovery();
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.discoverDevices).not.toHaveBeenCalled();
    platform.isConfigured = true;
    platform.scheduleDiscovery();
    platform.discoveryStopped = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(platform.discoverDevices).not.toHaveBeenCalled();
  });
});
