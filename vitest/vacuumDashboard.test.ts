/* oxlint-disable no-bitwise -- Home Assistant capability bitmasks. */
import { HomeAssistant, type HassEntity, type HassState, VacuumEntityFeature } from '../src/homeAssistant.js';
import { vacuumDashboard, type VacuumDashboardContext } from '../src/vacuumDashboard.js';

function state(entityId: string, attributes: Record<string, unknown> = {}, value = 'idle'): HassState {
  return { entity_id: entityId, state: value, attributes } as unknown as HassState;
}
function fixture(): VacuumDashboardContext {
  const ha = new HomeAssistant('ws://localhost:8123', 'private-token');
  ha.connected = true;
  for (const id of ['vacuum.robot', 'image.floor', 'select.mode', 'button.wash', 'sensor.room']) {
    ha.hassEntities.set(id, { entity_id: id, device_id: 'robot', platform: 'xiaomi_home' } as HassEntity);
    ha.hassStates.set(id, state(id));
  }
  ha.hassStates.set(
    'vacuum.robot',
    state('vacuum.robot', { supported_features: VacuumEntityFeature.START | VacuumEntityFeature.FAN_SPEED, fan_speed_list: ['Quiet', 'Turbo'], access_token: 'hidden' }),
  );
  ha.hassStates.set('select.mode', state('select.mode', { options: ['Sweep', 'Mop'] }, 'Sweep'));
  ha.hassStates.set('button.wash', state('button.wash', {}, 'unknown'));
  vi.spyOn(ha, 'callService').mockResolvedValue({ context: { id: '', parent_id: null, user_id: null }, response: null });
  vi.spyOn(ha, 'fetchEntityImage').mockResolvedValue('data:image/png;base64,YQ==');
  return { ha, endpointNames: new Map([['vacuum.robot', '']]), config: {} };
}

describe('vacuum dashboard', () => {
  it('lists selected vacuums with MIoT companions and no credentials', async () => {
    const context = fixture();
    context.ha.hassStates.set('vacuum.other', state('vacuum.other'));
    const result = await vacuumDashboard(context, 'GET', 'vacuums');
    expect(result).toMatchObject({ vacuums: [{ entityId: 'vacuum.robot', integration: 'xiaomi_home', commands: ['start', 'set_fan_speed'], maps: ['image.floor'] }] });
    expect(JSON.stringify(result)).not.toMatch(/hidden|private-token|vacuum.other/);
  });
  it('finds a separate extractor through Settings regex only for a single selected vacuum', async () => {
    const context = fixture();
    context.vacuumMapRegex = /^(image|camera)\..*_live_map$/;
    context.ha.hassStates.set('image.extractor_live_map', state('image.extractor_live_map'));
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toMatchObject({ vacuums: [{ maps: ['image.extractor_live_map'] }] });
    const endpoints = new Map(context.endpointNames);
    endpoints.set('vacuum.second', '');
    context.endpointNames = endpoints;
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toMatchObject({ vacuums: [{ maps: ['image.floor'] }] });
    context.config.vacuumMapEntities = { 'vacuum.robot': 'image.extractor_live_map' };
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toMatchObject({ vacuums: [{ maps: ['image.extractor_live_map'] }] });
  });
  it('routes Virtual Layer controls to the virtual vacuum and uses its own device map', async () => {
    const context = fixture();
    context.ha.hassEntities.set('vacuum.robot', { entity_id: 'vacuum.robot', device_id: 'robot', platform: 'virtual_layer' } as HassEntity);
    context.ha.hassStates.set(
      'vacuum.robot',
      state('vacuum.robot', {
        supported_features: VacuumEntityFeature.START | VacuumEntityFeature.CLEAN_SPOT,
        source_entity_id: 'vacuum.physical',
      }),
    );
    context.ha.hassEntities.set('vacuum.physical', { entity_id: 'vacuum.physical', device_id: 'physical', platform: 'xiaomi_home' } as HassEntity);
    context.ha.hassStates.set('vacuum.physical', state('vacuum.physical'));
    context.ha.hassEntities.set('camera.virtual_map', { entity_id: 'camera.virtual_map', device_id: 'robot', platform: 'virtual_layer' } as HassEntity);
    context.ha.hassStates.set('camera.virtual_map', state('camera.virtual_map'));
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toMatchObject({
      vacuums: [{ integration: 'virtual_layer', commands: ['start', 'clean_spot'], maps: ['camera.virtual_map'] }],
    });
    for (const command of ['start', 'clean_spot']) {
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', command })).toEqual({ ok: true });
      expect(context.ha.callService).toHaveBeenLastCalledWith('vacuum', command, 'vacuum.robot', {});
    }
    expect(await vacuumDashboard(context, 'GET', 'vacuum-map', { vacuum: 'vacuum.robot', entity: 'camera.virtual_map' })).toHaveProperty('image');
    expect(context.ha.fetchEntityImage).toHaveBeenCalledWith('camera.virtual_map');
    context.ha.hassStates.set('vacuum.robot', state('vacuum.robot', { supported_features: VacuumEntityFeature.START }));
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', command: 'clean_spot' })).toHaveProperty('error');
    expect(context.ha.callService).toHaveBeenCalledTimes(2);
  });
  it('validates opt-in Virtual Layer room and preset commands against live metadata', async () => {
    const context = fixture();
    context.ha.hassEntities.set('vacuum.robot', { entity_id: 'vacuum.robot', device_id: 'robot', platform: 'virtual_layer' } as HassEntity);
    context.ha.hassStates.set(
      'vacuum.robot',
      state('vacuum.robot', {
        supported_features: VacuumEntityFeature.SEND_COMMAND,
        room_information: { map_uid: 5, rooms: [{ id: 60, name: 'Living' }] },
        presets: { user_labels: [{ id: 123, name: 'Sweep', room_ids: [60] }] },
      }),
    );
    context.config.vacuumControlBindings = { 'vacuum.robot': { cleanRooms: 'rooms', startPreset: 'preset' } };
    const result = (await vacuumDashboard(context, 'GET', 'vacuums')) as { vacuums: { metadataRevision: string }[] };
    const revision = result.vacuums[0].metadataRevision;
    for (const body of [
      { command: 'cleanRooms', rooms: [60] },
      { command: 'startPreset', preset: 123 },
    ])
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', revision, ...body })).toEqual({ ok: true });
    expect(context.ha.callService).toHaveBeenNthCalledWith(1, 'vacuum', 'send_command', 'vacuum.robot', { command: 'rooms', params: { rooms: [60] } });
    expect(context.ha.callService).toHaveBeenNthCalledWith(2, 'vacuum', 'send_command', 'vacuum.robot', { command: 'preset', params: { preset_id: 123 } });
    for (const body of [
      { command: 'cleanRooms', rooms: [60, 60] },
      { command: 'cleanRooms', rooms: [61] },
      { command: 'cleanRooms', rooms: [] },
      { command: 'startPreset', preset: 1 },
      { command: 'startPreset', preset: 123, revision: 'old' },
    ])
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', revision, ...body })).toHaveProperty('error');
    const current = context.ha.hassStates.get('vacuum.robot');
    if (!current) throw new Error('Missing fixture vacuum');
    current.attributes = { ...current.attributes, room_information: { map_uid: 6, rooms: [{ id: 60, name: 'Living' }] } } as HassState['attributes'];
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', command: 'cleanRooms', rooms: [60], revision })).toHaveProperty('error');
    expect(context.ha.callService).toHaveBeenCalledTimes(2);
  });
  it('converts map pixels on the server and rejects stale, replaced or uncalibrated maps', async () => {
    const context = fixture();
    context.ha.hassEntities.set('vacuum.robot', { entity_id: 'vacuum.robot', device_id: 'robot', platform: 'virtual_layer' } as HassEntity);
    context.ha.hassStates.set('vacuum.robot', state('vacuum.robot', { supported_features: VacuumEntityFeature.SEND_COMMAND }));
    context.config.vacuumControlBindings = { 'vacuum.robot': { goTo: 'move' } };
    const map = state('image.floor', {
      vacuum_position: { x: 500, y: 500 },
      calibration_points: [
        { vacuum: { x: 0, y: 0 }, map: { x: 0, y: 0 } },
        { vacuum: { x: 1000, y: 0 }, map: { x: 100, y: 0 } },
        { vacuum: { x: 0, y: 1000 }, map: { x: 0, y: 100 } },
      ],
      image: { width: 100, height: 100, rotation: 0, scale: 1 },
    });
    map.last_updated = new Date().toISOString();
    context.ha.hassStates.set('image.floor', map);
    const result = (await vacuumDashboard(context, 'GET', 'vacuum-map', { vacuum: 'vacuum.robot', entity: 'image.floor' })) as { revision: string };
    const body = { vacuum: 'vacuum.robot', command: 'goTo', map: 'image.floor', revision: result.revision, point: { x: 25, y: 75 } };
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, body)).toEqual({ ok: true });
    expect(context.ha.callService).toHaveBeenCalledWith('vacuum', 'send_command', 'vacuum.robot', { command: 'move', params: { x: 250, y: 750 } });
    for (const changes of [{ point: { x: 100, y: 10 } }, { point: { x: Number.NaN, y: 10 } }, { map: 'image.other' }, { revision: 'old' }])
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { ...body, ...changes })).toHaveProperty('error');
    map.last_updated = new Date(Date.now() - 130000).toISOString();
    const stale = (await vacuumDashboard(context, 'GET', 'vacuum-map', { vacuum: 'vacuum.robot', entity: 'image.floor' })) as { revision: string };
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { ...body, revision: stale.revision })).toHaveProperty('error');
    context.config.vacuumControlBindings = {};
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, body)).toHaveProperty('error');
    expect(context.ha.callService).toHaveBeenCalledTimes(1);
  });
  it('recognizes the _map suffix on separate map devices by default without matching unrelated entities', async () => {
    const context = fixture();
    context.ha.hassStates.set('image.robot_map', state('image.robot_map'));
    context.ha.hassStates.set('camera.downstairs_map', state('camera.downstairs_map'));
    context.ha.hassStates.set('sensor.robot_map', state('sensor.robot_map'));
    context.ha.hassStates.set('camera.map_debug', state('camera.map_debug'));
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toMatchObject({ vacuums: [{ maps: ['image.robot_map', 'camera.downstairs_map'] }] });
    context.config.vacuumMapEntities = { 'vacuum.robot': 'image.floor' };
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toMatchObject({ vacuums: [{ maps: ['image.floor'] }] });
  });
  it('rejects disconnected reads and unsupported routes', async () => {
    const context = fixture();
    expect(await vacuumDashboard(context, 'GET', 'other')).toBeUndefined();
    expect(await vacuumDashboard(context, 'DELETE', 'vacuums')).toBeUndefined();
    context.ha.connected = false;
    expect(await vacuumDashboard(context, 'GET', 'vacuums')).toHaveProperty('error');
  });
  it('supports explicit map association across HA devices, but does not accept arbitrary URLs or images', async () => {
    const context = fixture();
    context.ha.hassStates.set('camera.extractor', state('camera.extractor'));
    context.config.vacuumMapEntities = { 'vacuum.robot': 'camera.extractor' };
    expect(await vacuumDashboard(context, 'GET', 'vacuum-map', { vacuum: 'vacuum.robot', entity: 'camera.extractor' })).toHaveProperty('image');
    for (const entity of ['image.floor', 'https://example.org/image', '../camera.extractor']) {
      expect(await vacuumDashboard(context, 'GET', 'vacuum-map', { vacuum: 'vacuum.robot', entity })).toHaveProperty('error');
    }
    expect(context.ha.fetchEntityImage).toHaveBeenCalledTimes(1);
    vi.mocked(context.ha.fetchEntityImage).mockRejectedValue(new Error('secret'));
    expect(await vacuumDashboard(context, 'GET', 'vacuum-map', { vacuum: 'vacuum.robot', entity: 'camera.extractor' })).toEqual({
      error: 'Map is unavailable from Home Assistant',
    });
  });
  it('sends standard commands and validates capabilities and values', async () => {
    const context = fixture();
    for (const body of [{ command: 'start' }, { command: 'set_fan_speed', fanSpeed: 'Turbo' }]) {
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', ...body })).toEqual({ ok: true });
    }
    expect(context.ha.callService).toHaveBeenCalledWith('vacuum', 'set_fan_speed', 'vacuum.robot', { fan_speed: 'Turbo' });
    for (const body of [
      null,
      {},
      { vacuum: 'vacuum.other', command: 'start' },
      { vacuum: 'vacuum.robot', command: 'stop' },
      { vacuum: 'vacuum.robot', command: 'constructor' },
      { vacuum: 'vacuum.robot', command: 'set_fan_speed', fanSpeed: 'Invalid' },
    ]) {
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, body)).toHaveProperty('error');
    }
    expect(context.ha.callService).toHaveBeenCalledTimes(2);
  });
  it('validates same-device MIoT controls and allows a button that has never been pressed', async () => {
    const context = fixture();
    for (const body of [
      { command: 'select_option', entity: 'select.mode', option: 'Mop' },
      { command: 'press', entity: 'button.wash' },
    ]) {
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', ...body })).toEqual({ ok: true });
    }
    expect(context.ha.callService).toHaveBeenCalledWith('select', 'select_option', 'select.mode', { option: 'Mop' });
    for (const body of [
      { command: 'press', entity: 'button.other' },
      { command: 'select_option', entity: 'select.mode', option: 'bad' },
    ]) {
      expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', ...body })).toHaveProperty('error');
    }
    context.ha.hassStates.set('vacuum.robot', state('vacuum.robot', {}, 'unavailable'));
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', command: 'press', entity: 'button.wash' })).toHaveProperty('error');
    expect(context.ha.callService).toHaveBeenCalledTimes(2);
  });
  it('reports service failures without leaking upstream error contents', async () => {
    const context = fixture();
    vi.mocked(context.ha.callService).mockRejectedValue(new Error('private-token'));
    expect(await vacuumDashboard(context, 'POST', 'vacuum-command', undefined, { vacuum: 'vacuum.robot', command: 'start' })).toEqual({
      error: 'Home Assistant could not complete the command',
    });
  });
});
