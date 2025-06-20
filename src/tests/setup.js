// Configuración global para las pruebas
jest.setTimeout(10000) // 10 segundos

// Mock de console para evitar ruido en las pruebas
global.console = {
  ...console,
  // Deshabilitar logs en pruebas
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}

// Mock de process.env
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'
