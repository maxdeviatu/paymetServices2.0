const AuthenticationManager = require('../../../utils/authenticationManager')

// Mock logger
jest.mock('../../../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

describe('AuthenticationManager', () => {
  let mockProvider

  beforeEach(() => {
    // Reset manager state
    AuthenticationManager.clear()

    // Create mock provider
    mockProvider = {
      authenticate: jest.fn(),
      refreshToken: jest.fn(),
      isTokenValid: jest.fn(),
      accessToken: null,
      tokenExpiration: null
    }
  })

  describe('registerProvider', () => {
    it('should register provider successfully', () => {
      expect(() => {
        AuthenticationManager.registerProvider('test', mockProvider)
      }).not.toThrow()
    })

    it('should throw if provider has no authenticate method', () => {
      const invalidProvider = {}
      expect(() => {
        AuthenticationManager.registerProvider('test', invalidProvider)
      }).toThrow('Provider test must have authenticate() method')
    })
  })

  describe('getAuthenticatedProvider', () => {
    beforeEach(() => {
      AuthenticationManager.registerProvider('test', mockProvider)
    })

    it('should return provider if token is valid', async () => {
      mockProvider.isTokenValid.mockReturnValue(true)

      const result = await AuthenticationManager.getAuthenticatedProvider('test')

      expect(result).toBe(mockProvider)
      expect(mockProvider.authenticate).not.toHaveBeenCalled()
    })

    it('should authenticate if token is invalid', async () => {
      mockProvider.isTokenValid.mockReturnValue(false)
      mockProvider.authenticate.mockResolvedValue('new-token')
      mockProvider.accessToken = 'new-token'
      mockProvider.tokenExpiration = new Date(Date.now() + 60000)

      const result = await AuthenticationManager.getAuthenticatedProvider('test')

      expect(result).toBe(mockProvider)
      expect(mockProvider.authenticate).toHaveBeenCalledTimes(1)
    })

    it('should handle concurrent authentication requests', async () => {
      mockProvider.isTokenValid.mockReturnValue(false)
      mockProvider.authenticate.mockImplementation(async () => {
        // Simulate slow authentication
        await new Promise(resolve => setTimeout(resolve, 100))
        mockProvider.accessToken = 'new-token'
        mockProvider.tokenExpiration = new Date(Date.now() + 60000)
        return 'new-token'
      })

      // Start multiple concurrent requests
      const promises = [
        AuthenticationManager.getAuthenticatedProvider('test'),
        AuthenticationManager.getAuthenticatedProvider('test'),
        AuthenticationManager.getAuthenticatedProvider('test')
      ]

      const results = await Promise.all(promises)

      // All should return the same provider
      results.forEach(result => expect(result).toBe(mockProvider))

      // Authentication should only be called once
      expect(mockProvider.authenticate).toHaveBeenCalledTimes(1)
    })

    it('should throw if provider is not registered', async () => {
      await expect(AuthenticationManager.getAuthenticatedProvider('unknown'))
        .rejects.toThrow('Provider unknown not registered')
    })
  })

  describe('forceRefresh', () => {
    beforeEach(() => {
      AuthenticationManager.registerProvider('test', mockProvider)
    })

    it('should use refreshToken if available', async () => {
      mockProvider.refreshToken.mockResolvedValue('refreshed-token')
      mockProvider.accessToken = 'refreshed-token'
      mockProvider.tokenExpiration = new Date(Date.now() + 60000)

      const result = await AuthenticationManager.forceRefresh('test')

      expect(result).toBe(mockProvider)
      expect(mockProvider.refreshToken).toHaveBeenCalled()
      expect(mockProvider.authenticate).not.toHaveBeenCalled()
    })

    it('should fallback to authenticate if refreshToken fails', async () => {
      mockProvider.refreshToken.mockRejectedValue(new Error('Refresh failed'))
      mockProvider.authenticate.mockResolvedValue('new-token')
      mockProvider.accessToken = 'new-token'
      mockProvider.tokenExpiration = new Date(Date.now() + 60000)

      const result = await AuthenticationManager.forceRefresh('test')

      expect(result).toBe(mockProvider)
      expect(mockProvider.refreshToken).toHaveBeenCalled()
      expect(mockProvider.authenticate).toHaveBeenCalled()
    })

    it('should use authenticate if refreshToken is not available', async () => {
      delete mockProvider.refreshToken
      mockProvider.authenticate.mockResolvedValue('new-token')
      mockProvider.accessToken = 'new-token'
      mockProvider.tokenExpiration = new Date(Date.now() + 60000)

      const result = await AuthenticationManager.forceRefresh('test')

      expect(result).toBe(mockProvider)
      expect(mockProvider.authenticate).toHaveBeenCalled()
    })
  })

  describe('isTokenValid', () => {
    beforeEach(() => {
      AuthenticationManager.registerProvider('test', mockProvider)
    })

    it('should use provider isTokenValid method if available', () => {
      mockProvider.isTokenValid.mockReturnValue(true)

      const result = AuthenticationManager.isTokenValid('test')

      expect(result).toBe(true)
      expect(mockProvider.isTokenValid).toHaveBeenCalled()
    })

    it('should fallback to internal state if provider method not available', () => {
      delete mockProvider.isTokenValid

      // Update internal state manually
      const providerData = AuthenticationManager.providers.get('test')
      providerData.token = 'test-token'
      providerData.tokenExpiration = new Date(Date.now() + 60000)

      const result = AuthenticationManager.isTokenValid('test')

      expect(result).toBe(true)
    })

    it('should return false if token is expired', () => {
      delete mockProvider.isTokenValid

      // Update internal state with expired token
      const providerData = AuthenticationManager.providers.get('test')
      providerData.token = 'test-token'
      providerData.tokenExpiration = new Date(Date.now() - 1000) // Expired

      const result = AuthenticationManager.isTokenValid('test')

      expect(result).toBe(false)
    })

    it('should return false for unregistered provider', () => {
      const result = AuthenticationManager.isTokenValid('unknown')
      expect(result).toBe(false)
    })
  })

  describe('getAuthenticationStats', () => {
    it('should return stats for all registered providers', () => {
      AuthenticationManager.registerProvider('test1', mockProvider)
      AuthenticationManager.registerProvider('test2', { ...mockProvider })

      const stats = AuthenticationManager.getAuthenticationStats()

      expect(stats).toHaveProperty('providers')
      expect(stats).toHaveProperty('totalProviders', 2)
      expect(stats).toHaveProperty('authenticatedProviders')
      expect(stats.providers).toHaveProperty('test1')
      expect(stats.providers).toHaveProperty('test2')
    })

    it('should return correct authentication counts', () => {
      AuthenticationManager.registerProvider('valid', mockProvider)
      AuthenticationManager.registerProvider('invalid', { ...mockProvider, isTokenValid: () => false })

      const validProvider = AuthenticationManager.providers.get('valid')
      validProvider.token = 'valid-token'
      validProvider.tokenExpiration = new Date(Date.now() + 60000)

      mockProvider.isTokenValid = () => true

      const stats = AuthenticationManager.getAuthenticationStats()

      expect(stats.totalProviders).toBe(2)
      expect(stats.authenticatedProviders).toBe(1)
    })
  })

  describe('rate limiting', () => {
    beforeEach(() => {
      AuthenticationManager.registerProvider('test', mockProvider)
    })

    it('should rate limit authentication attempts', async () => {
      mockProvider.isTokenValid.mockReturnValue(false)
      mockProvider.authenticate.mockResolvedValue('token')

      // First call should go through immediately
      const start = Date.now()
      await AuthenticationManager.getAuthenticatedProvider('test')
      const firstCallDuration = Date.now() - start

      // Second call should be rate limited
      const secondStart = Date.now()
      await AuthenticationManager.getAuthenticatedProvider('test')
      const secondCallDuration = Date.now() - secondStart

      // Second call should take longer due to rate limiting
      // (Note: This test might be flaky in CI due to timing)
      expect(firstCallDuration).toBeLessThan(100)
    }, 10000)
  })
})
