/**
 * @file src/humidistat.ts
 * @description Opt-in provisional CHIP Humidity Conditioner (0x007D) and Humidistat (0x0205).
 * @license Apache-2.0
 *
 * Wire IDs and constraints follow project-chip/connectedhomeip's humidistat-cluster.xml
 * (provisional, checked 2026-09-28). This is not a claim of certification or final specification support.
 */
// The installed matter.js has no generated Humidistat namespace; use its supported legacy cluster factory.
/* oxlint-disable typescript/no-deprecated */
import { DeviceClasses, DeviceScopes, DeviceTypeDefinition, MatterbridgeOnOffServer, type MatterbridgeEndpoint } from 'matterbridge';
import { type ActionContext, ClusterBehavior, Matter } from 'matterbridge/matter';
import { Identify, OnOff, RelativeHumidityMeasurement } from 'matterbridge/matter/clusters';
import { AttributeModel } from 'matterbridge/matter/model';
import {
  Attribute,
  BitFlag,
  ClusterType,
  Command,
  FixedAttribute,
  OptionalWritableAttribute,
  Status,
  StatusResponseError,
  TlvArray,
  TlvBoolean,
  TlvObject,
  TlvOptionalField,
  TlvUInt8,
  TlvVoid,
  WritableAttribute,
} from 'matterbridge/matter/types';

import type { HassState } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';
import { getClusterServerObj, type MutableDevice } from './mutableDevice.js';

const percent = TlvUInt8.bound({ max: 100 });
const mode = TlvUInt8.bound({ max: 3 });
/** Wire request for Humidistat SetSettings (command 0x00). */
export const TlvHumiditySettings = TlvObject({
  userSetpoint: TlvOptionalField(0, percent),
  mode: TlvOptionalField(1, mode),
  mistType: TlvOptionalField(2, TlvUInt8.bound({ max: 3 })),
  continuous: TlvOptionalField(3, TlvBoolean),
  sleep: TlvOptionalField(4, TlvBoolean),
  optimal: TlvOptionalField(5, TlvBoolean),
});

/** Provisional Humidistat wire schema; only fixed-purpose, sensor-controlled operation is implemented. */
export const Humidistat = ClusterType({
  id: 0x0205,
  name: 'Humidistat',
  revision: 1,
  features: { humidifier: BitFlag(0), dehumidifier: BitFlag(1), sensor: BitFlag(3), warmMist: BitFlag(7), coldMist: BitFlag(8) },
  attributes: {
    supportedModes: FixedAttribute(0, TlvArray(mode, { minLength: 1, maxLength: 4 })),
    mode: WritableAttribute(1, mode),
    systemState: Attribute(2, TlvUInt8.bound({ max: 3 })),
    userSetpoint: WritableAttribute(3, percent),
    minSetpoint: FixedAttribute(4, TlvUInt8.bound({ max: 99 })),
    maxSetpoint: FixedAttribute(5, TlvUInt8.bound({ min: 1, max: 100 })),
    step: FixedAttribute(6, percent),
    mistType: OptionalWritableAttribute(8, TlvUInt8.bound({ max: 3 })),
  },
  commands: { setSettings: Command(0, TlvHumiditySettings, 0, TlvVoid) },
});

/** Provisional humidity appliance type, distinct from an outlet or a measurement-only humidity sensor. */
export const humidityConditioner = DeviceTypeDefinition({
  name: 'HumidityConditioner',
  code: 0x007d,
  revision: 1,
  deviceClass: DeviceClasses.Simple,
  deviceScope: DeviceScopes.Endpoint,
  requiredServerClusters: [Identify.id, OnOff.id, Humidistat.id],
  optionalServerClusters: [RelativeHumidityMeasurement.id],
});

/** Native humidity capability values fixed at discovery. */
export interface NativeHumidityConfig {
  mode: number;
  min: number;
  max: number;
  step: number;
  target: number;
  mist?: number;
}

/**
 * Validates HA capabilities representable by the provisional integer-percent Humidistat schema.
 *
 * @param {HassState} state - Source humidifier state.
 * @param {string | undefined} selection - Explicit native cold/warm mist choice, or compatible.
 * @returns {NativeHumidityConfig | undefined} Native configuration, or undefined when not selected or metadata is invalid.
 */
/* oxlint-disable typescript/consistent-return -- Undefined requests the compatible mapping. */
export function getNativeHumidityConfig(state: HassState, selection: string | undefined): NativeHumidityConfig | undefined {
  if (selection !== 'native-cold-mist' && selection !== 'native-warm-mist') return;
  const attrs = state.attributes;
  if (attrs.device_class !== 'humidifier' && attrs.device_class !== 'dehumidifier') return;
  const min = attrs.min_humidity ?? 0;
  const max = attrs.max_humidity ?? 100;
  const step = attrs.target_humidity_step ?? 1;
  const target = attrs.humidity;
  if (![min, max, step, target].every((value) => typeof value === 'number' && Number.isInteger(value))) return;
  if (typeof target !== 'number' || min < 0 || max > 100 || min >= max || step < 1 || step > max - min || (max - min) % step !== 0 || target < min || target > max) return;
  return {
    mode: attrs.device_class === 'dehumidifier' ? 1 : 0,
    min,
    max,
    step,
    target: snapHumidityTarget(target, min, max, step),
    ...(attrs.device_class === 'humidifier' ? { mist: selection === 'native-warm-mist' ? 2 : 1 } : {}),
  };
}

/* oxlint-enable typescript/consistent-return */

/**
 * Validates a requested percentage and snaps it to the nearest supported step (ties round down).
 *
 * @param {number} value - Requested relative humidity in percent.
 * @param {number} min - Minimum supported percentage.
 * @param {number} max - Maximum supported percentage.
 * @param {number} step - Supported integer percentage step.
 * @returns {number} Normalized percentage, or throws ConstraintError outside the range.
 */
export function snapHumidityTarget(value: number, min: number, max: number, step: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new StatusResponseError('Humidity outside supported range', Status.ConstraintError);
  const remainder = (value - min) % step;
  return value - remainder + (remainder * 2 > step ? step : 0);
}

// Attach global attribute type definitions for this provisional cluster in the installed runtime.
Humidistat.schema.parent = Matter;
Humidistat.schema.featureMap.type = 'FeatureMap';
Humidistat.schema.children.push(new AttributeModel({ id: 0xfffd, name: 'ClusterRevision', type: 'ClusterRevision', default: 1 }));
for (const feature of Humidistat.schema.features) feature.title = feature.name[0].toUpperCase() + feature.name.slice(1);
const HumidistatBehavior = ClusterBehavior.for(Humidistat);

/**
 * Adds the experimental native humidity clusters with validated writes and service error propagation.
 *
 * @param {MutableDevice} device - Device being assembled.
 * @param {string} endpoint - Home Assistant entity identifier.
 * @param {NativeHumidityConfig} config - Validated source capabilities.
 * @param {HomeAssistantPlatform} platform - HA connection for commands and current state.
 * @returns {void} Installs native humidity and non-lighting On/Off clusters.
 */
export function addNativeHumidifier(device: MutableDevice, endpoint: string, config: NativeHumidityConfig, platform: HomeAssistantPlatform): void {
  const Base = HumidistatBehavior.with(...(config.mode === 1 ? ['Dehumidifier', 'Sensor'] : ['Humidifier', 'Sensor', config.mist === 2 ? 'WarmMist' : 'ColdMist']));
  class HumidistatServer extends Base {
    override initialize(): void {
      this.reactTo(this.events.mode$Changing, (value: number) => {
        if (value !== config.mode) throw new StatusResponseError('Unsupported humidity mode', Status.ConstraintError);
      });
      if (config.mist !== undefined)
        this.maybeReactTo(this.events.mistType$Changing, (value: number) => {
          if (value !== config.mist) throw new StatusResponseError('Fixed mist type', Status.ConstraintError);
        });
      // oxlint-disable-next-line typescript/unbound-method -- Matter binds reactors to the active transaction behavior.
      this.reactTo(this.events.userSetpoint$Changing, this.targetChanging);
    }

    private targetChanging(value: number, _oldValue: number, context: ActionContext): void {
      const target = snapHumidityTarget(value, config.min, config.max, config.step);
      if ((!context.fabric && target === value) || context.transaction.getParticipant(config)) return;
      let applied = false;
      context.transaction.addParticipants({
        role: config,
        toString: () => `Home Assistant humidity target ${endpoint}`,
        preCommit: async () => {
          if (applied) return false;
          applied = true;
          if (context.fabric) await this.applyTarget(target);
          this.agent.asLocalActor(() => {
            this.state.userSetpoint = target;
          });
          return false;
        },
      });
    }

    private async applyTarget(value: number): Promise<void> {
      if (!Number.isInteger(value) || value < config.min || value > config.max || (value - config.min) % config.step !== 0)
        throw new StatusResponseError('Invalid humidity target', Status.ConstraintError);
      const live = platform.ha.hassStates.get(endpoint);
      const current = live && getNativeHumidityConfig(live, config.mist === 2 ? 'native-warm-mist' : 'native-cold-mist');
      if (!current || live?.state === 'unavailable' || live?.state === 'unknown') throw new StatusResponseError('Humidity device unavailable', Status.Failure);
      if (value < current.min || value > current.max || (value - current.min) % current.step !== 0)
        throw new StatusResponseError('Humidity limits changed', Status.ConstraintError);
      await platform.ha.callService('humidifier', 'set_humidity', endpoint, { humidity: value });
    }

    /**
     * Applies the supported fields of the standard SetSettings request atomically.
     *
     * @param {object} request - Decoded provisional Humidistat request.
     * @returns {Promise<void>} Applies the validated target and propagates service failures.
     */
    async setSettings(request: { userSetpoint?: number; mode?: number; mistType?: number; continuous?: boolean; sleep?: boolean; optimal?: boolean }): Promise<void> {
      // The reference SetSettings implementation ignores fields for features that are not supported.
      if (request.mode !== undefined && request.mode !== config.mode) throw new StatusResponseError('Unsupported humidity mode', Status.ConstraintError);
      if (config.mist !== undefined && request.mistType !== undefined && request.mistType !== config.mist)
        throw new StatusResponseError('Unsupported mist type', Status.ConstraintError);
      if (request.userSetpoint !== undefined) {
        const target = snapHumidityTarget(request.userSetpoint, config.min, config.max, config.step);
        await this.applyTarget(target);
        this.agent.asLocalActor(() => {
          this.state.userSetpoint = target;
        });
      }
    }
  }
  device.addClusterServerObjs(
    endpoint,
    getClusterServerObj(Humidistat.id, HumidistatServer, {
      supportedModes: [config.mode],
      mode: config.mode,
      systemState: 3,
      userSetpoint: config.target,
      minSetpoint: config.min,
      maxSetpoint: config.max,
      step: config.step,
      ...(config.mist === undefined ? {} : { mistType: config.mist }),
    }),
  );
  device.addClusterServerObjs(endpoint, getClusterServerObj(OnOff.id, MatterbridgeOnOffServer.with(OnOff.Feature.DeadFrontBehavior), { onOff: false }));
}

/**
 * Reflects HA target and actual action in native Humidistat attributes without issuing commands.
 *
 * @param {MatterbridgeEndpoint} endpoint - Humidity appliance endpoint.
 * @param {HassState} state - Latest HA state.
 * @returns {Promise<void>} Resolves after updating supported attributes.
 */
export async function updateNativeHumidity(endpoint: MatterbridgeEndpoint, state: HassState): Promise<void> {
  if (!endpoint.hasAttributeServer(Humidistat.id, 'userSetpoint')) return;
  const target = state.attributes.humidity;
  const min = endpoint.getAttribute(Humidistat.id, 'minSetpoint');
  const max = endpoint.getAttribute(Humidistat.id, 'maxSetpoint');
  const step = endpoint.getAttribute(Humidistat.id, 'step');
  if (typeof target === 'number' && Number.isInteger(target) && target >= min && target <= max) {
    await endpoint.setAttribute(Humidistat.id, 'userSetpoint', snapHumidityTarget(target, min, max, step), endpoint.log);
  }
  const action = state.attributes.action;
  const operatingMode = endpoint.getAttribute(Humidistat.id, 'mode');
  const active = state.state === 'on' && ((operatingMode === 0 && action === 'humidifying') || (operatingMode === 1 && action === 'drying'));
  await endpoint.setAttribute(Humidistat.id, 'systemState', active ? operatingMode : 3, endpoint.log);
}
