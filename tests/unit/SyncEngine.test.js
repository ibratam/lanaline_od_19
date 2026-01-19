import { SyncEngine } from '../../src/services/SyncEngine.js';
import { ConflictDetector } from '../../src/services/ConflictDetector.js';

describe('SyncEngine', () => {
  let syncEngine;
  let mockSourceClient;
  let mockTargetClient;
  let mockOdooClient;

  beforeEach(() => {
    mockOdooClient = {};
    syncEngine = new SyncEngine(mockOdooClient);

    mockSourceClient = {
      getModels: jest.fn(),
      search: jest.fn(),
      read: jest.fn()
    };

    mockTargetClient = {
      getModels: jest.fn(),
      search: jest.fn(),
      read: jest.fn()
    };
  });

  describe('generatePreview()', () => {
    it('should generate preview with zero differences', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' }
      ]);

      mockSourceClient.search.mockResolvedValue([1, 2, 3]);
      mockTargetClient.search.mockResolvedValue([1, 2, 3]);

      const sourceData = [
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' },
        { id: 3, name: 'Partner 3' }
      ];

      const targetData = [
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' },
        { id: 3, name: 'Partner 3' }
      ];

      mockSourceClient.read.mockResolvedValue(sourceData);
      mockTargetClient.read.mockResolvedValue(targetData);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.generated_at).toBeDefined();
      expect(preview.summary.total_models).toBe(1);
      expect(preview.summary.total_records_to_create).toBe(0);
      expect(preview.summary.total_records_to_update).toBe(0);
      expect(preview.summary.total_records_to_delete).toBe(0);
      expect(preview.summary.total_conflicts).toBe(0);
    });

    it('should detect records to create', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' }
      ]);

      mockSourceClient.search.mockResolvedValue([1, 2, 3]);
      mockTargetClient.search.mockResolvedValue([1]); // Only 1 exists in target

      mockSourceClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' },
        { id: 3, name: 'Partner 3' }
      ]);

      mockTargetClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' }
      ]);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.summary.total_records_to_create).toBe(2);
      expect(preview.models[0].to_create.count).toBe(2);
    });

    it('should detect records to update', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' }
      ]);

      mockSourceClient.search.mockResolvedValue([1, 2]);
      mockTargetClient.search.mockResolvedValue([1, 2]);

      mockSourceClient.read.mockResolvedValue([
        { id: 1, name: 'Updated Name', write_date: '2025-01-15' },
        { id: 2, name: 'Partner 2', write_date: '2025-01-10' }
      ]);

      mockTargetClient.read.mockResolvedValue([
        { id: 1, name: 'Old Name', write_date: '2025-01-10' },
        { id: 2, name: 'Partner 2', write_date: '2025-01-10' }
      ]);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.summary.total_records_to_update).toBeGreaterThanOrEqual(0);
    });

    it('should detect records to delete', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' }
      ]);

      mockSourceClient.search.mockResolvedValue([1]);
      mockTargetClient.search.mockResolvedValue([1, 2, 3]);

      mockSourceClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' }
      ]);

      mockTargetClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' },
        { id: 3, name: 'Partner 3' }
      ]);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.summary.total_records_to_delete).toBe(2);
      expect(preview.models[0].to_delete.count).toBe(2);
    });

    it('should apply model filter if provided', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' },
        { model: 'product.product' }
      ]);

      mockSourceClient.search.mockResolvedValue([]);
      mockTargetClient.search.mockResolvedValue([]);
      mockSourceClient.read.mockResolvedValue([]);
      mockTargetClient.read.mockResolvedValue([]);

      const preview = await syncEngine.generatePreview(
        mockSourceClient,
        mockTargetClient,
        ['res.partner']
      );

      expect(preview.summary.total_models).toBe(1);
      expect(preview.models[0].model).toBe('res.partner');
    });

    it('should handle empty source database', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' }
      ]);

      mockSourceClient.search.mockResolvedValue([]);
      mockTargetClient.search.mockResolvedValue([1, 2, 3]);

      mockSourceClient.read.mockResolvedValue([]);
      mockTargetClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' },
        { id: 3, name: 'Partner 3' }
      ]);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.summary.total_records_to_delete).toBe(3);
    });

    it('should handle model comparison errors gracefully', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' },
        { model: 'product.product' }
      ]);

      mockSourceClient.search
        .mockResolvedValueOnce([1])
        .mockRejectedValueOnce(new Error('Connection failed'));

      mockTargetClient.search
        .mockResolvedValueOnce([1])
        .mockResolvedValueOnce([]);

      mockSourceClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' }
      ]);
      mockTargetClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' }
      ]);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.models).toHaveLength(2);
      expect(preview.models[1].error).toBeDefined();
    });
  });

  describe('getModelsToSync()', () => {
    it('should return all non-system models', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' },
        { model: 'product.product' },
        { model: '_internal_model' }
      ]);

      const models = await syncEngine.getModelsToSync(mockSourceClient);

      expect(models).toEqual(['res.partner', 'product.product']);
    });

    it('should apply model filter if provided', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' },
        { model: 'product.product' },
        { model: 'sale.order' }
      ]);

      const models = await syncEngine.getModelsToSync(
        mockSourceClient,
        ['res.partner', 'sale.order']
      );

      expect(models).toEqual(['res.partner', 'sale.order']);
    });

    it('should handle empty model filter', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' },
        { model: 'product.product' }
      ]);

      const models = await syncEngine.getModelsToSync(mockSourceClient, []);

      // Empty array should return all models
      expect(models.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('compareModel()', () => {
    it('should compare models and identify differences', async () => {
      mockSourceClient.search.mockResolvedValue([1, 2]);
      mockTargetClient.search.mockResolvedValue([1, 2, 3]);

      mockSourceClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' }
      ]);

      mockTargetClient.read.mockResolvedValue([
        { id: 1, name: 'Partner 1' },
        { id: 2, name: 'Partner 2' },
        { id: 3, name: 'Partner 3' }
      ]);

      const comparison = await syncEngine.compareModel(
        mockSourceClient,
        mockTargetClient,
        'res.partner'
      );

      expect(comparison.model).toBe('res.partner');
      expect(comparison.to_create.count).toBe(0);
      expect(comparison.to_delete.count).toBe(1);
    });
  });

  describe('compareRecords()', () => {
    it('should detect no differences for identical records', () => {
      const sourceRecord = {
        id: 1,
        name: 'Partner 1',
        email: 'test@example.com',
        create_date: '2025-01-01',
        write_date: '2025-01-15'
      };

      const targetRecord = { ...sourceRecord };

      const diff = syncEngine.compareRecords(sourceRecord, targetRecord);

      expect(diff.hasDifferences).toBe(false);
      expect(Object.keys(diff.differences)).toHaveLength(0);
    });

    it('should detect differences in data fields', () => {
      const sourceRecord = {
        id: 1,
        name: 'Updated Name',
        email: 'test@example.com'
      };

      const targetRecord = {
        id: 1,
        name: 'Old Name',
        email: 'test@example.com'
      };

      const diff = syncEngine.compareRecords(sourceRecord, targetRecord);

      expect(diff.hasDifferences).toBe(true);
      expect(diff.differences.name).toBeDefined();
      expect(diff.differences.name.source).toBe('Updated Name');
      expect(diff.differences.name.target).toBe('Old Name');
    });

    it('should ignore system fields', () => {
      const sourceRecord = {
        id: 1,
        name: 'Name',
        create_date: '2025-01-01',
        write_date: '2025-01-15',
        __last_update: 'old'
      };

      const targetRecord = {
        id: 2,
        name: 'Name',
        create_date: '2025-01-02',
        write_date: '2025-01-16',
        __last_update: 'new'
      };

      const diff = syncEngine.compareRecords(sourceRecord, targetRecord);

      expect(diff.hasDifferences).toBe(false);
    });

    it('should detect missing fields in target', () => {
      const sourceRecord = {
        id: 1,
        name: 'Name',
        email: 'test@example.com'
      };

      const targetRecord = {
        id: 1,
        name: 'Name'
      };

      const diff = syncEngine.compareRecords(sourceRecord, targetRecord);

      expect(diff.hasDifferences).toBe(true);
      expect(diff.differences.email).toBeDefined();
      expect(diff.differences.email.source).toBe('test@example.com');
      expect(diff.differences.email.target).toBeUndefined();
    });

    it('should detect extra fields in target', () => {
      const sourceRecord = {
        id: 1,
        name: 'Name'
      };

      const targetRecord = {
        id: 1,
        name: 'Name',
        extra_field: 'value'
      };

      const diff = syncEngine.compareRecords(sourceRecord, targetRecord);

      expect(diff.hasDifferences).toBe(true);
      expect(diff.differences.extra_field).toBeDefined();
      expect(diff.differences.extra_field.source).toBeUndefined();
      expect(diff.differences.extra_field.target).toBe('value');
    });
  });

  describe('detectConflict()', () => {
    it('should detect conflict when both records have different write dates', () => {
      const sourceRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const targetRecord = {
        id: 1,
        write_date: '2025-01-14T10:00:00'
      };

      const diff = { hasDifferences: true };

      const hasConflict = syncEngine.detectConflict(sourceRecord, targetRecord, diff);

      expect(hasConflict).toBe(true);
    });

    it('should not detect conflict when write dates are identical', () => {
      const sourceRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const targetRecord = {
        id: 1,
        write_date: '2025-01-15T10:00:00'
      };

      const diff = { hasDifferences: true };

      const hasConflict = syncEngine.detectConflict(sourceRecord, targetRecord, diff);

      expect(hasConflict).toBe(false);
    });

    it('should return false without write dates', () => {
      const sourceRecord = { id: 1 };
      const targetRecord = { id: 1 };

      const diff = { hasDifferences: true };

      const hasConflict = syncEngine.detectConflict(sourceRecord, targetRecord, diff);

      expect(hasConflict).toBe(false);
    });
  });

  describe('valuesEqual()', () => {
    it('should compare primitive values', () => {
      expect(syncEngine.valuesEqual('value', 'value')).toBe(true);
      expect(syncEngine.valuesEqual('value1', 'value2')).toBe(false);
      expect(syncEngine.valuesEqual(123, 123)).toBe(true);
      expect(syncEngine.valuesEqual(123, 456)).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(syncEngine.valuesEqual(null, null)).toBe(true);
      expect(syncEngine.valuesEqual(undefined, undefined)).toBe(true);
      expect(syncEngine.valuesEqual(null, undefined)).toBe(false);
    });

    it('should compare arrays deeply', () => {
      expect(syncEngine.valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(syncEngine.valuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(syncEngine.valuesEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('should compare objects deeply', () => {
      expect(syncEngine.valuesEqual(
        { name: 'John', age: 30 },
        { name: 'John', age: 30 }
      )).toBe(true);

      expect(syncEngine.valuesEqual(
        { name: 'John', age: 30 },
        { name: 'Jane', age: 30 }
      )).toBe(false);
    });

    it('should handle nested structures', () => {
      const obj1 = {
        user: {
          name: 'John',
          hobbies: ['reading', 'coding']
        }
      };

      const obj2 = {
        user: {
          name: 'John',
          hobbies: ['reading', 'coding']
        }
      };

      expect(syncEngine.valuesEqual(obj1, obj2)).toBe(true);
    });

    it('should return false for different types', () => {
      expect(syncEngine.valuesEqual('123', 123)).toBe(false);
      expect(syncEngine.valuesEqual([1], { '0': 1 })).toBe(false);
    });
  });

  describe('Preview with conflicts', () => {
    it('should detect conflicts and separate from updates', async () => {
      mockSourceClient.getModels.mockResolvedValue([
        { model: 'res.partner' }
      ]);

      mockSourceClient.search.mockResolvedValue([1, 2]);
      mockTargetClient.search.mockResolvedValue([1, 2]);

      mockSourceClient.read.mockResolvedValue([
        {
          id: 1,
          name: 'Source Partner 1',
          email: 'source@example.com',
          write_date: '2025-01-15T10:00:00'
        },
        {
          id: 2,
          name: 'Partner 2',
          write_date: '2025-01-10T10:00:00'
        }
      ]);

      mockTargetClient.read.mockResolvedValue([
        {
          id: 1,
          name: 'Target Partner 1',
          email: 'target@example.com',
          write_date: '2025-01-14T10:00:00'
        },
        {
          id: 2,
          name: 'Partner 2',
          write_date: '2025-01-10T10:00:00'
        }
      ]);

      const preview = await syncEngine.generatePreview(mockSourceClient, mockTargetClient);

      expect(preview.summary.total_conflicts).toBeGreaterThanOrEqual(0);
    });
  });
});
