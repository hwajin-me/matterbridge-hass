/**
 * @file src/fanControl.ts
 * @description Capability-based Matter Fan Control for Home Assistant fans and air circulators.
 * @license Apache-2.0
 */
import { MatterbridgeFanControlServer } from 'matterbridge';
import { FanControl } from 'matterbridge/matter/clusters';
import { Status, StatusResponseError } from 'matterbridge/matter/types';
import { isValidBoolean, isValidNumber } from 'matterbridge/utils';

import { convertHAFanPresetModesToMatter, convertHAFanPresetModeToMatter } from './converters.js';
import { getFanSpeedCount, stepFanPercentage } from './fanSpeed.js';
import { FanEntityFeature, type HassState } from './homeAssistant.js';
import { getClusterServerObj, type MutableDevice } from './mutableDevice.js';

/**
 * Checks an advertised HA fan capability, falling back to attributes for older integrations.
 *
 * @param {HassState} state - Source fan state.
 * @param {FanEntityFeature} feature - HA capability bit.
 * @param {boolean} fallback - Attribute-based capability when the bitmask is absent.
 * @returns {boolean} Whether the fan supports the capability.
 */
export function hasFanFeature(state: HassState, feature: FanEntityFeature, fallback: boolean): boolean {
  const supported = state.attributes.supported_features;
  // oxlint-disable-next-line no-bitwise
  return isValidNumber(supported, 0) ? (supported & feature) !== 0 : fallback;
}

/**
 * Adds only the optional Fan Control features actually exposed by the source fan.
 * HA's generic oscillation is represented by the existing RockRound mapping, without inferring axes.
 *
 * @param {MutableDevice} device - Device being assembled.
 * @param {string} endpoint - Fan endpoint identifier.
 * @param {HassState} state - Initial or cached fan state.
 * @returns {void} Adds the Fan Control cluster configuration.
 */
export function addFanControl(device: MutableDevice, endpoint: string, state: HassState): void {
  const attrs = state.attributes;
  const modes = Array.isArray(attrs.preset_modes) ? attrs.preset_modes : [];
  const presets = hasFanFeature(state, FanEntityFeature.PRESET_MODE, modes.length > 0);
  const speed = hasFanFeature(state, FanEntityFeature.SET_SPEED, isValidNumber(attrs.percentage));
  const rocking = hasFanFeature(state, FanEntityFeature.OSCILLATE, isValidBoolean(attrs.oscillating));
  const direction = hasFanFeature(state, FanEntityFeature.DIRECTION, attrs.direction === 'forward' || attrs.direction === 'reverse');
  const canExitWind = speed || modes.some((preset) => ['normal', 'manual', 'low', 'medium', 'high'].includes(preset));
  const windSupport = { sleepWind: canExitWind && presets && modes.includes('sleep_wind'), naturalWind: canExitWind && presets && modes.includes('natural_wind') };
  const features: FanControl.Feature[] = [];
  if (presets && modes.includes('auto')) features.push(FanControl.Feature.Auto);
  if (speed) features.push(FanControl.Feature.Step);
  if (rocking) features.push(FanControl.Feature.Rocking);
  if (direction) features.push(FanControl.Feature.AirflowDirection);
  if (windSupport.sleepWind || windSupport.naturalWind) features.push(FanControl.Feature.Wind);
  class FanServer extends MatterbridgeFanControlServer.with(...features) {
    /**
     * Step through the source fan's actual speeds instead of generic low/medium/high modes.
     *
     * @param {FanControl.StepRequest} request Matter direction, wrap and lowest-off flags.
     * @returns {Promise<void>} Resolves after applying the target percentage.
     */
    override async step(request: FanControl.StepRequest): Promise<void> {
      const count = getFanSpeedCount(state);
      if (!speed || count === undefined) return super.step(request);
      if (request.direction !== FanControl.StepDirection.Increase && request.direction !== FanControl.StepDirection.Decrease) return;
      this.state.percentSetting = stepFanPercentage(
        this.state.percentSetting ?? this.state.percentCurrent,
        count,
        request.direction === FanControl.StepDirection.Increase,
        request.wrap ?? false,
        request.lowestOff ?? true,
      );
    }

    override initialize(): void {
      super.initialize();
      this.maybeReactTo(this.events.windSetting$Changing, (value: FanControl.Wind) => {
        if (value.sleepWind && value.naturalWind) throw new StatusResponseError('HA supports one wind preset at a time', Status.ConstraintError);
      });
    }
  }
  device.addClusterServerObjs(
    endpoint,
    getClusterServerObj(FanControl.id, FanServer, {
      fanMode: state.state === 'off' ? FanControl.FanMode.Off : convertHAFanPresetModeToMatter(attrs.preset_mode),
      fanModeSequence: convertHAFanPresetModesToMatter(presets ? modes : []),
      percentSetting: 0,
      percentCurrent: 0,
      ...(rocking
        ? {
            rockSupport: { rockLeftRight: false, rockUpDown: false, rockRound: true },
            rockSetting: { rockLeftRight: false, rockUpDown: false, rockRound: attrs.oscillating === true },
          }
        : {}),
      ...(direction ? { airflowDirection: attrs.direction === 'reverse' ? FanControl.AirflowDirection.Reverse : FanControl.AirflowDirection.Forward } : {}),
      ...(features.includes(FanControl.Feature.Wind)
        ? { windSupport, windSetting: { sleepWind: attrs.preset_mode === 'sleep_wind', naturalWind: attrs.preset_mode === 'natural_wind' } }
        : {}),
    }),
  );
}
