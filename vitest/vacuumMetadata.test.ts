import { parseVacuumMetadata } from '../src/vacuumMetadata.js';

describe('MIoT vacuum metadata', () => {
  it('reads room names, active map and saved preset rooms from JSON sensors', () => {
    const result = parseVacuumMetadata([
      JSON.stringify({
        rooms: [
          { id: 60, name: 'Living room' },
          { id: 62, name: 'Dressing Room' },
        ],
        map_uid: 5,
      }),
      JSON.stringify({ map_array: [{ map_id: 1, map_name: 'Home', is_current: true, obj_name: 'private/object/3' }] }),
      JSON.stringify({ user_labels: [{ id: 1120474997, name: 'V&M', room_ids: [60, 62] }] }),
    ]);
    expect(result).toEqual({
      mapUid: 5,
      rooms: [
        { id: 60, name: 'Living room' },
        { id: 62, name: 'Dressing Room' },
      ],
      maps: [{ id: 1, name: 'Home', current: true }],
      presets: [{ id: 1120474997, name: 'V&M', rooms: [60, 62] }],
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('ignores truncated JSON, object references, malformed IDs and duplicate rooms', () => {
    expect(parseVacuumMetadata(['{"rooms":', '123/456/1', null, { rooms: [null, { id: '1', name: 'bad' }, { id: -1, name: 'bad' }] }])).toEqual({
      rooms: [],
      maps: [],
      presets: [],
    });
    expect(
      parseVacuumMetadata([
        {
          rooms: [
            { id: 1, name: '' },
            { id: 1, name: 'duplicate' },
          ],
        },
      ]).rooms,
    ).toEqual([{ id: 1, name: 'Room 1' }]);
  });
});
