import { createHash } from 'node:crypto';

/* oxlint-disable no-bitwise -- Home Assistant capability bitmasks. */
import { type HassEntity, type HassState, type HomeAssistant, VacuumEntityFeature } from './homeAssistant.js';
import { parseVacuumMetadata } from './vacuumMetadata.js';
import { readVacuumPosition, transformVacuumPoint, vacuumPoint } from './vacuumPosition.js';

const commands: Readonly<Record<string, number>> = {
  start: VacuumEntityFeature.START,
  pause: VacuumEntityFeature.PAUSE,
  stop: VacuumEntityFeature.STOP,
  return_to_base: VacuumEntityFeature.RETURN_HOME,
  locate: VacuumEntityFeature.LOCATE,
  clean_spot: VacuumEntityFeature.CLEAN_SPOT,
  set_fan_speed: VacuumEntityFeature.FAN_SPEED,
};

/** Configuration connecting vacuum entities to separately registered map cameras or images. */
export type VacuumMapEntities = Record<string, string>;

/** Explicit Virtual Layer send_command bindings; empty fields disable advanced actions. */
export interface VacuumControlBinding {
  goTo?: string;
  cleanRooms?: string;
  startPreset?: string;
}

/** Dependencies for the vacuum dashboard, restricted to selected vacuum entities. */
export interface VacuumDashboardContext {
  ha: HomeAssistant;
  endpointNames: ReadonlyMap<string, string>;
  vacuumMapRegex?: RegExp;
  config: { vacuumMapEntities?: VacuumMapEntities; vacuumControlBindings?: Record<string, VacuumControlBinding> };
}

/**
 * Finds enabled companion entities belonging to the same HA device.
 * @param {HomeAssistant} ha Home Assistant connection.
 * @param {string} vacuumId Vacuum entity ID.
 * @returns {HassEntity[]} Associated entities; unregistered devices have no inferred companions.
 */
function companions(ha: HomeAssistant, vacuumId: string): HassEntity[] {
  const deviceId = ha.hassEntities.get(vacuumId)?.device_id;
  return deviceId ? [...ha.hassEntities.values()].filter((entity) => entity.device_id === deviceId && !entity.disabled_by && !entity.hidden_by) : [];
}

/**
 * Lists explicitly configured or device-associated map sources without exposing image tokens.
 * @param {VacuumDashboardContext} context Dashboard dependencies.
 * @param {string} vacuumId Vacuum entity ID.
 * @returns {string[]} Available image and camera entity IDs.
 */
function mapEntities(context: VacuumDashboardContext, vacuumId: string): string[] {
  const configured = context.config.vacuumMapEntities?.[vacuumId];
  let candidates = configured ? [configured] : companions(context.ha, vacuumId).map((entity) => entity.entity_id);
  // A separate map integration can have its own HA device. Regex fallback is
  // unambiguous only when exactly one selected vacuum exists.
  const vacuumCount = [...context.endpointNames.keys()].filter((id) => id.startsWith('vacuum.')).length;
  if (!configured && context.vacuumMapRegex && vacuumCount === 1) {
    const regex = context.vacuumMapRegex;
    candidates = [
      ...new Set(
        [...candidates, ...context.ha.hassStates.keys()].filter((id) => {
          regex.lastIndex = 0;
          return regex.test(id);
        }),
      ),
    ];
  }
  return candidates.filter((id) => /^(camera|image)\.[a-z0-9_]+$/.test(id) && context.ha.hassStates.has(id));
}

/**
 * Projects displayable state without copying credentials or arbitrary attributes.
 * @param {HassState} state HA entity state.
 * @returns {object} Display state and supported select choices.
 */
function displayState(state: HassState): object {
  return {
    entityId: state.entity_id,
    name: state.attributes.friendly_name ?? state.entity_id,
    state: state.state,
    unit: state.attributes.unit_of_measurement,
    updated: state.last_updated,
    options: Array.isArray(state.attributes.options) ? state.attributes.options.filter((option) => typeof option === 'string') : [],
  };
}

/**
 * Collects current virtual-device metadata for display and command validation.
 * @param {VacuumDashboardContext} context Dashboard dependencies.
 * @param {HassState} state Vacuum state.
 * @returns {ReturnType<typeof parseVacuumMetadata>} Current rooms and presets.
 */
function metadata(context: VacuumDashboardContext, state: HassState): ReturnType<typeof parseVacuumMetadata> {
  return parseVacuumMetadata([
    ...Object.values(state.attributes),
    ...companions(context.ha, state.entity_id)
      .filter((entity) => entity.entity_id.startsWith('sensor.'))
      .map((entity) => context.ha.hassStates.get(entity.entity_id)?.state),
  ]);
}

/**
 * Fingerprints source metadata so an old map or room selection cannot be replayed after a remap.
 * @param {unknown} value Current map or room metadata.
 * @returns {string} Opaque content revision.
 */
function revision(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Resolves only explicitly configured commands on Virtual Layer vacuums.
 * @param {VacuumDashboardContext} context Dashboard dependencies.
 * @param {HassState} state Vacuum state.
 * @returns {VacuumControlBinding} Validated command names.
 */
function controls(context: VacuumDashboardContext, state: HassState): VacuumControlBinding {
  if (context.ha.hassEntities.get(state.entity_id)?.platform !== 'virtual_layer' || !((state.attributes.supported_features ?? 0) & VacuumEntityFeature.SEND_COMMAND)) return {};
  const configured = context.config.vacuumControlBindings?.[state.entity_id];
  const result: VacuumControlBinding = {};
  for (const key of ['goTo', 'cleanRooms', 'startPreset'] as const) {
    const name = configured?.[key];
    if (typeof name === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(name)) result[key] = name;
  }
  return result;
}

/**
 * Validates an advanced command against current metadata before dispatching to Virtual Layer.
 * @param {VacuumDashboardContext} context Dashboard dependencies.
 * @param {HassState} state Selected virtual vacuum.
 * @param {Record<string, unknown>} body Request values.
 * @returns {Promise<object>} Accepted status or a validation error.
 */
async function advancedCommand(context: VacuumDashboardContext, state: HassState, body: Record<string, unknown>): Promise<object> {
  const bindings = controls(context, state);
  const action = body.command;
  if (action !== 'goTo' && action !== 'cleanRooms' && action !== 'startPreset') return { error: 'Unsupported action' };
  const name = bindings[action];
  if (!name) return { error: 'Configure this Virtual Layer command in Settings first' };
  let params: object;
  if (action === 'goTo') {
    if (typeof body.map !== 'string' || !mapEntities(context, state.entity_id).includes(body.map)) return { error: 'Unknown map' };
    const map = context.ha.hassStates.get(body.map);
    if (!map || ['unknown', 'unavailable'].includes(map.state) || revision([map.last_updated, map.attributes]) !== body.revision)
      return { error: 'Map changed; select the destination again' };
    const location = readVacuumPosition(map.attributes, map.last_updated);
    const point = vacuumPoint(body.point);
    if (location.stale || !location.width || !location.height || !point || point.x < 0 || point.y < 0 || point.x >= location.width || point.y >= location.height)
      return { error: 'Fresh calibrated map coordinates are required' };
    const target = transformVacuumPoint(point, location.calibration, true);
    if (!target) return { error: 'Invalid map calibration' };
    params = target;
  } else {
    const current = metadata(context, state);
    if (revision(current) !== body.revision) return { error: 'Rooms or presets changed; select again' };
    if (action === 'cleanRooms') {
      const rooms = body.rooms;
      if (
        !Array.isArray(rooms) ||
        rooms.length === 0 ||
        rooms.length > 64 ||
        new Set(rooms).size !== rooms.length ||
        !rooms.every((id) => typeof id === 'number' && current.rooms.some((room) => room.id === id))
      )
        return { error: 'Invalid room selection' };
      params = { rooms };
    } else {
      if (typeof body.preset !== 'number' || !current.presets.some((preset) => preset.id === body.preset)) return { error: 'Unknown preset' };
      params = { preset_id: body.preset };
    }
  }
  await context.ha.callService('vacuum', 'send_command', state.entity_id, { command: name, params });
  return { ok: true };
}

/**
 * Handles dashboard reads and validated HA service calls; never accepts arbitrary service names.
 * @param {VacuumDashboardContext} context Dashboard dependencies.
 * @param {string} method HTTP method.
 * @param {string | undefined} path Single-segment plugin API route.
 * @param {Record<string, unknown> | undefined} query URL query values.
 * @param {unknown} body Parsed request body.
 * @returns {Promise<unknown>} JSON response, or undefined for unrelated routes.
 */
export async function vacuumDashboard(context: VacuumDashboardContext, method: string, path?: string, query?: Record<string, unknown>, body?: unknown): Promise<unknown> {
  if (!['vacuums', 'vacuum-map', 'vacuum-command'].includes(path ?? '')) return undefined;
  const { ha } = context;
  if (!ha.connected) return { error: 'Home Assistant is disconnected' };
  const vacuums = [...ha.hassStates.values()].filter((state) => state.entity_id.startsWith('vacuum.') && context.endpointNames.has(state.entity_id));
  if (method === 'GET' && path === 'vacuums') {
    return {
      vacuums: vacuums.map((state) => ({
        ...displayState(state),
        integration: ha.hassEntities.get(state.entity_id)?.platform,
        model: ha.hassDevices.get(ha.hassEntities.get(state.entity_id)?.device_id ?? '')?.model,
        battery: state.attributes.battery_level,
        fanSpeed: state.attributes.fan_speed,
        fanSpeeds: state.attributes.fan_speed_list ?? [],
        commands: Object.keys(commands).filter((command) => ((state.attributes.supported_features ?? 0) & commands[command]) !== 0),
        maps: mapEntities(context, state.entity_id),
        metadata: metadata(context, state),
        metadataRevision: revision(metadata(context, state)),
        advancedControls: controls(context, state),
        companions: companions(ha, state.entity_id)
          .filter((entity) => /^(sensor|binary_sensor|select|button)\./.test(entity.entity_id))
          .flatMap((entity) => {
            const companion = ha.hassStates.get(entity.entity_id);
            return companion ? [displayState(companion)] : [];
          }),
      })),
    };
  }
  if (method === 'GET' && path === 'vacuum-map') {
    const vacuumId = query?.vacuum;
    const entityId = query?.entity;
    if (
      typeof vacuumId !== 'string' ||
      typeof entityId !== 'string' ||
      !vacuums.some((state) => state.entity_id === vacuumId) ||
      !mapEntities(context, vacuumId).includes(entityId)
    ) {
      return { error: 'Unknown vacuum map' };
    }
    try {
      const map = ha.hassStates.get(entityId);
      if (!map || ['unknown', 'unavailable'].includes(map.state)) return { error: 'Map is unavailable' };
      const mapRevision = revision([map.last_updated, map.attributes]);
      const image = await ha.fetchEntityImage(entityId);
      const latest = ha.hassStates.get(entityId);
      if (!latest || revision([latest.last_updated, latest.attributes]) !== mapRevision) return { error: 'Map changed during download; retrying on next refresh' };
      return { image, location: readVacuumPosition(map.attributes, map.last_updated), revision: mapRevision };
    } catch {
      return { error: 'Map is unavailable from Home Assistant' };
    }
  }
  if (method === 'POST' && path === 'vacuum-command') {
    if (!body || typeof body !== 'object' || !('vacuum' in body) || !('command' in body)) return { error: 'Invalid command' };
    const state = vacuums.find((vacuum) => vacuum.entity_id === body.vacuum);
    if (!state || ['unavailable', 'unknown'].includes(state.state) || typeof body.command !== 'string') return { error: 'Vacuum is unavailable' };
    try {
      if (['goTo', 'cleanRooms', 'startPreset'].includes(body.command)) return await advancedCommand(context, state, { ...body });
      if (body.command === 'select_option' || body.command === 'press') {
        const entityId = 'entity' in body ? body.entity : undefined;
        const domain = body.command === 'press' ? 'button' : 'select';
        if (typeof entityId !== 'string' || !entityId.startsWith(`${domain}.`) || !companions(ha, state.entity_id).some((entity) => entity.entity_id === entityId))
          return { error: 'Unknown control' };
        const companion = ha.hassStates.get(entityId);
        if (!companion || companion.state === 'unavailable' || (domain === 'select' && companion.state === 'unknown')) return { error: 'Control is unavailable' };
        const option = 'option' in body ? body.option : undefined;
        if (domain === 'select' && (typeof option !== 'string' || !companion.attributes.options?.includes(option))) return { error: 'Invalid option' };
        await ha.callService(domain, body.command, entityId, domain === 'select' && typeof option === 'string' ? { option } : {});
      } else {
        if (!Object.hasOwn(commands, body.command) || ((state.attributes.supported_features ?? 0) & commands[body.command]) === 0) return { error: 'Unsupported command' };
        const speed = 'fanSpeed' in body ? body.fanSpeed : undefined;
        if (body.command === 'set_fan_speed' && (typeof speed !== 'string' || !state.attributes.fan_speed_list?.includes(speed))) return { error: 'Invalid fan speed' };
        await ha.callService('vacuum', body.command, state.entity_id, body.command === 'set_fan_speed' && typeof speed === 'string' ? { fan_speed: speed } : {});
      }
      return { ok: true };
    } catch {
      return { error: 'Home Assistant could not complete the command' };
    }
  }
  return undefined;
}
