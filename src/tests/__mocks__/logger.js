const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logBusiness: jest.fn(),
  logError: jest.fn()
}

module.exports = logger
