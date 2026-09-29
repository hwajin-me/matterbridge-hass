import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type CommandHandlerData, type MatterbridgeEndpoint, roboticVacuumCleaner } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';

import { generateDevice, generateEntity, generateLabel, generateState } from '../src/helpers.js';
import { HomeAssistant } from '../src/homeAssistant.js';
import { HomeAssistantPlatform } from '../src/module.js';

vi.mock('../src/payload.js', () => ({ savePayload: vi.fn(async () => {}) }));
vi.mock('../src/report.js', () => ({ writeReport: vi.fn(async () => '') }));

/**
 * Runs startup and endpoint construction without opening HA or Matter sockets.
 *
 * @param {string} strategy Controller endpoint strategy.
 * @param {boolean} split Whether the vacuum is selected as a split entity.
 * @param {boolean} companions Whether to include map, battery and mode entities.
 * @param {boolean} individual Whether the vacuum has no HA device.
 * @param {object | undefined} labelScenario Label-based split exposure and naming scenario.
 * @returns {Promise<object>} Constructed endpoints, routing and captured errors.
 */
async function scan(
  strategy: string,
  split: boolean,
  companions: boolean,
  individual = false,
  labelScenario?: { sameName: boolean; exposeCompanions: boolean; postfix?: string; splitByLabel?: boolean; deviceLabel?: boolean },
): Promise<{ registered: MatterbridgeEndpoint[]; platform: HomeAssistantPlatform; errors: unknown[][]; vacuumId: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'vacuum-registration-'));
  const log = new AnsiLogger({ logName: 'VacuumRegistration', logLevel: LogLevel.ERROR });
  const errors: unknown[][] = [];
  vi.spyOn(log, 'error').mockImplementation((...args) => {
    errors.push(args);
  });
  const ha = new HomeAssistant('ws://localhost:8123', 'test-token');
  ha.connected = true;
  ha.hassConfig = {} as typeof ha.hassConfig;
  ha.hassServices = {};
  vi.spyOn(ha, 'connect').mockResolvedValue('test');
  const device = generateDevice(ha, 'Robot Vacuum');
  if (individual) ha.hassDevices.delete(device.id);
  const entity = generateEntity(ha, 'robot', 'vacuum', individual ? null : device);
  entity.platform = 'virtual_layer';
  generateState(ha, entity, 'docked', { supported_features: 13180 });
  if (companions) {
    for (const [id, attrs] of [
      ['sensor.robot_battery', { device_class: 'battery', unit_of_measurement: '%' }],
      ['image.robot_map', {}],
      ['select.robot_mode', { options: ['Vacuum', 'Mop'] }],
    ] as const) {
      const companion = generateEntity(ha, id.split('.')[1], id.split('.')[0], device);
      generateState(ha, companion, id.startsWith('sensor.') ? '80' : 'Vacuum', attrs);
    }
  }
  // The registry order is not guaranteed; put mode controls before the vacuum.
  ha.hassEntities.delete(entity.entity_id);
  ha.hassEntities.set(entity.entity_id, entity);
  const registered: MatterbridgeEndpoint[] = [];
  const platform = {
    log,
    ha,
    config: {
      name: 'test',
      host: 'ws://localhost:8123',
      splitEntities: split ? [entity.entity_id] : [],
      splitByLabel: '',
      controllerStrategy: strategy,
      enableServerRvc: true,
      virtualControlLabel: '',
      splitNameStrategy: 'Entity name',
    },
    matterbridge: { matterbridgePluginDirectory: directory, matterbridgeVersion: '3.10.10', systemInformation: { nodeVersion: '24.14.0' } },
    ready: Promise.resolve(),
    dryRun: true,
    haSubscriptionId: 1,
    supportedDomains: ['vacuum', 'sensor', 'select'],
    supportedCoreDomains: ['vacuum', 'select'],
    supportedHelpersDomains: [],
    matterbridgeDevices: new Map(),
    endpointNames: new Map(),
    mediaControlEntities: new Set(),
    environmentControls: new Map(),
    batteryVoltageEntities: new Set(),
    stateCache: { get: vi.fn() },
    failedDevices: 0,
    failedEntities: 0,
    clearSelect: vi.fn(),
    clearDeviceSelect: vi.fn(),
    clearEntitySelect: vi.fn(),
    setSelectDevice: vi.fn(),
    setSelectEntity: vi.fn(),
    setSelectDeviceEntity: vi.fn(),
    validateDevice: () => true,
    validateEntity: () => true,
    hasDeviceName: (name: string) => registered.some((item) => item.deviceName === name),
    commandHandler: vi.fn(),
    subscribeHandler: vi.fn(),
    registerDevice: async (endpoint: MatterbridgeEndpoint) => {
      registered.push(endpoint);
    },
  } as unknown as HomeAssistantPlatform;
  if (labelScenario) {
    const expose = generateLabel(ha, 'Expose: Matter');
    const splitLabel = generateLabel(ha, 'Expose: MatterSplit');
    entity.labels = [expose.label_id, splitLabel.label_id];
    if (labelScenario.sameName) entity.original_name = device.name;
    if (labelScenario.exposeCompanions) {
      for (const companion of ha.hassEntities.values()) {
        if (companion.entity_id !== entity.entity_id) companion.labels = [expose.label_id];
      }
    }
    platform.config.namePostfix = labelScenario.postfix ?? '';
    platform.config.filterByArea = '';
    platform.config.filterByLabel = expose.name;
    platform.config.splitByLabel = labelScenario.splitByLabel === false ? '' : splitLabel.name;
    if (labelScenario.deviceLabel) device.labels = [expose.label_id];
    platform.config.splitEntities = [];
  }
  try {
    await HomeAssistantPlatform.prototype.onStart.call(platform);
    return { registered, platform, errors, vacuumId: entity.entity_id };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('vacuum startup registration', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    { exposeCompanions: false, postfix: '' },
    { exposeCompanions: true, postfix: '' },
    { exposeCompanions: true, postfix: 'HA' },
  ])('should expose a same-name label-split vacuum: %j', async ({ exposeCompanions, postfix }) => {
    const { platform, errors, vacuumId } = await scan('Merge', true, true, false, { sameName: true, exposeCompanions, postfix });
    expect(errors).toEqual([]);
    expect(platform.matterbridgeDevices.has(vacuumId)).toBe(true);
    expect(platform.matterbridgeDevices.get(vacuumId)?.deviceName).toBe(`Robot Vacuum${exposeCompanions ? ` (${vacuumId})` : ''}${postfix ? ` ${postfix}` : ''}`);
  });

  it.each([false, true])('should expose entity-only labels with splitByLabel=%s and exclude unlabeled siblings', async (splitByLabel) => {
    const { platform, errors, vacuumId } = await scan('Merge', false, true, false, { sameName: false, exposeCompanions: false, splitByLabel });
    expect(errors).toEqual([]);
    expect(platform.endpointNames.has(vacuumId)).toBe(true);
    expect([...platform.endpointNames.keys()].filter((id) => id.startsWith('select.'))).toEqual([]);
  });

  it('should keep device-labeled siblings exposed when only the vacuum also has an entity label', async () => {
    const { platform, errors, vacuumId } = await scan('Merge', false, true, false, {
      sameName: false,
      exposeCompanions: false,
      splitByLabel: false,
      deviceLabel: true,
    });
    expect(errors).toEqual([]);
    expect(platform.endpointNames.has(vacuumId)).toBe(true);
    expect([...platform.endpointNames.keys()].some((id) => id.startsWith('select.'))).toBe(true);
  });

  it.each(['Merge', 'Matter'])('should register an individual server vacuum using %s', async (strategy) => {
    const { registered, platform, errors, vacuumId } = await scan(strategy, false, false, true);
    expect(errors).toEqual([]);
    expect(registered).toHaveLength(1);
    expect(registered[0].deviceType).toBe(roboticVacuumCleaner.code);
    expect(platform.endpointNames.get(vacuumId)).toBe('');
  });
  it.each(['Merge', 'Matter'])('should register grouped vacuum with %s strategy and map/battery/mode companions', async (strategy) => {
    const { registered, platform, errors, vacuumId } = await scan(strategy, false, true);
    expect(errors).toEqual([]);
    expect(registered).toHaveLength(1);
    expect(platform.endpointNames.has(vacuumId)).toBe(true);
    expect(registered[0].deviceType).toBe(roboticVacuumCleaner.code);
    expect(platform.endpointNames.get(vacuumId)).toBe('');
    await registered[0].commandHandler.executeHandler('RvcRunMode.changeToMode', {
      command: 'changeToMode',
      request: { newMode: 2 },
      cluster: 'rvcRunMode',
      attributes: {} as CommandHandlerData<'RvcRunMode.changeToMode'>['attributes'],
      endpoint: registered[0],
    });
    expect(platform.commandHandler).toHaveBeenCalledWith(expect.anything(), vacuumId, 'changeToMode');
    expect(registered[0].getChildEndpoints().some((child) => child.originalId?.startsWith('select.'))).toBe(true);
  });
  it.each(['Merge', 'Matter'])('should register a split vacuum using %s even when its parent has companions', async (strategy) => {
    const { registered, platform, errors, vacuumId } = await scan(strategy, true, true);
    expect(errors).toEqual([]);
    expect(platform.matterbridgeDevices.has(vacuumId)).toBe(true);
    expect(registered.some((endpoint) => endpoint.mode === 'server')).toBe(true);
    expect(platform.endpointNames.get(vacuumId)).toBe('');
  });
});
