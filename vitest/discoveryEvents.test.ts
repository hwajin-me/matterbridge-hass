import { type HassEntity, type HassState, HomeAssistant } from '../src/homeAssistant.js';

type DiscoveryClient = {
  onMessage: (data: Buffer, binary: boolean) => void;
  onFetchTimeout: () => Promise<void>;
  fetchQueue: Set<string>;
};

describe('Home Assistant discovery events', () => {
  it('should retain the first state even when the entity registry has not arrived', () => {
    const ha = new HomeAssistant('ws://localhost:8123', 'test-token');
    const client = ha as unknown as DiscoveryClient;
    const created = vi.fn();
    const update = vi.fn();
    ha.on('state_created', created);
    ha.on('event', update);
    const state = { entity_id: 'switch.new', state: 'on', attributes: {} } as HassState;
    const message = Buffer.from(
      JSON.stringify({
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: { entity_id: state.entity_id, old_state: null, new_state: state },
        },
      }),
    );
    client.onMessage(message, true);
    expect(ha.hassStates.get(state.entity_id)).toEqual(state);
    expect(created).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    ha.hassEntities.set(state.entity_id, { entity_id: state.entity_id, device_id: 'new-device' } as HassEntity);
    client.onMessage(message, true);
    expect(created).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('new-device', state.entity_id, state, state);
  });

  it('should announce a registry refresh only after the new states are available', async () => {
    const ha = new HomeAssistant('ws://localhost:8123', 'test-token');
    const client = ha as unknown as DiscoveryClient;
    const state = { entity_id: 'switch.new', state: 'on', attributes: {} } as HassState;
    const fetched = vi
      .spyOn(ha, 'fetch')
      .mockResolvedValueOnce([{ entity_id: state.entity_id, device_id: 'new-device' }])
      .mockResolvedValueOnce([state]);
    const refreshed = vi.fn(() => {
      expect(ha.hassEntities.has(state.entity_id)).toBe(true);
      expect(ha.hassStates.get(state.entity_id)).toEqual(state);
    });
    ha.on('registry_refreshed', refreshed);
    client.fetchQueue.add('config/entity_registry/list');
    await client.onFetchTimeout();
    expect(fetched).toHaveBeenLastCalledWith('get_states');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('should handle a failed state refresh without announcing incomplete discovery', async () => {
    const ha = new HomeAssistant('ws://localhost:8123', 'test-token');
    const client = ha as unknown as DiscoveryClient;
    vi.spyOn(ha, 'fetch').mockRejectedValue(new Error('Disconnected'));
    const error = vi.spyOn(ha.log, 'error').mockImplementation(() => {});
    const refreshed = vi.fn();
    ha.on('registry_refreshed', refreshed);
    await client.onFetchTimeout();
    expect(refreshed).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Error refreshing discovery states: Disconnected');
  });
});
