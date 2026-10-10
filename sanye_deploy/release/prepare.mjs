import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const services = ['gateway', 'auth', 'anime', 'search', 'ai_chat', 'favorite', 'file', 'feedback', 'job', 'admin_server', 'client', 'admin'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const run = (exe, args, cwd) => execFileSync(exe, args, { cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export function pinnedImage(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Image must use a registry digest');
  return value;
}
export function sourceIdentity(root, expected) {
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('Full candidate commit required');
  const head = run('git', ['rev-parse', 'HEAD'], root);
  if (head !== expected) throw new Error('Candidate commit mismatch');
  if (run('git', ['status', '--porcelain', '--untracked-files=all'], root)) throw new Error('Clean checkout required; existing changes must be committed separately');
  return { commit: head, tree: run('git', ['rev-parse', 'HEAD^{tree}'], root) };
}
export function inventory(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Symlinks are forbidden in release inputs');
    if (entry.isDirectory()) return inventory(root, path);
    if (!entry.isFile()) throw new Error('Unsupported release input');
    return [{ path, sha256: sha256(readFileSync(join(root, path))) }];
  });
}
export function prepare({ root, output, commit, javaImage, webImage, registry }) {
  const source = sourceIdentity(root, commit);
  const bases = JSON.parse(readFileSync(join(root, 'sanye_deploy/release/base-images.json')));
  javaImage ??= bases.java; webImage ??= bases.web;
  if (javaImage !== bases.java || webImage !== bases.web) throw new Error('Base images must match the reviewed lock');
  pinnedImage(javaImage); pinnedImage(webImage);
  if (!/^[a-z0-9][a-z0-9.:-]*\/[a-z0-9/_-]+$/.test(registry ?? '')) throw new Error('Registry namespace required');
  if (existsSync(output)) throw new Error('Output must be a new directory');
  // Only allowlisted build outputs enter Docker contexts; checkout secrets and caches stay outside.
  mkdirSync(output, { recursive: true });
  const releaseDir = join(root, 'sanye_deploy/release');
  const javac = run('javac', ['-version'], root);
  if (javac !== 'javac 21.0.12' || process.version !== 'v26.5.0') throw new Error('Release requires Node.js 26.5.0 and javac 21.0.12');
  const tracked = run('git', ['ls-files', '--', 'sanye_server', 'sanye_admin_server'], root).split('\n');
  const fingerprints = paths => paths.map(path => ({ path, sha256: sha256(readFileSync(join(root, path))) }));
  const manifest = { version: 1, ...source, platform: 'linux/amd64', toolchain: { node: process.version, javac },
    lockSha256: sha256(readFileSync(join(root, 'pnpm-lock.yaml'))),
    maven: fingerprints(tracked.filter(path => path.endsWith('/pom.xml'))),
    migrations: fingerprints(tracked.filter(path => path.includes('/db/migration/') && path.endsWith('.sql'))), services: {} };
  for (const name of services) {
    const context = join(output, name);
    mkdirSync(context);
    const web = ['client', 'admin'].includes(name);
    if (web) {
      cpSync(join(root, `sanye_${name}/dist`), join(context, 'dist'), { recursive: true, dereference: false });
      if (!existsSync(join(context, 'dist/index.html'))) throw new Error('Missing frontend build');
      cpSync(join(releaseDir, 'nginx.conf'), join(context, 'nginx.conf'));
    } else {
      const target = name === 'admin_server' ? 'sanye_admin_server/sanye_admin_app/target' : `sanye_server/sanye-server-${name.replaceAll('_', '-')}/target`;
      const jars = readdirSync(join(root, target)).filter(file => file.endsWith('.jar') && !file.endsWith('-sources.jar') && !file.endsWith('-javadoc.jar'));
      if (jars.length !== 1) throw new Error(`Expected one executable JAR for ${name}`);
      cpSync(join(root, target, jars[0]), join(context, 'app.jar'));
      run('javac', ['--release', '21', '-d', context, join(releaseDir, 'Healthcheck.java')], root);
    }
    cpSync(join(releaseDir, `${web ? 'web' : 'java'}.Dockerfile`), join(context, 'Dockerfile'));
    manifest.services[`sanye_${name}`] = { tag: `${registry}/sanye_${name}:${commit}`, baseImage: web ? webImage : javaImage, inputs: inventory(context) };
  }
  writeFileSync(join(output, 'candidate.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

export function compose(manifest) {
  if (!/^[a-f0-9]{40}$/.test(manifest.commit ?? '')) throw new Error('Missing commit');
  const entries = {};
  for (const name of services) {
    const key = `sanye_${name}`;
    const service = manifest.services[key];
    const web = ['client', 'admin'].includes(name);
    const env = { SANYE_ENV: 'test', SERVER_PORT: '8080', MANAGEMENT_SERVER_PORT: '8090', MANAGEMENT_PORT: '8090', MANAGEMENT_ENDPOINT_HEALTH_SHOW_DETAILS: 'never' };
    if (!['anime', 'search'].includes(name)) env.MANAGEMENT_HEALTH_RABBIT_ENABLED = 'false';
    if (name === 'admin_server') Object.assign(env, {
      RELEASE_HEALTH_URL: 'http://127.0.0.1:8080/', SANYE_ADMIN_UPLOAD_PATH: '/app/data/uploads',
      SANYE_ANIME_SERVICE_URL: 'http://sanye_anime:8080', SANYE_FEEDBACK_SERVICE_URL: 'http://sanye_feedback:8080', SANYE_AI_SERVICE_URL: 'http://sanye_ai_chat:8080',
    });
    if (name === 'file') env.FILE_STORAGE_DIR = '/app/data/files';
    if (name === 'job') Object.assign(env, { SANYE_SEARCH_SERVICE_URL: 'http://sanye_search:8080', XXL_JOB_ENABLED: 'true', XXL_JOB_EXECUTOR_ADDRESS: 'http://sanye_job:9999' });
    if (['anime', 'search'].includes(name)) env.SANYE_EVENT_ENABLED = 'true';
    if (name === 'anime') env.SANYE_EVENT_PUBLISHER_ENABLED = 'true';
    if (name !== 'admin_server' && !web) Object.assign(env, { NACOS_ENABLED: 'true', SPRING_CLOUD_NACOS_CONFIG_ENABLED: 'false', SPRING_CLOUD_NACOS_DISCOVERY_METADATA_RELEASE_COMMIT: manifest.commit });
    entries[key] = {
      image: pinnedImage(service?.image), restart: 'unless-stopped',
      labels: { 'org.opencontainers.image.revision': manifest.commit },
      ...(web ? { ports: [`127.0.0.1:${name === 'client' ? 18080 : 18081}:8080`], depends_on: { sanye_gateway: { condition: 'service_healthy' } } } : {
        env_file: [`./config/${key}.env`], environment: env,
        volumes: [`${key}_data:/app/data`, `${key}_logs:/app/logs`],
      }),
      ...(name === 'gateway' ? { environment: { ...env, NACOS_ENABLED: 'true', SPRING_CLOUD_NACOS_CONFIG_ENABLED: 'false', SPRING_CLOUD_NACOS_DISCOVERY_METADATA_RELEASE_COMMIT: manifest.commit, SANYE_ADMIN_SERVICE_URL: 'http://sanye_admin_server:8080' } } : {}),
    };
  }
  return { name: 'sanye_test', services: entries,
    networks: { default: { external: true, name: 'sanye_test_backend' } },
    volumes: Object.fromEntries(services.filter(n => !['client', 'admin'].includes(n)).flatMap(n => [[`sanye_${n}_data`, {}], [`sanye_${n}_logs`, {}]])) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, output] = process.argv.slice(2);
    if (mode !== 'prepare' || !output) throw new Error('Usage: prepare.mjs prepare <new-output-directory>');
    prepare({ root: process.cwd(), output: resolve(output), commit: process.env.RELEASE_COMMIT, javaImage: process.env.RELEASE_JAVA_IMAGE, webImage: process.env.RELEASE_WEB_IMAGE, registry: process.env.RELEASE_REGISTRY });
    console.log('Candidate contexts prepared');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
