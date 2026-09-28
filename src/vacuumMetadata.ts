/** Parsed MIoT room, saved map and preset metadata; IDs remain scoped to their own source. */
export interface VacuumMetadata {
  mapUid?: number;
  rooms: { id: number; name: string }[];
  maps: { id: number; name: string; current: boolean }[];
  presets: { id: number; name: string; rooms: number[] }[];
}

/**
 * Narrows parsed JSON to a plain record.
 * @param {unknown} value Parsed value.
 * @returns {boolean} Whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parses MIoT JSON sensor values without treating object names as URLs or coordinates.
 * @param {unknown[]} values Same-device sensor states and MIoT attributes.
 * @returns {VacuumMetadata} Validated room names, map labels and preset room references.
 */
export function parseVacuumMetadata(values: unknown[]): VacuumMetadata {
  const result: VacuumMetadata = { rooms: [], maps: [], presets: [] };
  for (const value of values) {
    let data: unknown = value;
    if (typeof value === 'string') {
      if (value.length > 65536 || !value.trim().startsWith('{')) continue;
      try {
        data = JSON.parse(value);
      } catch {
        continue;
      }
    }
    if (!isRecord(data)) continue;
    if (typeof data.map_uid === 'number' && Number.isSafeInteger(data.map_uid) && data.map_uid >= 0) result.mapUid = data.map_uid;
    if (Array.isArray(data.rooms)) {
      for (const room of data.rooms.slice(0, 256)) {
        if (
          isRecord(room) &&
          typeof room.id === 'number' &&
          Number.isSafeInteger(room.id) &&
          room.id >= 0 &&
          typeof room.name === 'string' &&
          !result.rooms.some((item) => item.id === room.id)
        ) {
          result.rooms.push({ id: room.id, name: room.name.slice(0, 128) || `Room ${room.id}` });
        }
      }
    }
    if (Array.isArray(data.map_array)) {
      for (const map of data.map_array.slice(0, 64)) {
        if (
          isRecord(map) &&
          typeof map.map_id === 'number' &&
          Number.isSafeInteger(map.map_id) &&
          map.map_id >= 0 &&
          typeof map.map_name === 'string' &&
          !result.maps.some((item) => item.id === map.map_id)
        ) {
          result.maps.push({ id: map.map_id, name: map.map_name.slice(0, 128), current: map.is_current === true });
        }
      }
    }
    if (Array.isArray(data.user_labels)) {
      for (const preset of data.user_labels.slice(0, 256)) {
        if (
          isRecord(preset) &&
          typeof preset.id === 'number' &&
          Number.isSafeInteger(preset.id) &&
          preset.id >= 0 &&
          typeof preset.name === 'string' &&
          Array.isArray(preset.room_ids) &&
          !result.presets.some((item) => item.id === preset.id)
        ) {
          const rooms = preset.room_ids.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0).slice(0, 256);
          result.presets.push({ id: preset.id, name: preset.name.slice(0, 128), rooms });
        }
      }
    }
  }
  return result;
}
