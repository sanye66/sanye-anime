import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, services, sha256 } from './prepare.mjs';
import { validateConfig } from './bind-config.mjs';

export function checkInstance(container, image, service, commit) {
  if (!container.State?.Running || container.State.Health?.Status !== 'healthy') throw new Error('Container is not healthy');
  if (container.Image !== image.Id || container.Config.Image !== service.image) throw new Error('Running image digest mismatch');
  if (image.Config?.Labels?.['org.opencontainers.image.revision'] !== commit) throw new Error('Image revision mismatch');
}
export function checkRegistration(hosts, commit, ips) {
  const matches = hosts.filter(host => host.enabled && host.healthy && host.port === 8080 && ips.includes(host.ip) && host.metadata?.['release.commit'] === commit);
  if (matches.length !== 1) throw new Error('Expected one healthy Nacos registration for this instance and commit');
}
export async function verify(file, nacosUrl, namespace) {
  const bytes = readFileSync(file);
  const manifest = JSON.parse(bytes);
  if (!manifest.published) throw new Error('Registry-published manifest required');
  if (!namespace || ['public', 'default'].includes(namespace)) throw new Error('Isolated Nacos namespace required');
  const expectedCompose = compose(manifest);
  const deployment = JSON.parse(readFileSync(join(dirname(file), 'deployment.json')));
  if (deployment.releaseSha256 !== sha256(bytes) || deployment.namespace !== namespace) throw new Error('Deployment configuration binding mismatch');
  const composeFile = join(dirname(file), 'compose.json');
  if (JSON.stringify(JSON.parse(readFileSync(composeFile))) !== JSON.stringify(expectedCompose)) throw new Error('Compose differs from release manifest');
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const api = new URL(nacosUrl);
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password) throw new Error('Invalid Nacos endpoint');
  const login = await fetch(new URL('/nacos/v3/auth/user/login', api), { method: 'POST', body: new URLSearchParams({ username: process.env.NACOS_USERNAME ?? '', password: process.env.NACOS_PASSWORD ?? '' }), signal: AbortSignal.timeout(10000) });
  if (!login.ok) throw new Error(`Nacos login failed: HTTP ${login.status}`);
  const auth = await login.json();
  const token = auth.accessToken ?? auth.data?.accessToken;
  if (!token) throw new Error('Nacos access token missing');
  const results = [];
  for (const name of services) {
    const key = `sanye_${name}`;
    const ids = docker(['compose', '-f', composeFile, 'ps', '-q', key]).split(/\r?\n/).filter(Boolean);
    if (ids.length !== 1) throw new Error(`Expected one instance: ${key}`);
    const container = JSON.parse(docker(['inspect', ids[0]]))[0];
    const image = JSON.parse(docker(['image', 'inspect', manifest.services[key].image]))[0];
    checkInstance(container, image, manifest.services[key], manifest.commit);
    const web = ['client', 'admin'].includes(name);
    if (!web) {
      const configBytes = readFileSync(join(dirname(file), 'config', `${key}.env`));
      if (sha256(configBytes) !== deployment.configs[key]?.sha256) throw new Error('Configuration changed after binding');
      const config = { ...validateConfig(name, configBytes.toString(), namespace), ...expectedCompose.services[key].environment };
      const actual = Object.fromEntries(container.Config.Env.map(item => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
      for (const [key, value] of Object.entries(config)) if (actual[key] !== value) throw new Error('Runtime configuration differs from bound configuration');
    }
    if (!web && name !== 'admin_server') {
      const env = Object.fromEntries(container.Config.Env.map(item => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
      if (env.NACOS_NAMESPACE !== namespace || env.NACOS_ENABLED !== 'true' || env.SANYE_ENV !== 'test') throw new Error('Instance environment mismatch');
      const url = new URL('/nacos/v1/ns/instance/list', api);
      url.search = new URLSearchParams({ namespaceId: namespace, groupName: 'DEFAULT_GROUP', serviceName: `sanye-server-${name.replaceAll('_', '-')}`, accessToken: token }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Nacos lookup failed: HTTP ${response.status}`);
      checkRegistration((await response.json()).hosts ?? [], manifest.commit, Object.values(container.NetworkSettings.Networks).map(network => network.IPAddress));
    }
    results.push({ service: key, containerId: container.Id, imageId: image.Id, healthy: true });
  }
  return { checkedAt: new Date().toISOString(), commit: manifest.commit, releaseSha256: sha256(bytes), results };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, output] = process.argv.slice(2);
  try {
    if (!file || !output) throw new Error('Usage: verify.mjs <release.json> <new-report.json>');
    const result = await verify(resolve(file), process.env.RELEASE_NACOS_URL, process.env.NACOS_NAMESPACE);
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('All release images, container health and Nacos registrations verified');
  } catch (error) {
    // Child-process output and network URLs can contain credentials; never echo them.
    console.error(error.status !== undefined || error.cause ? 'Runtime verification failed; inspect controlled environment locally' : error.message);
    process.exitCode = 1;
  }
}
