var config = {
  timeout: 10000,
  host: {
    baseUrl: '#{AUDIT_BROADCAST_SERVER}'    configuration.audit.host,
    headers: '#VSKO_API_ACCESSTOKEN_HEADER}'

    auth: {
      user: '#{SRI_USER}',     // TODO: create user and configure in application-setup (global)
      pass: '#{SRI_PASSWORD}',
    }
  }
};