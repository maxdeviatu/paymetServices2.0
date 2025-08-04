/**
 * Test script for the revive order endpoint
 * 
 * Usage: node test-revive-order.js <orderId> [reason]
 * 
 * Example: node test-revive-order.js 123 "CUSTOMER_REQUEST"
 */

const axios = require('axios')

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-auth-token-here'

async function testReviveOrder(orderId, reason = 'TEST_REVIVAL') {
  try {
    console.log(`🔄 Testing revive order endpoint...`)
    console.log(`📋 Order ID: ${orderId}`)
    console.log(`📝 Reason: ${reason}`)
    console.log(`🌐 API URL: ${API_BASE_URL}`)
    console.log('')

    const response = await axios.post(
      `${API_BASE_URL}/orders/${orderId}/revive`,
      {
        reason: reason
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    )

    console.log('✅ SUCCESS: Order revived successfully!')
    console.log('📊 Response:')
    console.log(JSON.stringify(response.data, null, 2))
    
    return response.data
  } catch (error) {
    console.error('❌ ERROR: Failed to revive order')
    
    if (error.response) {
      console.error(`📊 Status: ${error.response.status}`)
      console.error(`📋 Response: ${JSON.stringify(error.response.data, null, 2)}`)
    } else if (error.request) {
      console.error('🌐 Network error: No response received')
    } else {
      console.error(`💥 Error: ${error.message}`)
    }
    
    throw error
  }
}

// Main execution
if (require.main === module) {
  const orderId = process.argv[2]
  const reason = process.argv[3] || 'TEST_REVIVAL'

  if (!orderId) {
    console.error('❌ Usage: node test-revive-order.js <orderId> [reason]')
    console.error('📋 Example: node test-revive-order.js 123 "CUSTOMER_REQUEST"')
    process.exit(1)
  }

  testReviveOrder(orderId, reason)
    .then(() => {
      console.log('')
      console.log('🎉 Test completed successfully!')
      process.exit(0)
    })
    .catch(() => {
      console.log('')
      console.log('💥 Test failed!')
      process.exit(1)
    })
}

module.exports = { testReviveOrder } 