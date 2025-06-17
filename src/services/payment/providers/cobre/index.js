const auth = require('./auth');

class CobreProvider {
  async authenticate() {
    return auth.authenticate();
  }

  getAuthHeaders() {
    return auth.getAuthHeaders();
  }
}

module.exports = new CobreProvider(); 