const pseudoMailer = {
  sendOtp: jest.fn().mockResolvedValue(true),
  sendWelcome: jest.fn().mockResolvedValue(true)
}

module.exports = pseudoMailer 