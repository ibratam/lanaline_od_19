import { DataPreserver } from '../../src/services/DataPreserver.js';

describe('DataPreserver', () => {
  let preserver;

  beforeEach(() => {
    preserver = new DataPreserver();
  });

  it('should preserve record metadata', () => {
    const record = {
      id: 42,
      name: 'Sample',
      create_date: '2026-01-01 10:00:00',
      write_date: '2026-01-02 11:00:00'
    };

    const metadata = preserver.preserveRecordMetadata(record);
    expect(metadata).toEqual({
      id: 42,
      create_date: '2026-01-01 10:00:00',
      write_date: '2026-01-02 11:00:00'
    });
  });

  it('should prepare values with metadata applied', () => {
    const record = {
      id: 7,
      name: 'Partner',
      create_date: '2026-01-03 09:00:00',
      write_date: '2026-01-04 12:00:00',
      __last_update: '2026-01-04 12:00:00'
    };

    const values = preserver.prepareCreateValues(record);
    expect(values).toHaveProperty('name', 'Partner');
    expect(values).toHaveProperty('id', 7);
    expect(values).toHaveProperty('create_date', '2026-01-03 09:00:00');
    expect(values).toHaveProperty('write_date', '2026-01-04 12:00:00');
    expect(values).not.toHaveProperty('__last_update');
  });

  it('should handle missing records safely', () => {
    const metadata = preserver.preserveRecordMetadata(null);
    expect(metadata).toEqual({
      id: null,
      create_date: null,
      write_date: null
    });
  });
});
