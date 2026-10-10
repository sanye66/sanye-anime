import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, services, sha256 } from './prepare.mjs';

export function validateConfig(name, text, namespace) {
  const env = parseEnv(text);
  for (const [key, value] of Object.entries(env)) {
    if (/[\r\n$]/.test(value)) throw new Error(`Unsupported interpolation or multiline value: ${key}`);
  }
  const required = name === 'admin_server' ? ['SANYE_ADMIN_DATASOURCE_URL', 'SANYE_ADMIN_DATASOURCE_USERNAME', 'SANYE_ADMIN_DATASOURCE_PASSWORD', 'SANYE_ADMIN_REDIS_HOST', 'SANYE_ADMIN_REDIS_PASSWORD', 'SANYE_ADMIN_TOKEN_SECRET', 'SANYE_MANAGE_TOKEN'] : ['NACOS_SERVER_ADDR', 'NACOS_NAMESPACE', 'NACOS_USERNAME', 'NACOS_PASSWORD'];
  if (name !== 'gateway' && name !== 'admin_server') required.push('DB_URL', 'DB_USERNAME', 'DB_PASSWORD');
  if (['gateway', 'auth'].includes(name)) required.push('AUTH_TOKEN_SECRET');
  if (['anime', 'search', 'ai_chat', 'feedback'].includes(name)) required.push('SANYE_MANAGE_TOKEN');
  if (name === 'job') required.push('SANYE_INTERNAL_CALL_TOKEN', 'XXL_JOB_ADMIN_ADDRESSES', 'XXL_JOB_ACCESS_TOKEN');
  if (['anime', 'search'].includes(name)) required.push('SPRING_RABBITMQ_HOST', 'SPRING_RABBITMQ_USERNAME', 'SPRING_RABBITMQ_PASSWORD');
  if (name === 'anime') required.push('REDIS_HOST', 'REDIS_PASSWORD');
  if (['search', 'ai_chat'].includes(name)) required.push('ES_HOST');
  for (const key of required) if (!env[key]?.trim() || /^(replace|changeme|example)/i.test(env[key])) throw new Error(`Missing controlled configuration: ${key}`);
  if (name !== 'admin_server' && (env.NACOS_NAMESPACE !== namespace || ['public', 'default', ''].includes(namespace))) throw new Error('Nacos namespace mismatch');
  if (env.SPRING_PROFILES_ACTIVE?.split(',').includes('local')) throw new Error('Local profile forbidden');
  return env;
}

export function bindConfig(releasePath, planPath) {
  const root = dirname(releasePath);
  const releaseBytes = readFileSync(releasePath);
  const manifest = JSON.parse(releaseBytes);
  if (!manifest.published) throw new Error('Published release required');
  compose(manifest);
  const plan = JSON.parse(readFileSync(planPath));
  for (const key of ['owner', 'target', 'configVersion', 'namespace', 'rollbackManifest', 'backupEvidence', 'migrationReview']) if (typeof plan[key] !== 'string' || !plan[key].trim()) throw new Error(`Deployment plan required: ${key}`);
  const rollbackBytes = readFileSync(resolve(dirname(planPath), plan.rollbackManifest));
  const rollback = JSON.parse(rollbackBytes);
  if (!rollback.published || rollback.commit === manifest.commit) throw new Error('Distinct published rollback release required');
  compose(rollback);
  const evidence = {};
  for (const key of ['backupEvidence', 'migrationReview']) {
    const bytes = readFileSync(resolve(dirname(planPath), plan[key]));
    if (!bytes.length) throw new Error(`Empty evidence: ${key}`);
    evidence[key] = sha256(bytes);
  }
  const configs = {};
  for (const name of services.filter(n => !['client', 'admin'].includes(n))) {
    const bytes = readFileSync(join(root, 'config', `sanye_${name}.env`));
    const env = validateConfig(name, bytes.toString(), plan.namespace);
    configs[`sanye_${name}`] = { sha256: sha256(bytes), keys: Object.keys(env).sort() };
  }
  return { version: 1, commit: manifest.commit, releaseSha256: sha256(releaseBytes), owner: plan.owner, target: plan.target, configVersion: plan.configVersion, namespace: plan.namespace,
    rollbackCommit: rollback.commit, rollbackSha256: sha256(rollbackBytes), evidence, configs,
    evidenceScope: 'Configuration and supplied review artifacts bound; no database restore or migration compatibility inferred' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [release, plan] = process.argv.slice(2);
    if (!release || !plan) throw new Error('Usage: bind-config.mjs <release.json> <deployment-plan.json>');
    const result = bindConfig(resolve(release), resolve(plan));
    writeFileSync(join(dirname(resolve(release)), 'deployment.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('Controlled configuration fingerprints and rollback evidence bound');
  } catch (error) { console.error(error.code ? 'Configuration evidence could not be read or output already exists' : error.message); process.exitCode = 1; }
}
