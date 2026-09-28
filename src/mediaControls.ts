/**
 * @file src/mediaControls.ts
 * @description Apple Home compatible media command switches.
 * @license Apache-2.0
 */

import { createHash } from 'node:crypto';

import { getEntityName, truncateUtf8 } from './helpers.js';
import { type HassEntity, type HassState, MediaPlayerEntityFeature, MediaPlayerService } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';

/** A supported HA command and its optional service arguments. */
export interface MediaControl {
  feature: MediaPlayerEntityFeature;
  service: MediaPlayerService;
  name: string;
  data?: { is_volume_muted: boolean };
}

const controls: readonly MediaControl[] = [
  { feature: MediaPlayerEntityFeature.TURN_ON, service: MediaPlayerService.TURN_ON, name: 'Turn ON' },
  { feature: MediaPlayerEntityFeature.TURN_OFF, service: MediaPlayerService.TURN_OFF, name: 'Turn OFF' },
  { feature: MediaPlayerEntityFeature.PLAY, service: MediaPlayerService.MEDIA_PLAY, name: 'Play' },
  { feature: MediaPlayerEntityFeature.PAUSE, service: MediaPlayerService.MEDIA_PAUSE, name: 'Pause' },
  { feature: MediaPlayerEntityFeature.STOP, service: MediaPlayerService.MEDIA_STOP, name: 'Stop' },
  { feature: MediaPlayerEntityFeature.VOLUME_MUTE, service: MediaPlayerService.VOLUME_MUTE, name: 'Mute', data: { is_volume_muted: true } },
  { feature: MediaPlayerEntityFeature.VOLUME_MUTE, service: MediaPlayerService.VOLUME_MUTE, name: 'Unmute', data: { is_volume_muted: false } },
  { feature: MediaPlayerEntityFeature.VOLUME_STEP, service: MediaPlayerService.VOLUME_DOWN, name: 'Volume Down' },
  { feature: MediaPlayerEntityFeature.VOLUME_STEP, service: MediaPlayerService.VOLUME_UP, name: 'Volume Up' },
  { feature: MediaPlayerEntityFeature.PREVIOUS_TRACK, service: MediaPlayerService.MEDIA_PREVIOUS_TRACK, name: 'Previous Track' },
  { feature: MediaPlayerEntityFeature.NEXT_TRACK, service: MediaPlayerService.MEDIA_NEXT_TRACK, name: 'Next Track' },
];

/**
 * Keeps short unique names, disambiguating names the core would truncate or collide.
 * The core uses the display name (without spaces) as the virtual endpoint ID.
 *
 * @param {HomeAssistantPlatform} platform - Platform with the complete HA entity registry.
 * @param {HassEntity} entity - Source player with a stable registry ID.
 * @param {MediaControl} control - Command to name.
 * @returns {string} A display name fitting Matter's 32-byte node label.
 */
function getControlName(platform: HomeAssistantPlatform, entity: HassEntity, control: MediaControl): string {
  const playerName = getEntityName(platform, entity) ?? entity.entity_id;
  const name = `${control.name} ${playerName}`;
  const duplicate = Array.from(platform.ha.hassEntities.values()).some(
    (other) =>
      other.entity_id !== entity.entity_id &&
      other.entity_id.startsWith('media_player.') &&
      (getEntityName(platform, other) ?? other.entity_id).replaceAll(' ', '') === playerName.replaceAll(' ', ''),
  );
  if (Buffer.byteLength(name, 'utf8') <= 32 && !duplicate) return name;
  const suffix = createHash('sha256')
    .update(`${entity.id || entity.entity_id}:${control.name}`)
    .digest('hex')
    .slice(0, 10);
  return `${truncateUtf8(name, 21)} ${suffix}`;
}

/**
 * Selects commands from a valid HA feature mask without inventing capabilities.
 *
 * @param {HassState} state - Current or cached discovery state.
 * @returns {readonly MediaControl[]} Supported command switches, or none for malformed masks.
 */
export function getMediaControls(state: HassState): readonly MediaControl[] {
  const features: unknown = state.attributes.supported_features;
  if (typeof features !== 'number' || !Number.isSafeInteger(features) || features < 0 || features > 0x7fffffff) return [];
  // oxlint-disable-next-line no-bitwise
  return controls.filter((control) => (features & control.feature) !== 0);
}

/**
 * Creates momentary command switches and waits for their registration.
 * Offline players use cached capabilities; commands always check fresh availability.
 *
 * @param {HomeAssistantPlatform} platform - Platform providing registration and HA services.
 * @param {HassEntity} entity - Source media player.
 * @param {HassState} state - Discovery state.
 * @returns {Promise<void>} Resolves after all supported controls have been registered.
 */
export async function registerMediaControls(platform: HomeAssistantPlatform, entity: HassEntity, state: HassState): Promise<void> {
  platform.mediaControlEntities.add(entity.entity_id);
  const offline = state.state === 'unavailable' || state.state === 'unknown';
  const discovery = offline ? (platform.stateCache.get(entity.entity_id) ?? state) : state;
  if (platform.config.mediaPlayerControlsOnly && !offline) platform.stateCache.add(state);
  const supported = getMediaControls(discovery);
  if (!supported.length) platform.log.warn(`No supported media commands for ${entity.entity_id}; restore the source and restart Matterbridge.`);
  for (const control of supported) {
    try {
      const registered = await platform.registerVirtualDevice(getControlName(platform, entity, control), 'mounted_switch', async () => {
        try {
          const live = platform.ha.hassStates.get(entity.entity_id);
          if (!live || live.state === 'unavailable' || live.state === 'unknown') throw new Error(`Entity ${entity.entity_id} is unavailable`);
          if (!getMediaControls(live).some((candidate) => candidate.name === control.name))
            throw new Error(`Command ${control.name} is no longer supported by ${entity.entity_id}`);
          if (control.data) await platform.ha.callService('media_player', control.service, entity.entity_id, control.data);
          else await platform.ha.callService('media_player', control.service, entity.entity_id);
        } catch (error) {
          platform.log.error(`Failed to call ${control.name.toLowerCase()} service for ${entity.entity_id}: ${String(error)}`);
          throw error;
        }
      });
      if (!registered) platform.log.warn(`Could not register ${control.name} for ${entity.entity_id}; check for duplicate control names.`);
    } catch (error) {
      platform.log.error(`Failed to register ${control.name} for ${entity.entity_id}: ${String(error)}`);
    }
  }
}
