import * as fs from 'fs';
import * as crypto from 'crypto';
const snmp = require('net-snmp');

type VendorName = 'meraki' | 'mikrotik' | 'fortinet' | 'unifi' | 'omada' | 'sonicwall';

interface ValidationTarget {
  name: string;
  vendor: VendorName;
  baseUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  serialNumber?: string;
  siteId?: string;
  ipAddress?: string;
  snmp?: {
    host: string;
    community?: string;
    version?: '2c';
  };
  safeActions?: Array<'sync' | 'restart' | 'disable_port' | 'enable_port' | 'bounce_poe' | 'backup_config'>;
  actionPort?: string;
}

interface ValidationConfig {
  dryRunActions?: boolean;
  outputPath?: string;
  targets: ValidationTarget[];
}

const standardOids = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  ifTable: '1.3.6.1.2.1.2.2.1',
};

const vendorOids = {
  poe: [
    '1.3.6.1.2.1.105.1.3.1.1.2',
    '1.3.6.1.2.1.105.1.3.1.1.4',
  ],
  lldp: [
    '1.0.8802.1.1.2.1.4.1.1.9',
    '1.0.8802.1.1.2.1.4.1.1.7',
  ],
  temperature: [
    '1.3.6.1.2.1.99.1.1.1.4',
    '1.3.6.1.4.1.9.9.13.1.3.1.3',
  ],
};

async function main() {
  const configPath = process.argv[2] || process.env.NETWORK_VALIDATION_CONFIG;
  if (!configPath) {
    throw new Error('Usage: npm run validate:network-vendors -- path/to/validation-targets.json');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ValidationConfig;
  const report = {
    generatedAt: new Date().toISOString(),
    dryRunActions: config.dryRunActions !== false,
    targets: [] as any[],
  };

  for (const target of config.targets) {
    report.targets.push(await validateTarget(target, config.dryRunActions !== false));
  }

  const output = JSON.stringify(report, null, 2);
  if (config.outputPath) fs.writeFileSync(config.outputPath, output);
  console.log(output);
}

async function validateTarget(target: ValidationTarget, dryRun: boolean) {
  const result: any = {
    name: target.name,
    vendor: target.vendor,
    checks: {},
    normalized: {},
    actions: [],
  };

  try {
    const apiResult = await validateVendorApi(target);
    result.checks.api = apiResult.checks;
    result.normalized.interfaces = apiResult.interfaces;
    result.normalized.firmware = apiResult.firmware;
  } catch (err: any) {
    result.checks.api = { ok: false, error: err.message };
  }

  if (target.snmp) {
    try {
      result.checks.snmp = await validateSnmp(target.snmp);
    } catch (err: any) {
      result.checks.snmp = { ok: false, error: err.message };
    }
  }

  for (const action of target.safeActions || []) {
    result.actions.push(await validateAction(target, action, dryRun));
  }

  return result;
}

async function validateVendorApi(target: ValidationTarget) {
  if (target.vendor === 'meraki') return validateMeraki(target);
  if (target.vendor === 'mikrotik') return validateMikroTik(target);
  if (target.vendor === 'fortinet') return validateFortinet(target);
  return validateConfigurableController(target);
}

async function validateMeraki(target: ValidationTarget) {
  if (!target.apiKey || !target.serialNumber) throw new Error('Meraki requires apiKey and serialNumber');
  const headers = { 'X-Cisco-Meraki-API-Key': target.apiKey, Accept: 'application/json' };
  const base = target.baseUrl || 'https://api.meraki.com/api/v1';
  const device = await fetchJson(`${base}/devices/${encodeURIComponent(target.serialNumber)}`, { headers });
  const ports = await fetchJson(`${base}/devices/${encodeURIComponent(target.serialNumber)}/switch/ports/statuses`, { headers }).catch(() => []);
  return {
    checks: {
      ok: true,
      deviceKeys: keys(device),
      portKeys: keys(Array.isArray(ports) ? ports[0] : null),
      sampleHash: hashSample({ device, ports: Array.isArray(ports) ? ports.slice(0, 2) : ports }),
    },
    firmware: { vendor: 'Cisco Meraki', model: device.model, firmwareVersion: device.firmware },
    interfaces: (Array.isArray(ports) ? ports : []).map((port: any, index: number) => ({
      ifIndex: Number(port.portId || index + 1),
      name: `Port ${port.portId || index + 1}`,
      status: port.status || 'UNKNOWN',
      speedMbps: parseSpeed(port.speed),
      poeWatts: port.poe?.powerDrawnInWh,
      vlan: port.vlan ? String(port.vlan) : undefined,
      connectedMac: port.clientMac || port.cdp?.deviceId || port.lldp?.systemName,
    })),
  };
}

async function validateMikroTik(target: ValidationTarget) {
  if (!target.baseUrl) throw new Error('MikroTik requires baseUrl');
  const headers = authHeaders(target);
  const resource = await fetchJson(`${target.baseUrl.replace(/\/$/, '')}/rest/system/resource`, { headers });
  const routerboard = await fetchJson(`${target.baseUrl.replace(/\/$/, '')}/rest/system/routerboard`, { headers }).catch(() => ({}));
  const interfaces = await fetchJson(`${target.baseUrl.replace(/\/$/, '')}/rest/interface`, { headers });
  return {
    checks: {
      ok: true,
      resourceKeys: keys(resource),
      routerboardKeys: keys(routerboard),
      interfaceKeys: keys(Array.isArray(interfaces) ? interfaces[0] : null),
      sampleHash: hashSample({ resource, routerboard, interfaces: Array.isArray(interfaces) ? interfaces.slice(0, 2) : interfaces }),
    },
    firmware: { vendor: 'MikroTik', model: routerboard.model || resource.platform, firmwareVersion: routerboard['current-firmware'] || resource.version },
    interfaces: (Array.isArray(interfaces) ? interfaces : []).map((iface: any, index: number) => ({
      ifIndex: index + 1,
      name: iface.name,
      status: iface.running === true || iface.running === 'true' ? 'UP' : 'DOWN',
    })),
  };
}

async function validateFortinet(target: ValidationTarget) {
  if (!target.baseUrl || !target.apiKey) throw new Error('Fortinet requires baseUrl and apiKey');
  const headers = { Authorization: bearer(target.apiKey), Accept: 'application/json' };
  const base = target.baseUrl.replace(/\/$/, '');
  const status = await fetchJson(`${base}/api/v2/monitor/system/status`, { headers });
  const ifaceResult = await fetchJson(`${base}/api/v2/monitor/system/interface`, { headers }).catch(() => ({}));
  const values = Array.isArray(ifaceResult?.results) ? ifaceResult.results : Object.values(ifaceResult?.results || {});
  return {
    checks: {
      ok: true,
      statusKeys: keys(status),
      interfaceKeys: keys(values[0]),
      sampleHash: hashSample({ status, interfaces: values.slice(0, 2) }),
    },
    firmware: { vendor: 'Fortinet', model: status.model_name || status.model, firmwareVersion: status.version || status.firmware_version },
    interfaces: values.map((iface: any, index: number) => ({
      ifIndex: index + 1,
      name: iface.name || iface.interface,
      status: String(iface.link || iface.status || '').toLowerCase().includes('up') ? 'UP' : 'DOWN',
      speedMbps: Number(iface.speed || 0) || undefined,
    })),
  };
}

async function validateConfigurableController(target: ValidationTarget) {
  if (!target.baseUrl) throw new Error(`${target.vendor} requires baseUrl`);
  const endpointByVendor: Record<string, string> = {
    unifi: `/proxy/network/integration/v1/sites/${encodeURIComponent(target.siteId || 'default')}/devices`,
    omada: `/openapi/v1/${encodeURIComponent(target.siteId || 'default')}/devices`,
    sonicwall: '/api/sonicos/interfaces',
  };
  const payload = await fetchJson(`${target.baseUrl.replace(/\/$/, '')}${endpointByVendor[target.vendor]}`, {
    headers: target.apiKey ? { Authorization: bearer(target.apiKey), Accept: 'application/json' } : { Accept: 'application/json' },
  });
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];
  return {
    checks: {
      ok: true,
      rootKeys: keys(payload),
      itemKeys: keys(items[0]),
      sampleHash: hashSample(Array.isArray(items) ? items.slice(0, 2) : payload),
    },
    firmware: { vendor: target.vendor, model: items[0]?.model, firmwareVersion: items[0]?.firmwareVersion || items[0]?.version || items[0]?.firmware },
    interfaces: items.flatMap((item: any, deviceIndex: number) => {
      const ports = item.ports || item.interfaces || item.port_table || [];
      return (Array.isArray(ports) ? ports : []).map((port: any, portIndex: number) => ({
        ifIndex: deviceIndex * 1000 + portIndex + 1,
        name: port.name || port.port || port.id || `Port ${portIndex + 1}`,
        status: String(port.status || port.state || '').toUpperCase() || 'UNKNOWN',
      }));
    }),
  };
}

async function validateSnmp(config: NonNullable<ValidationTarget['snmp']>) {
  const session = snmp.createSession(config.host, config.community || 'public', {
    version: snmp.Version2c,
    timeout: 3000,
    retries: 1,
  });
  try {
    const standard = await snmpGet(session, [standardOids.sysDescr, standardOids.sysUpTime]);
    const walked: Record<string, any> = {};
    for (const [group, oids] of Object.entries(vendorOids)) {
      walked[group] = [];
      for (const oid of oids) {
        walked[group].push(await snmpSubtree(session, oid).catch((err) => ({ oid, ok: false, error: err.message })));
      }
    }
    return {
      ok: true,
      sysDescr: valueOf(standard[0]),
      sysUpTime: valueOf(standard[1]),
      vendorOidCoverage: walked,
    };
  } finally {
    session.close();
  }
}

async function validateAction(target: ValidationTarget, action: string, dryRun: boolean) {
  if (dryRun) return { action, ok: true, dryRun: true };
  try {
    if (target.vendor === 'meraki' && action === 'bounce_poe') {
      if (!target.apiKey || !target.serialNumber || !target.actionPort) throw new Error('Meraki bounce_poe requires apiKey, serialNumber, actionPort');
      const base = target.baseUrl || 'https://api.meraki.com/api/v1';
      return {
        action,
        ok: true,
        response: await fetchJson(`${base}/devices/${encodeURIComponent(target.serialNumber)}/switch/ports/${encodeURIComponent(target.actionPort)}/cycle`, {
          method: 'POST',
          headers: { 'X-Cisco-Meraki-API-Key': target.apiKey, Accept: 'application/json' },
        }),
      };
    }
    return { action, ok: false, dryRun: false, error: 'No safe executable mapping in validator' };
  } catch (err: any) {
    return { action, ok: false, dryRun: false, error: err.message };
  }
}

async function fetchJson(url: string, init: any = {}) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function authHeaders(target: ValidationTarget) {
  if (target.apiKey) return { Authorization: bearer(target.apiKey), Accept: 'application/json' };
  if (target.username || target.password) {
    return {
      Authorization: `Basic ${Buffer.from(`${target.username || ''}:${target.password || ''}`).toString('base64')}`,
      Accept: 'application/json',
    };
  }
  return { Accept: 'application/json' };
}

function bearer(value: string) {
  return value.startsWith('Bearer ') || value.startsWith('Basic ') ? value : `Bearer ${value}`;
}

function keys(value: any) {
  return value && typeof value === 'object' ? Object.keys(value).sort() : [];
}

function parseSpeed(value: any) {
  if (!value) return undefined;
  const text = String(value).toLowerCase();
  const num = Number(text.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num)) return undefined;
  if (text.includes('gbps')) return Math.round(num * 1000);
  return Math.round(num);
}

function hashSample(value: any) {
  return crypto.createHash('sha256').update(JSON.stringify(redact(value))).digest('hex');
}

function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => {
    if (/token|key|secret|password|credential/i.test(key)) return [key, '[REDACTED]'];
    return [key, redact(val)];
  }));
}

function snmpGet(session: any, oids: string[]) {
  return new Promise<any[]>((resolve, reject) => {
    session.get(oids, (err: Error, varbinds: any[]) => err ? reject(err) : resolve(varbinds || []));
  });
}

function snmpSubtree(session: any, oid: string) {
  return new Promise<any>((resolve, reject) => {
    const rows: any[] = [];
    session.subtree(oid, 20, (varbinds: any[]) => {
      rows.push(...(varbinds || []).map((item) => ({ oid: item.oid, valueType: typeof valueOf(item), value: valueOf(item) })));
    }, (err: Error) => {
      if (err) reject(err);
      else resolve({ oid, ok: true, count: rows.length, sample: rows.slice(0, 5) });
    });
  });
}

function valueOf(varbind: any) {
  if (!varbind || snmp.isVarbindError(varbind)) return null;
  if (Buffer.isBuffer(varbind.value)) return varbind.value.toString('utf8');
  return varbind.value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
