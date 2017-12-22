exports = module.exports = {
  getHeaders: function (config) {
    'use strict';
    const headers = {}
    if (Object.keys(config.accessToken).length > 0) {
    	headers[config.accessToken.name] = config.accessToken.value
    }
    return headers
  }
};