import type { MatterbridgeEndpoint } from 'matterbridge';
import { BridgedDeviceBasicInformation } from 'matterbridge/matter/clusters';

import type { HassState } from './homeAssistant.js';

/**
 * Updates supported bridge reachability, using the vacuum rather than its optional companion sensors.
 * Server-mode RVC nodes do not expose the bridged-node reachable attribute.
 * @param {MatterbridgeEndpoint} device Registered main endpoint.
 * @param {HassState} updated Latest entity event, which may precede the cached state.
 * @param {readonly string[]} vacuumIds Vacuum entities actually registered on this endpoint.
 * @param {ReadonlyMap<string, HassState>} states Current HA state cache.
 * @returns {Promise<void>} Resolves after updating reachability when its source is known.
 */
export async function updateDeviceReachability(
  device: MatterbridgeEndpoint,
  updated: HassState,
  vacuumIds: readonly string[],
  states: ReadonlyMap<string, HassState>,
): Promise<void> {
  if (!device.hasAttributeServer(BridgedDeviceBasicInformation, 'reachable')) return;
  let reachable = updated.state !== 'unavailable';
  if (vacuumIds.length) {
    const sources = vacuumIds.map((id) => (id === updated.entity_id ? updated : states.get(id)));
    if (sources.some((state) => state && state.state !== 'unavailable' && state.state !== 'unknown')) reachable = true;
    else if (sources.some((state) => !state || state.state === 'unknown')) return;
    else reachable = false;
  }
  await device.setAttribute(BridgedDeviceBasicInformation, 'reachable', reachable, device.log);
}
