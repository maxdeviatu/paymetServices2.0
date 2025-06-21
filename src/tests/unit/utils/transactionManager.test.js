const TransactionManager = require('../../../utils/transactionManager')
const { sequelize } = require('../../../models')

// Mock de Sequelize
jest.mock('../../../models', () => ({
  sequelize: {
    transaction: jest.fn()
  }
}))

// Mock de logger
jest.mock('../../../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}))

describe('TransactionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('executeWebhookTransaction', () => {
    it('should execute transaction with HIGH_CONCURRENCY config', async () => {
      const mockCallback = jest.fn().mockResolvedValue('webhook-result')
      const mockTransaction = { id: 'mock-transaction' }
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        expect(config.isolationLevel).toBe('READ COMMITTED')
        return await callback(mockTransaction)
      })

      const result = await TransactionManager.executeWebhookTransaction(mockCallback)

      expect(result).toBe('webhook-result')
      expect(mockCallback).toHaveBeenCalledWith(mockTransaction)
      expect(sequelize.transaction).toHaveBeenCalledTimes(1)
    })

    it('should handle errors in webhook transactions', async () => {
      const error = new Error('Webhook transaction failed')
      const mockCallback = jest.fn().mockRejectedValue(error)
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        throw error
      })

      await expect(TransactionManager.executeWebhookTransaction(mockCallback))
        .rejects.toThrow('Webhook transaction failed')
    })
  })

  describe('executePaymentTransaction', () => {
    it('should execute transaction with CONSISTENT_WRITE config', async () => {
      const mockCallback = jest.fn().mockResolvedValue('payment-result')
      const mockTransaction = { id: 'mock-transaction' }
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        expect(config.isolationLevel).toBe('REPEATABLE READ')
        return await callback(mockTransaction)
      })

      const result = await TransactionManager.executePaymentTransaction(mockCallback)

      expect(result).toBe('payment-result')
      expect(mockCallback).toHaveBeenCalledWith(mockTransaction)
      expect(sequelize.transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('executeInventoryTransaction', () => {
    it('should execute transaction with SERIALIZABLE_INVENTORY config', async () => {
      const mockCallback = jest.fn().mockResolvedValue('inventory-result')
      const mockTransaction = { id: 'mock-transaction' }
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        expect(config.isolationLevel).toBe('SERIALIZABLE')
        return await callback(mockTransaction)
      })

      const result = await TransactionManager.executeInventoryTransaction(mockCallback)

      expect(result).toBe('inventory-result')
      expect(mockCallback).toHaveBeenCalledWith(mockTransaction)
      expect(sequelize.transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('executeBulkTransaction', () => {
    it('should execute transaction with BULK_OPERATIONS config', async () => {
      const mockCallback = jest.fn().mockResolvedValue('bulk-result')
      const mockTransaction = { id: 'mock-transaction' }
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        expect(config.isolationLevel).toBe('READ UNCOMMITTED')
        return await callback(mockTransaction)
      })

      const result = await TransactionManager.executeBulkTransaction(mockCallback, { recordsCount: 1000 })

      expect(result).toBe('bulk-result')
      expect(mockCallback).toHaveBeenCalledWith(mockTransaction)
      expect(sequelize.transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('executeReadOnlyTransaction', () => {
    it('should execute transaction with READ_ONLY config', async () => {
      const mockCallback = jest.fn().mockResolvedValue('readonly-result')
      const mockTransaction = { id: 'mock-transaction' }
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        expect(config.isolationLevel).toBe('READ COMMITTED')
        return await callback(mockTransaction)
      })

      const result = await TransactionManager.executeReadOnlyTransaction(mockCallback)

      expect(result).toBe('readonly-result')
      expect(mockCallback).toHaveBeenCalledWith(mockTransaction)
      expect(sequelize.transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('executeCustomTransaction', () => {
    it('should execute transaction with custom config', async () => {
      const mockCallback = jest.fn().mockResolvedValue('custom-result')
      const mockTransaction = { id: 'mock-transaction' }
      
      sequelize.transaction.mockImplementation(async (config, callback) => {
        expect(config.isolationLevel).toBe('READ COMMITTED')
        expect(config.timeout).toBe(5000)
        return await callback(mockTransaction)
      })

      const result = await TransactionManager.executeCustomTransaction(
        mockCallback,
        'HIGH_CONCURRENCY',
        { timeout: 5000 }
      )

      expect(result).toBe('custom-result')
      expect(mockCallback).toHaveBeenCalledWith(mockTransaction)
      expect(sequelize.transaction).toHaveBeenCalledTimes(1)
    })

    it('should throw error for unknown config name', async () => {
      const mockCallback = jest.fn()
      
      await expect(TransactionManager.executeCustomTransaction(mockCallback, 'UNKNOWN_CONFIG'))
        .rejects.toThrow('Unknown transaction configuration: UNKNOWN_CONFIG')
    })
  })

  describe('getTransactionStats', () => {
    it('should return transaction statistics', () => {
      // Mock del pool de conexiones
      const mockPool = {
        size: 15,
        options: { max: 20, min: 5 },
        available: { length: 3 },
        used: { length: 12 }
      }

      sequelize.connectionManager = {
        pool: mockPool
      }

      const stats = TransactionManager.getTransactionStats()

      expect(stats).toEqual({
        activeConnections: 15,
        maxConnections: 20,
        minConnections: 5,
        idleConnections: 3,
        usedConnections: 12
      })
    })
  })
})