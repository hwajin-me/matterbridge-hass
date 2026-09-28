import type { MatterbridgeEndpoint } from 'matterbridge';
import { BridgedDeviceBasicInformation } from 'matterbridge/matter/clusters';

import { updateDeviceReachability } from '../src/deviceReachability.js';
import type { HassState } from '../src/homeAssistant.js';

function state(entityId: string, value: string): HassState {
  return { entity_id: entityId, state: value } as HassState;
}
function fixture(hasReachable = true): { device: MatterbridgeEndpoint; write: ReturnType<typeof vi.fn> } {
  const write = vi.fn().mockResolvedValue(true);
  const device = { hasAttributeServer: vi.fn().mockReturnValue(hasReachable), setAttribute: write, log: {} } as unknown as MatterbridgeEndpoint;
  return { device, write };
}

describe('vacuum reachability', () => {
  it('does not write bridged reachability on standalone server-mode RVC endpoints', async () => {
    const { device, write } = fixture(false);
    await updateDeviceReachability(device, state('vacuum.robot', 'unavailable'), ['vacuum.robot'], new Map());
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps a healthy vacuum reachable when a battery or diagnostic sensor fails', async () => {
    const { device, write } = fixture();
    await updateDeviceReachability(device, state('sensor.battery', 'unavailable'), ['vacuum.robot'], new Map([['vacuum.robot', state('vacuum.robot', 'docked')]]));
    expect(write).toHaveBeenCalledWith(BridgedDeviceBasicInformation, 'reachable', true, device.log);
  });
  it('does not let a healthy sensor mask an unavailable vacuum and uses incoming vacuum events before the cache', async () => {
    const { device, write } = fixture();
    const states = new Map([['vacuum.robot', state('vacuum.robot', 'unavailable')]]);
    await updateDeviceReachability(device, state('sensor.battery', '90'), ['vacuum.robot'], states);
    expect(write).toHaveBeenLastCalledWith(BridgedDeviceBasicInformation, 'reachable', false, device.log);
    await updateDeviceReachability(device, state('vacuum.robot', 'cleaning'), ['vacuum.robot'], states);
    expect(write).toHaveBeenLastCalledWith(BridgedDeviceBasicInformation, 'reachable', true, device.log);
  });
  it('preserves reachability for unknown or missing vacuum state and retains non-vacuum behavior', async () => {
    const { device, write } = fixture();
    for (const states of [new Map<string, HassState>(), new Map([['vacuum.robot', state('vacuum.robot', 'unknown')]])]) {
      await updateDeviceReachability(device, state('sensor.battery', 'unavailable'), ['vacuum.robot'], states);
    }
    expect(write).not.toHaveBeenCalled();
    await updateDeviceReachability(device, state('switch.outlet', 'unavailable'), [], new Map());
    expect(write).toHaveBeenLastCalledWith(BridgedDeviceBasicInformation, 'reachable', false, device.log);
  });
});
