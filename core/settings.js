const { readJson, writeJson } = require('./storage');

const DEFAULTS = Object.freeze({
  port: 7890,
  host: '127.0.0.1',
  enableI18n: true,
  enableContextMonitor: true,
  enableProxy: true,
  targetApp: 'auto',
  customHubPath: '',
  customIdePath: ''
});

function normalizeHost(input) {
  if (input === undefined || input === null) return '127.0.0.1';
  let s = String(input).trim();
  if (!s) return '127.0.0.1';
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  if (/^[a-zA-Z0-9.-]+:\d+$/.test(s)) {
    s = s.split(':')[0];
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1);
  }
  s = s.trim();
  if (!s) return '127.0.0.1';
  if (!/^[a-zA-Z0-9.:_-]+$/.test(s)) {
    throw new Error('代理地址格式无效，请输入有效的 IP 或域名');
  }
  return s;
}

function normalizeSettings(input = {}, previous = DEFAULTS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置必须是对象');
  const result = { ...DEFAULTS, ...previous };
  if (input.port !== undefined) {
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('代理端口必须是 1–65535 的整数');
    result.port = port;
  }
  if (input.host !== undefined || input.proxyHost !== undefined) {
    const raw = input.host !== undefined ? input.host : input.proxyHost;
    if (typeof raw !== 'string') throw new Error('代理地址必须是字符串');
    result.host = normalizeHost(raw);
  }
  for (const key of ['enableI18n', 'enableContextMonitor', 'enableProxy']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`);
      result[key] = input[key];
    }
  }
  if (input.targetApp !== undefined) {
    if (!['auto', 'hub', 'ide'].includes(input.targetApp)) throw new Error('启动目标必须是 auto、hub 或 ide');
    result.targetApp = input.targetApp;
  }
  for (const key of ['customHubPath', 'customIdePath']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new Error(`${key} 必须是字符串`);
      result[key] = input[key].trim();
    }
  }
  return result;
}

function createSettings(file) {
  let value;
  try { value = normalizeSettings(readJson(file, {})); } catch { value = { ...DEFAULTS }; }
  return {
    get: () => ({ ...value }),
    update(input) {
      const next = normalizeSettings(input, value);
      writeJson(file, next);
      value = next;
      return this.get();
    }
  };
}

function assertLaunchSettingsMutable(input, previous, phase) {
  if (!['running', 'preparing', 'launching'].includes(phase)) return;
  if (input.port !== undefined && Number(input.port) !== previous.port) {
    throw new Error('代理端口将在 AG 退出后才能修改');
  }
  if (input.host !== undefined || input.proxyHost !== undefined) {
    const nextHost = normalizeHost(input.host !== undefined ? input.host : input.proxyHost);
    if (nextHost !== previous.host) {
      throw new Error('代理地址将在 AG 退出后才能修改');
    }
  }
  if (input.enableProxy !== undefined && input.enableProxy !== previous.enableProxy) {
    throw new Error('代理模式将在 AG 退出后才能修改');
  }
  if (input.targetApp !== undefined && input.targetApp !== previous.targetApp) {
    throw new Error('启动目标将在 AG 退出后才能修改');
  }
  if (input.customHubPath !== undefined && input.customHubPath !== previous.customHubPath) {
    throw new Error('桌面版路径将在 AG 退出后才能修改');
  }
  if (input.customIdePath !== undefined && input.customIdePath !== previous.customIdePath) {
    throw new Error('IDE 路径将在 AG 退出后才能修改');
  }
}

module.exports = { DEFAULTS, normalizeSettings, normalizeHost, createSettings, assertLaunchSettingsMutable };
