import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256, pinnedImage } from './prepare.mjs';

const root = process.cwd();
const id = `sanye_tr06_${randomBytes(6).toString('hex')}`;
const output = resolve('sanye_deploy/.local/tr06', id);
const javaImage = pinnedImage(process.env.RELEASE_JAVA_IMAGE);
const webImage = pinnedImage(process.env.RELEASE_WEB_IMAGE);
const report = { scope: 'local-container-smoke-only', startedAt: new Date().toISOString(), javaImage, webImage, checks: [], cleanup: [] };
report.scriptSha256 = sha256(readFileSync(new URL(import.meta.url)));
mkdirSync(output, { recursive: true });
const run = (exe, args, timeout = 120000) => execFileSync(exe, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const docker = args => run('docker', args, 600000);
const containers = [];
let networkCreated = false;
const token = randomBytes(48).toString('hex');
const previousToken = process.env.AUTH_TOKEN_SECRET;
process.env.AUTH_TOKEN_SECRET = token;
const check = (name, condition) => { if (!condition) throw new Error(name); report.checks.push(name); };
try {
  const javaContext = join(output, 'java'); mkdirSync(javaContext);
  const jar = join(root, 'sanye_server/sanye-server-gateway/target/sanye-server-gateway-0.1.0-SNAPSHOT.jar');
  cpSync(jar, join(javaContext, 'app.jar'));
  report.jarSha256 = sha256(readFileSync(jar));
  for (const file of ['Healthcheck.java', 'java.Dockerfile', 'web.Dockerfile', 'nginx.conf']) report[file] = sha256(readFileSync(join(root, 'sanye_deploy/release', file)));
  run('javac', ['--release', '21', '-d', javaContext, join(root, 'sanye_deploy/release/Healthcheck.java')]);
  cpSync(join(root, 'sanye_deploy/release/java.Dockerfile'), join(javaContext, 'Dockerfile'));
  docker(['build', '--build-arg', `BASE_IMAGE=${javaImage}`, '-t', `${id}_java`, javaContext]);
  report.javaImageId = docker(['image', 'inspect', `${id}_java`, '--format', '{{.Id}}']);
  docker(['network', 'create', id]); networkCreated = true;
  const gateway = `${id}_gateway`; containers.push(gateway);
  docker(['run', '-d', '--name', gateway, '--network', id, '--network-alias', 'sanye_gateway',
    '-e', 'AUTH_TOKEN_SECRET', '-e', 'SANYE_ENV=test', '-e', 'MANAGEMENT_HEALTH_RABBIT_ENABLED=false', '-e', 'MANAGEMENT_PORT=8090', '-e', 'SERVER_PORT=8080', `${id}_java`]);
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    if (docker(['inspect', gateway, '--format', '{{.State.Health.Status}}']) === 'healthy') { healthy = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  check('gateway container becomes healthy', healthy);
  check('gateway runs as non-root', docker(['exec', gateway, 'id', '-u']) === '10001');
  check('gateway data volume path is writable', docker(['exec', gateway, 'sh', '-c', 'test -w /app/data && echo writable']) === 'writable');
  let rejected = false;
  try { docker(['exec', '-e', 'RELEASE_HEALTH_URL=http://127.0.0.1:1/actuator/health', gateway, 'java', '-cp', '/app', 'Healthcheck']); } catch { rejected = true; }
  check('health command rejects unavailable endpoint', rejected);
  check('gateway logs do not contain injected secret', !docker(['logs', gateway]).includes(token));
  const webContext = join(output, 'web'); mkdirSync(webContext);
  cpSync(join(root, 'sanye_client/dist'), join(webContext, 'dist'), { recursive: true });
  cpSync(join(root, 'sanye_deploy/release/web.Dockerfile'), join(webContext, 'Dockerfile'));
  cpSync(join(root, 'sanye_deploy/release/nginx.conf'), join(webContext, 'nginx.conf'));
  docker(['build', '--build-arg', `BASE_IMAGE=${webImage}`, '-t', `${id}_web`, webContext]);
  report.webImageId = docker(['image', 'inspect', `${id}_web`, '--format', '{{.Id}}']);
  const web = `${id}_web`; containers.push(web);
  docker(['run', '-d', '--name', web, '--network', id, `${id}_web`]);
  for (let i = 0; i < 30; i++) {
    if (docker(['inspect', web, '--format', '{{.State.Health.Status}}']) === 'healthy') break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  check('nginx container becomes healthy', docker(['inspect', web, '--format', '{{.State.Health.Status}}']) === 'healthy');
  check('frontend assets and SPA fallback are served', docker(['exec', web, 'wget', '-qO-', 'http://127.0.0.1:8080/anime/fixture']).includes('<html'));
  const headers = docker(['exec', web, 'sh', '-c', 'wget -S -O /dev/null http://127.0.0.1:8080/api/v1/users/me 2>&1 || true']);
  check('nginx forwards API to real gateway and preserves rejection', headers.includes('401'));
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.status !== undefined ? 'Local command failed; raw output withheld' : error.message;
  process.exitCode = 1;
} finally {
  if (previousToken === undefined) delete process.env.AUTH_TOKEN_SECRET;
  else process.env.AUTH_TOKEN_SECRET = previousToken;
  for (const container of containers.reverse()) {
    try { writeFileSync(join(output, `${container}.log`), docker(['logs', container]).replaceAll(token, '[REDACTED]')); } catch { /* An uncreated container has no logs. */ }
    try { docker(['rm', '-f', container]); report.cleanup.push({ container, stopped: true }); }
    catch { report.cleanup.push({ container, stopped: false }); report.passed = false; process.exitCode = 1; }
  }
  if (networkCreated) {
    try { docker(['network', 'rm', id]); report.cleanup.push({ network: id, removed: true }); }
    catch { report.passed = false; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: join(output, 'report.json') }));
}
