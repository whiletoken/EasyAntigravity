function buildProxyLaunch(portOrOpts, cdpPort, environment = process.env, enableProxy = true, host = '127.0.0.1') {
  let port;
  let targetHost;
  if (typeof portOrOpts === 'object' && portOrOpts !== null && !Array.isArray(portOrOpts)) {
    port = portOrOpts.port;
    cdpPort = portOrOpts.cdpPort;
    environment = portOrOpts.environment || process.env;
    enableProxy = portOrOpts.enableProxy !== undefined ? portOrOpts.enableProxy : true;
    targetHost = portOrOpts.host || portOrOpts.proxyHost || '127.0.0.1';
  } else {
    port = portOrOpts;
    targetHost = host || '127.0.0.1';
  }
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=127.0.0.1'
  ];
  const env = { ...environment };
  if (enableProxy) {
    const proxyHost = String(targetHost).trim() || '127.0.0.1';
    const proxy = `http://${proxyHost}:${port}`;
    const bypass = 'localhost,127.0.0.1,::1,[::1]';
    args.push(
      `--proxy-server=${proxy}`,
      '--proxy-bypass-list=localhost;127.0.0.1;[::1]'
    );
    Object.assign(env, {
      HTTP_PROXY: proxy, HTTPS_PROXY: proxy, http_proxy: proxy, https_proxy: proxy,
      ALL_PROXY: proxy, all_proxy: proxy,
      NO_PROXY: bypass, no_proxy: bypass
    });
  }
  return { args, env };
}

module.exports = { buildProxyLaunch };
