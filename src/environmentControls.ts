/**
 * @file src/environmentControls.ts
 * @description Named environmental controls exposed through Matter ModeSelect endpoints.
 * @license Apache-2.0
 */

import { type MatterbridgeEndpoint, modeSelect } from 'matterbridge';
import { ModeSelect } from 'matterbridge/matter/clusters';

import { truncateUtf8 } from './helpers.js';
import type { HassEntity, HassState } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';
import type { MutableDevice } from './mutableDevice.js';

/** Describes the fixed Matter option IDs and the corresponding Home Assistant attribute. */
export interface EnvironmentControl {
  endpointId: string;
  attribute: 'preset_mode' | 'fan_mode' | 'mode' | 'humidity';
  options: string[];
  label: string;
  service: string;
  listAttribute?: 'preset_modes' | 'fan_modes' | 'available_modes';
}

/**
 * Validates a named mode list without changing the original integration-defined labels.
 *
 * @param {unknown} value - Home Assistant mode list.
 * @returns {boolean} Whether the list fits Matter's unique UTF-8 labels and mode IDs.
 */
export function isValidModeList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 255 &&
    value.every((item: unknown) => typeof item === 'string' && item.trim().length > 0 && Buffer.byteLength(item, 'utf8') <= 64) &&
    new Set(value).size === value.length
  );
}

/**
 * Builds the selectable target humidities within the device's declared limits.
 *
 * @param {HassState} state - Current Home Assistant state.
 * @returns {string[]} Percentage labels, or no options for invalid limits or missing target support.
 */
export function getHumidityOptions(state: HassState): string[] {
  if (!Object.hasOwn(state.attributes, 'humidity')) return [];
  const min = state.attributes.min_humidity ?? 0;
  const max = state.attributes.max_humidity ?? 100;
  const step = state.attributes.target_humidity_step ?? 1;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || min < 0 || max > 100 || min > max || step <= 0) return [];
  const count = Math.floor((max - min) / step + 1e-9) + 1;
  if (count > 255) return [];
  return Array.from({ length: count }, (_, index) => `${Number((min + index * step).toFixed(6))}%`);
}

/**
 * Adds named presets, fan modes and target humidity without assuming vendor-specific services.
 * Mode IDs stay tied to the initial labels until the bridge restarts.
 *
 * @param {HomeAssistantPlatform} platform - Platform used to read fresh state and call services.
 * @param {MutableDevice} device - Device being assembled.
 * @param {HassEntity} entity - Source Home Assistant entity.
 * @param {HassState} state - Initial (possibly cached) state.
 * @param {boolean} includeHumidityTarget - Whether to add the compatibility target selector.
 * @returns {EnvironmentControl[]} Controls created for subsequent state synchronization.
 */
export function addEnvironmentControls(
  platform: HomeAssistantPlatform,
  device: MutableDevice,
  entity: HassEntity,
  state: HassState,
  includeHumidityTarget = true,
): EnvironmentControl[] {
  const domain = entity.entity_id.split('.')[0];
  const controls: EnvironmentControl[] = [];
  const candidates: Omit<EnvironmentControl, 'endpointId' | 'options'>[] =
    domain === 'climate'
      ? [
          { attribute: 'preset_mode', listAttribute: 'preset_modes', label: 'Preset', service: 'set_preset_mode' },
          { attribute: 'fan_mode', listAttribute: 'fan_modes', label: 'Fan mode', service: 'set_fan_mode' },
        ]
      : [{ attribute: 'mode', listAttribute: 'available_modes', label: 'Mode', service: 'set_mode' }];
  if (domain === 'humidifier' && includeHumidityTarget) candidates.push({ attribute: 'humidity', label: 'Target humidity', service: 'set_humidity' });
  for (const candidate of candidates) {
    const options = candidate.listAttribute ? state.attributes[candidate.listAttribute] : getHumidityOptions(state);
    if (!isValidModeList(options)) continue;
    const control = { ...candidate, endpointId: `${entity.entity_id}.${candidate.attribute}`, options: [...options] };
    const current = candidate.attribute === 'humidity' ? `${state.attributes.humidity}%` : state.attributes[candidate.attribute];
    device.addDeviceTypes(control.endpointId, modeSelect);
    const suffix = ` ${candidate.label}`;
    const name = typeof state.attributes.friendly_name === 'string' ? state.attributes.friendly_name : entity.entity_id;
    device.setFriendlyName(control.endpointId, `${truncateUtf8(name, 32 - Buffer.byteLength(suffix, 'utf8'))}${suffix}`);
    device.addSelect(control.endpointId, candidate.label, control.options, Math.max(1, control.options.indexOf(current ?? '') + 1));
    device.addCommandHandler(control.endpointId, 'changeToMode', async ({ request }) => {
      const live = platform.ha.hassStates.get(entity.entity_id);
      if (!live || live.state === 'unavailable' || live.state === 'unknown') throw new Error(`Entity ${entity.entity_id} is unavailable`);
      const mode: unknown = 'newMode' in request ? request.newMode : undefined;
      const label = typeof mode === 'number' && Number.isInteger(mode) ? control.options[mode - 1] : undefined;
      const available = control.listAttribute ? live.attributes[control.listAttribute] : getHumidityOptions(live);
      if (!label || !Array.isArray(available) || !available.includes(label)) throw new Error(`Unsupported ${control.label} for ${entity.entity_id}`);
      await platform.ha.callService(domain, control.service, entity.entity_id, { [control.attribute]: control.attribute === 'humidity' ? Number.parseFloat(label) : label });
    });
    controls.push(control);
  }
  return controls;
}

/**
 * Reflects HA selections using the original mode IDs, including remapped main endpoints.
 *
 * @param {MatterbridgeEndpoint} device - Registered bridged device.
 * @param {HassState} state - New Home Assistant state.
 * @param {readonly EnvironmentControl[]} controls - Controls created at discovery.
 * @returns {Promise<void>} Resolves when valid current modes have been updated.
 */
export async function updateEnvironmentControls(device: MatterbridgeEndpoint, state: HassState, controls: readonly EnvironmentControl[]): Promise<void> {
  if (state.state === 'unavailable' || state.state === 'unknown') return;
  for (const control of controls) {
    const value = control.attribute === 'humidity' ? `${state.attributes.humidity}%` : state.attributes[control.attribute];
    const index = control.options.indexOf(value ?? '');
    if (index < 0) continue;
    const endpoint = device.getChildEndpointByOriginalId(control.endpointId) ?? device;
    if (endpoint.hasAttributeServer(ModeSelect, 'currentMode')) await endpoint.setAttribute(ModeSelect, 'currentMode', index + 1, endpoint.log);
  }
}
