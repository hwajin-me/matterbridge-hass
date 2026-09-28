/**
 * @file src/control.entity.ts
 * @description This file contains the addControlEntity function.
 * @author Luca Liguori
 * @created 2025-08-25
 * @version 1.1.0
 * @license Apache-2.0
 *
 * Copyright 2025, 2026, 2027 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* oxlint-disable typescript/no-explicit-any */
/* oxlint-disable typescript/restrict-template-expressions */

import { colorTemperatureLight, dimmableLight, extendedColorLight, type MatterbridgeEndpoint, type PrimitiveTypes } from 'matterbridge';
import { CYAN, db, debugStringify } from 'matterbridge/logger';
import type { ActionContext } from 'matterbridge/matter';
import { LevelControl, type ServiceArea } from 'matterbridge/matter/clusters';
import { type ClusterId, getClusterNameById } from 'matterbridge/matter/types';
import { isValidArray, isValidNumber, isValidString } from 'matterbridge/utils';

import {
  convertHAFanPresetModesToMatter,
  convertHAFanPresetModeToMatter,
  getFeatureNames,
  hassCommandConverter,
  hassDomainConverter,
  hassSubscribeConverter,
  kelvinToMireds,
  roundTo,
  temp,
} from './converters.js';
import { addEnvironmentControls } from './environmentControls.js';
import { addFanControl } from './fanControl.js';
import { entityHasLabel, getDomain, getEntityName, getSortedHassAreas, hassAreaIdToMatterAreaId, truncateUtf8 } from './helpers.js';
import {
  ClimateEntityFeature,
  ColorMode,
  CoverEntityFeature,
  DEFAULT_MAX_KELVIN,
  DEFAULT_MAX_TEMP,
  DEFAULT_MIN_KELVIN,
  DEFAULT_MIN_TEMP,
  FanEntityFeature,
  type HassEntity,
  type HassState,
  HomeAssistant,
  HVACMode,
  LightEntityFeature,
  MediaPlayerEntityFeature,
  UnitOfTemperature,
  VacuumEntityFeature,
  ValveEntityFeature,
} from './homeAssistant.js';
import { addNativeHumidifier, getNativeHumidityConfig, humidityConditioner } from './humidistat.js';
import { registerMediaControls } from './mediaControls.js';
import type { HomeAssistantPlatform } from './module.js';
import type { MutableDevice } from './mutableDevice.js';

/**
 * Look for supported binary_sensors of the current entity
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance
 * @param {MutableDevice} mutableDevice - The mutable device to which the binary sensor will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 * @param {Function} commandHandler - The command handler function
 * @param {Function} subscribeHandler - The subscribe handler function
 *
 * @returns {string | undefined} - The endpoint name for the binary sensor, if found; otherwise, undefined
 */
export function addControlEntity(
  platform: HomeAssistantPlatform,
  mutableDevice: MutableDevice,
  entity: HassEntity,
  state: HassState,
  commandHandler: (
    data: { request: Record<string, any>; cluster: string; attributes: Record<string, PrimitiveTypes>; endpoint: MatterbridgeEndpoint },
    endpointName: string,
    command: string,
  ) => Promise<void>,
  subscribeHandler: (
    entity: HassEntity,
    hassSubscribe: {
      domain: string;
      service: string;
      with: string;
      clusterId: ClusterId;
      attribute: string;
      converter?: any;
    },
    newValue: any,
    oldValue: any,
    context: ActionContext,
  ) => void,
): string | undefined {
  let endpointName: string | undefined = undefined;
  const domain = getDomain(entity.entity_id);
  let hasEffects = false;
  let hasServiceArea = false;
  let hasTilt = false;
  let hasVolume = false;

  // Use stateCache for state and attributes values to avoid issues with unavailable entities and to have the last valid state and attributes for the entity.
  if (state.state === 'unavailable') {
    const cachedState = platform.stateCache.get(entity.entity_id);
    if (cachedState) {
      platform.log.info(`Entity ${CYAN}${entity.entity_id}${db} is unavailable, using cached state and attributes`);
      // oxlint-disable-next-line no-param-reassign
      state = cachedState;
    } else {
      platform.log.warn(`Entity ${CYAN}${entity.entity_id}${db} is unavailable and no cached state found`);
    }
  }
  const nativeHumidity = domain === 'humidifier' ? getNativeHumidityConfig(state, platform.config.humidifierDeviceType) : undefined;
  if (domain === 'humidifier' && platform.config.humidifierDeviceType?.startsWith('native-') && !nativeHumidity) {
    platform.log.error(
      `Cannot expose ${entity.entity_id} as native HumidityConditioner: provide humidifier/dehumidifier device_class and valid integer humidity limits, step and target, or explicitly select compatible mode.`,
    );
    return undefined;
  }
  // Add device type and clusterIds for supported domain of the current entity.
  hassDomainConverter
    .filter((d) => d.domain === domain && d.withAttribute === undefined)
    .forEach((hassDomain) => {
      if (!hassDomain.deviceType || !hassDomain.clusterId) return;
      endpointName = entity.entity_id;
      platform.log.debug(
        `+ ${domain} device ${CYAN}${(nativeHumidity ? humidityConditioner : hassDomain.deviceType).name}${db} cluster ${CYAN}${getClusterNameById(hassDomain.clusterId)}${db}`,
      );
      mutableDevice.addDeviceTypes(endpointName, nativeHumidity ? humidityConditioner : hassDomain.deviceType);
      mutableDevice.addClusterServerIds(endpointName, hassDomain.clusterId);
      if (state.attributes && isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName(endpointName, state.attributes['friendly_name']);
    });

  // Skip the entity if no supported domains are found.
  if (endpointName === undefined) return undefined;

  // Add device type and clusterIds for supported attributes of the current entity domain.
  platform.log.debug(`- state ${debugStringify(state)}`);
  for (const [key, _value] of Object.entries(state.attributes)) {
    hassDomainConverter
      .filter((d) => d.domain === domain && d.withAttribute === key)
      .forEach((hassDomain) => {
        if (!hassDomain.deviceType || !hassDomain.clusterId) return;
        endpointName = entity.entity_id;
        platform.log.debug(`+ attribute device ${CYAN}${hassDomain.deviceType.name}${db} cluster ${CYAN}${getClusterNameById(hassDomain.clusterId)}${db}`);
        mutableDevice.addDeviceTypes(endpointName, hassDomain.deviceType);
        mutableDevice.addClusterServerIds(endpointName, hassDomain.clusterId);
      });
  }

  if (nativeHumidity) addNativeHumidifier(mutableDevice, endpointName, nativeHumidity, platform);

  // Real values will be updated by the configure with the Home Assistant states. Here we need the features and fixed attributes to be set.

  // Configure the Light cluster default values and features for dimmable lights when they are unavailable and only supported_color_modes and supported_features attributes are present.
  // oxfmt-ignore
  if (domain === 'light' && isValidNumber(state.attributes?.supported_features) && isValidArray(state.attributes?.supported_color_modes) && state.attributes.supported_color_modes.includes(ColorMode.BRIGHTNESS)) {
    platform.log.debug(`+ attribute device ${CYAN}${dimmableLight.name}${db} cluster ${CYAN}${LevelControl.name}${db}`);
    platform.log.debug(`= levelControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${state.attributes['supported_color_modes']}${db}`);
    platform.log.debug(`# levelControl device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(LightEntityFeature, state.attributes.supported_features)}${db}`);
    mutableDevice.addDeviceTypes(endpointName, dimmableLight);
    mutableDevice.addClusterServerIds(endpointName, LevelControl.id);
  }

  // Configure the ColorControl cluster default values and features.
  // oxfmt-ignore
  if (domain === 'light' && (mutableDevice.get(endpointName).deviceTypes.includes(colorTemperatureLight) || mutableDevice.get(endpointName).deviceTypes.includes(extendedColorLight))) {
    platform.log.debug(`= colorControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${state.attributes['supported_color_modes']}${db} min_color_temp_kelvin: ${CYAN}${state.attributes['min_color_temp_kelvin']}${db} max_color_temp_kelvin: ${CYAN}${state.attributes['max_color_temp_kelvin']}${db}`);
    platform.log.debug(`# colorControl device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(LightEntityFeature, state.attributes.supported_features)}${db}`);
    const minMireds = kelvinToMireds(state.attributes['max_color_temp_kelvin'] ?? DEFAULT_MAX_KELVIN, 'floor');
    const maxMireds = kelvinToMireds(state.attributes['min_color_temp_kelvin'] ?? DEFAULT_MIN_KELVIN, 'floor');
    platform.log.debug(`= colorControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${state.attributes['supported_color_modes']}${db} min_mireds: ${CYAN}${minMireds}${db} max_mireds: ${CYAN}${maxMireds}${db}`);
    if (isValidArray(state.attributes['supported_color_modes']) && !state.attributes['supported_color_modes'].includes(ColorMode.XY) && !state.attributes['supported_color_modes'].includes(ColorMode.HS) && !state.attributes['supported_color_modes'].includes(ColorMode.RGB) &&
      !state.attributes['supported_color_modes'].includes(ColorMode.RGBW) && !state.attributes['supported_color_modes'].includes(ColorMode.RGBWW) && state.attributes['supported_color_modes'].includes(ColorMode.COLOR_TEMP)
    ) {
      mutableDevice.addClusterServerColorTemperatureColorControl(endpointName, minMireds, maxMireds);
    } else {
      mutableDevice.addClusterServerColorControl(endpointName, minMireds, maxMireds);
    }
  }

  if (
    domain === 'light' &&
    isValidArray(state.attributes['effect_list'], 1, 255) &&
    state.attributes.effect_list.every((effect) => isValidString(effect, 1) && Buffer.byteLength(effect, 'utf8') <= 64)
  ) {
    mutableDevice.addSelect(endpointName, 'Effect', state.attributes['effect_list']);
    hasEffects = true;
  }

  // Configure the Thermostat cluster default values and features.
  // oxfmt-ignore
  if (domain === 'climate') {
    // Determine temperature unit and convert temperatures:
    // - temperature_unit is required as implementation but not on WS REST Api (never present actually)
    // - if not present, assume Home Assistant unit_system.temperature
    // - fallback to Home Assistant unit_system.temperature
    const temperature_unit = state.attributes['temperature_unit'] || HomeAssistant.hassConfig?.unit_system?.temperature || UnitOfTemperature.CELSIUS;
    const current_temperature = isValidNumber(state.attributes['current_temperature']) ? roundTo(temp(state.attributes['current_temperature'], temperature_unit), 2) : null;
    const min_temp = isValidNumber(state.attributes['min_temp']) ? roundTo(temp(state.attributes['min_temp'], temperature_unit), 2) : DEFAULT_MIN_TEMP;
    const max_temp = isValidNumber(state.attributes['max_temp']) ? roundTo(temp(state.attributes['max_temp'], temperature_unit), 2) : DEFAULT_MAX_TEMP;
    const temperature = isValidNumber(state.attributes['temperature']) ? roundTo(temp(state.attributes['temperature'], temperature_unit), 2) : 23;
    const target_temp_low = isValidNumber(state.attributes['target_temp_low']) ? roundTo(temp(state.attributes['target_temp_low'], temperature_unit), 2) : 20;
    const target_temp_high = isValidNumber(state.attributes['target_temp_high']) ? roundTo(temp(state.attributes['target_temp_high'], temperature_unit), 2) : 26;
    platform.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} hvac_modes: ${CYAN}${state.attributes['hvac_modes']}${db} temperature_unit: ${CYAN}${temperature_unit}${db} current_temperature: ${CYAN}${current_temperature}${db} min_temp: ${CYAN}${min_temp}${db} max_temp: ${CYAN}${max_temp}${db}`);
    platform.log.debug(`# thermostat device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(ClimateEntityFeature, state.attributes.supported_features)}${db}`);
    if(!isValidArray(state.attributes['hvac_modes'], 1)) {
      state.attributes['hvac_modes'] = [HVACMode.HEAT];
      platform.log.debug(`Thermostat device ${CYAN}${entity.entity_id}${db} has no hvac_modes attribute, assuming ${CYAN}${HVACMode.HEAT}${db}.`);
    }
    if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.HEAT_COOL)) {
      platform.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} auto target_temp_low: ${CYAN}${target_temp_low}${db} target_temp_high: ${CYAN}${target_temp_high}${db}`);
      mutableDevice.addClusterServerAutoModeThermostat(endpointName, current_temperature, target_temp_low, target_temp_high, min_temp, max_temp);
    } else if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.HEAT) && !state.attributes['hvac_modes'].includes(HVACMode.COOL)) {
      platform.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} heat temperature: ${CYAN}${temperature}${db}`);
      mutableDevice.addClusterServerHeatingThermostat(endpointName, current_temperature, temperature, min_temp, max_temp);
    } else if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.COOL) && !state.attributes['hvac_modes'].includes(HVACMode.HEAT)) {
      platform.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} cool temperature: ${CYAN}${temperature}${db}`);
      mutableDevice.addClusterServerCoolingThermostat(endpointName, current_temperature, temperature, min_temp, max_temp);
    } else if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.COOL) && state.attributes['hvac_modes'].includes(HVACMode.HEAT)) {
      platform.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} heat cool temperature: ${CYAN}${temperature}${db}`);
      mutableDevice.addClusterServerHeatingCoolingThermostat(endpointName, current_temperature, temperature, temperature, min_temp, max_temp);
    } else {
      platform.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} default temperature: ${CYAN}${temperature}${db}`);
    }
    if (isValidArray(state.attributes['fan_modes'], 1) && state.attributes['fan_modes'].some((mode) => ['low', 'medium', 'high', 'auto'].includes(mode))) {
      mutableDevice.addClusterServerDefaultFanControl(endpointName, convertHAFanPresetModeToMatter(state.attributes['fan_mode']), convertHAFanPresetModesToMatter(state.attributes['fan_modes']));
    }
  }

  /*
   * Configure the FanControl cluster default values and features.
   */
  // oxfmt-ignore
  if (domain === 'fan') {
    platform.log.debug(`= fan device ${CYAN}${entity.entity_id}${db} preset_modes: ${CYAN}${state.attributes['preset_modes']}${db} direction: ${CYAN}${state.attributes['direction']}${db} oscillating: ${CYAN}${state.attributes['oscillating']}${db}`);
    platform.log.debug(`# fan device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(FanEntityFeature, state.attributes.supported_features)}${db}`);
    addFanControl(mutableDevice, endpointName, state);
  }

  // Configure the vacuum.
  if (domain === 'vacuum') {
    platform.log.debug(`= vacuum device ${CYAN}${entity.entity_id}${db} activity: ${CYAN}${state.attributes['activity']}${db}`);
    platform.log.debug(
      `# vacuum device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(VacuumEntityFeature, state.attributes.supported_features)}${db}`,
    );
    mutableDevice.addVacuum(endpointName);
    // HA exposes public room cleaning through vacuum.clean_area using area-registry IDs.
    // Preserve the AreaId across restarts so Matter controllers retain their selections.
    if (
      isValidNumber(state.attributes['supported_features']) &&
      getFeatureNames(VacuumEntityFeature, state.attributes.supported_features).includes('CLEAN_AREA') &&
      platform.ha.hassAreas.size > 0
    ) {
      const supportedAreas: ServiceArea.Area[] = getSortedHassAreas(platform.ha).map((area) => ({
        areaId: hassAreaIdToMatterAreaId(area.area_id),
        mapId: null,
        areaInfo: {
          locationInfo: {
            locationName: truncateUtf8(area.name, 32),
            floorNumber: null,
            areaType: null,
          },
          landmarkInfo: null,
        },
      }));
      const areaNames = supportedAreas.map((area) => area.areaInfo.locationInfo?.locationName);
      if (
        supportedAreas.length <= 255 &&
        areaNames.every((name) => !!name) &&
        new Set(areaNames).size === supportedAreas.length &&
        new Set(supportedAreas.map((area) => area.areaId)).size === supportedAreas.length
      ) {
        mutableDevice.addClusterServerServiceArea(endpointName, supportedAreas);
        hasServiceArea = true;
      } else {
        platform.log.warn(`Skipping ServiceArea for ${entity.entity_id}: too many areas or duplicate/empty Matter area identifiers or names`);
      }
    }
  }

  // Configure covers supporting both lift and tilt positioning.
  if (
    domain === 'cover' &&
    isValidNumber(state.attributes.supported_features) &&
    getFeatureNames(CoverEntityFeature, state.attributes.supported_features).includes('SET_POSITION') &&
    getFeatureNames(CoverEntityFeature, state.attributes.supported_features).includes('SET_TILT_POSITION')
  ) {
    mutableDevice.addLiftTiltCover(endpointName);
    hasTilt = true;
  }

  // Configure the valve.
  if (domain === 'valve') {
    platform.log.debug(`= valve device ${CYAN}${entity.entity_id}${db} state: ${CYAN}${state.state}${db} current_position: ${CYAN}${state.attributes['current_position']}${db}`);
    platform.log.debug(
      `# valve device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(ValveEntityFeature, state.attributes.supported_features)}${db}`,
    );
    mutableDevice.addValve(endpointName);
  }

  // Configure the select.
  if (domain === 'select' || domain === 'input_select') {
    platform.log.debug(`= select device ${CYAN}${entity.entity_id}${db} options: ${CYAN}${state.attributes['options']}${db}`);
    mutableDevice.addSelect(endpointName, getEntityName(platform, entity) ?? 'Select an option', state.attributes['options']);
    if (entityHasLabel(platform, entity, platform.config.virtualControlLabel)) {
      state.attributes['options']?.forEach((option: string) => {
        platform.log.debug(`***Add select device ${CYAN}${entity.entity_id}${db} virtual control: ${CYAN}${option}${db}`);
        void platform
          // oxlint-disable-next-line typescript/require-await
          .registerVirtualDevice(`${getEntityName(platform, entity)} ${option}`, 'mounted_switch', async () => {
            platform.ha.callService(domain, 'select_option', entity.entity_id, { option }).catch((error: unknown) => {
              platform.log.error(`Failed to call select_option service for ${CYAN}${entity.entity_id}${db} with option ${CYAN}${option}${db}: ${error}`);
            });
          })
          // oxlint-disable-next-line no-empty-function
          .catch(/* istanbul ignore next */ () => {});
      });
    }
  }

  // Configure the remote.
  if (domain === 'remote') {
    platform.log.debug(`= remote device ${CYAN}${entity.entity_id}${db} state: ${CYAN}${state.state}${db}`);
    mutableDevice.addOnOff(endpointName, true);
  }

  // Configure the media_player.
  if (domain === 'media_player') {
    platform.log.debug(`= media_player device ${CYAN}${entity.entity_id}${db} state: ${CYAN}${state.state}${db} attrbutes: ${CYAN}${debugStringify(state.attributes)}${db}`);
    platform.log.debug(
      `# media_player device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(MediaPlayerEntityFeature, state.attributes.supported_features)}${db}`,
    );
    mutableDevice.addOnOff(endpointName, true);
    mutableDevice.addBasicVideoPlayer(endpointName);
    mutableDevice.addKeypadInput(endpointName);
    // LevelControl is the Matter volume-control cluster for media endpoints.
    if (getFeatureNames(MediaPlayerEntityFeature, state.attributes.supported_features).includes('VOLUME_SET')) {
      mutableDevice.addClusterServerIds(endpointName, LevelControl.id);
      hasVolume = true;
    }
    if (entityHasLabel(platform, entity, platform.config.virtualControlLabel)) {
      void registerMediaControls(platform, entity, state).catch((error: unknown) => {
        platform.log.error(`Failed to register media controls for ${entity.entity_id}: ${String(error)}`);
      });
    }
  }

  if (domain === 'climate' || domain === 'humidifier') {
    platform.environmentControls.set(entity.entity_id, addEnvironmentControls(platform, mutableDevice, entity, state, !nativeHumidity));
  }

  // Add command handlers
  for (const hassCommand of hassCommandConverter.filter((c) => c.domain === domain)) {
    if (domain === 'light' && hassCommand.command === 'changeToMode' && !hasEffects) continue;
    if (domain === 'vacuum' && hassCommand.command === 'selectAreas' && !hasServiceArea) continue;
    if (domain === 'cover' && hassCommand.command === 'goToTiltPercentage' && !hasTilt) continue;
    if (domain === 'media_player' && hassCommand.service === 'volume_set' && !hasVolume) continue;
    platform.log.debug(`- command: ${CYAN}${hassCommand.command}${db}`);
    mutableDevice.addCommandHandler(entity.entity_id, hassCommand.command, async (data, endpointName, command) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      await commandHandler(data as any, endpointName, command);
    });
  }

  // Add subscribe handlers
  for (const hassSubscribe of hassSubscribeConverter.filter((s) => s.domain === domain)) {
    platform.log.debug(`- subscribe: ${CYAN}${getClusterNameById(hassSubscribe.clusterId)}${db}:${CYAN}${hassSubscribe.attribute}${db}`);
    mutableDevice.addSubscribeHandler(
      entity.entity_id,
      hassSubscribe.clusterId,
      hassSubscribe.attribute,
      (newValue: any, oldValue: any, context: ActionContext, _endpointName: string, _clusterId: ClusterId, _attribute: string) => {
        subscribeHandler(entity, hassSubscribe, newValue, oldValue, context);
      },
    );
  }

  return endpointName;
}
