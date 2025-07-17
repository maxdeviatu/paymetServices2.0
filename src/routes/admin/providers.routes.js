const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middlewares/auth')
const { requireRole } = require('../../middlewares/role')
const paymentService = require('../../services/payment')
const AuthenticationManager = require('../../utils/authenticationManager')
const logger = require('../../config/logger')

/**
 * Get provider status
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const providers = paymentService.getAvailableProviders()
    const authStats = AuthenticationManager.getAuthenticationStats()
    const status = {}

    for (const providerName of Object.keys(paymentService.providers)) {
      const provider = paymentService.providers[providerName]
      const authInfo = authStats.providers[providerName]

      status[providerName] = {
        available: providers.includes(providerName),
        ready: paymentService.isProviderReady(providerName),
        hasAuth: typeof provider.authenticate === 'function',
        tokenValid: authInfo ? authInfo.tokenValid : true,
        tokenExpiration: authInfo ? authInfo.tokenExpiration : null,
        isAuthenticating: authInfo ? authInfo.isAuthenticating : false,
        lastAuthAttempt: authInfo ? authInfo.lastAuthAttempt : null
      }
    }

    res.json({
      success: true,
      providers: status,
      availableCount: providers.length,
      authenticationStats: authStats
    })
  } catch (error) {
    logger.logError(error, { operation: 'getProviderStatus' })
    res.status(500).json({
      success: false,
      error: 'Failed to get provider status'
    })
  }
})

/**
 * Re-authenticate a specific provider
 */
router.post('/:provider/authenticate', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { provider: providerName } = req.params

    const provider = paymentService.providers[providerName]
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: `Provider '${providerName}' not found`
      })
    }

    if (typeof provider.authenticate !== 'function') {
      return res.status(400).json({
        success: false,
        error: `Provider '${providerName}' does not support authentication`
      })
    }

    logger.info(`Admin-triggered re-authentication for provider: ${providerName}`)

    // Use AuthenticationManager for thread-safe authentication
    await AuthenticationManager.getAuthenticatedProvider(providerName)

    res.json({
      success: true,
      message: `Provider '${providerName}' authenticated successfully`,
      tokenValid: AuthenticationManager.isTokenValid(providerName)
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'authenticateProvider',
      provider: req.params.provider
    })
    res.status(500).json({
      success: false,
      error: `Failed to authenticate provider: ${error.message}`
    })
  }
})

/**
 * Refresh token for a specific provider
 */
router.post('/:provider/refresh', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { provider: providerName } = req.params

    const provider = paymentService.providers[providerName]
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: `Provider '${providerName}' not found`
      })
    }

    if (typeof provider.authenticate !== 'function') {
      return res.status(400).json({
        success: false,
        error: `Provider '${providerName}' does not support authentication`
      })
    }

    logger.info(`Admin-triggered token refresh for provider: ${providerName}`)

    // Use AuthenticationManager for thread-safe force refresh
    await AuthenticationManager.forceRefresh(providerName)

    res.json({
      success: true,
      message: `Provider '${providerName}' token refreshed successfully`,
      tokenValid: AuthenticationManager.isTokenValid(providerName)
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'refreshProviderToken',
      provider: req.params.provider
    })
    res.status(500).json({
      success: false,
      error: `Failed to refresh provider token: ${error.message}`
    })
  }
})

module.exports = router
