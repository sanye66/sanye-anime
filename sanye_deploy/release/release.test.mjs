import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { compose, pinnedImage, sourceIdentity, inventory, services, releaseToolchain } from './prepare.mjs';
import { requireCi, requireCandidateCi, workflowRuns } from './check-ci.mjs';
import { checkInstance, checkRegistration } from './verify.mjs';
import { bindConfig, validateConfig } from './bind-config.mjs';
import { checkProtection, requiredChecks } from './check-remote.mjs';

const commit = 'a'.repeat(40);
const imageRef = `ghcr.io/example/sanye_gateway@sha256:${'b'.repeat(64)}`;
test('reject mutable tags and malformed registry digests', () => {
  assert.equal(pinnedImage(imageRef), imageRef);
  for (const value of ['nginx:latest', 'java@sha256:abc', `user:secret@${imageRef}`, undefined]) assert.throws(() => pinnedImage(value), /registry digest/);
});
test('bind source to clean exact commit including untracked files', t => {
  const root = mkdtempSync(join(tmpdir(), 'sanye_release_'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '--quiet']); git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  const head = git(['rev-parse', 'HEAD']);
  assert.equal(sourceIdentity(root, head).commit, head);
  assert.throws(() => sourceIdentity(root, commit), /mismatch/);
  writeFileSync(join(root, 'untracked'), 'changed');
  assert.throws(() => sourceIdentity(root, head), /Clean checkout/);
});
test('input inventory detects changed build bytes', t => {
  const root = mkdtempSync(join(tmpdir(), 'sanye_inputs_'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'app.jar'), 'first'); const first = inventory(root);
  writeFileSync(join(root, 'app.jar'), 'second'); assert.notDeepEqual(inventory(root), first);
});
test('new failed or pending CI cannot reuse old successful run', () => {
  const good = { id: 1, head_sha: commit, head_branch: 'test', event: 'push', status: 'completed', conclusion: 'success', updated_at: new Date().toISOString() };
  assert.equal(requireCi([good], commit, 'test'), 1);
  for (const newer of [{ conclusion: 'failure' }, { status: 'in_progress' }, { conclusion: 'cancelled' }]) assert.throws(() => requireCi([good, { ...good, id: 2, ...newer }], commit, 'test'), /must succeed/);
  assert.throws(() => requireCi([good], 'c'.repeat(40), 'test'), /must succeed/);
  assert.throws(() => requireCi([good], commit, 'release'), /must succeed/);
});
test('release compiler accepts only the exact CI and local patches and records actual versions', () => {
  for (const javac of ['javac 21.0.11', 'javac 21.0.12']) assert.deepEqual(releaseToolchain('v26.5.0', javac), { node: 'v26.5.0', javac });
  for (const javac of ['javac 21', 'javac 21.0.10', 'javac 21.0.13', 'javac 22.0.1', 'javac 21.0.11-ea']) assert.throws(() => releaseToolchain('v26.5.0', javac), /Release requires/);
  assert.throws(() => releaseToolchain('v26.5.1', 'javac 21.0.11'), /Release requires/);
});
test('candidate evidence rejects expired, invalid, missing and newer rerun results', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const good = { id: 1, run_attempt: 1, head_sha: commit, head_branch: 'test', event: 'push', status: 'completed', conclusion: 'success', updated_at: '2026-10-13T10:00:00Z' };
  assert.equal(requireCi([good], commit, 'test', { now }), 1);
  for (const updated_at of [undefined, 'invalid', '2026-10-01T10:00:00Z', '2026-10-14T10:00:00Z']) assert.throws(() => requireCi([{ ...good, updated_at }], commit, 'test', { now }), /expired/);
  assert.throws(() => requireCi([good, { ...good, run_attempt: 2, conclusion: 'failure' }], commit, 'test', { now }), /must succeed/);
  assert.throws(() => requireCi([], commit, 'test', { now, workflow: 'android-check.yml' }), /android-check.yml.*missing/);
  assert.throws(() => requireCi([{ ...good, event: 'pull_request' }], commit, 'test', { now }), /missing/);
  assert.equal(requireCi([{ ...good, event: 'workflow_dispatch' }], commit, 'test', { now, events: ['push', 'workflow_dispatch'] }), 1);
});
test('a complete candidate cannot bypass a missing, failed or stale platform gate', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const good = { id: 1, head_sha: commit, head_branch: 'test', event: 'push', status: 'completed', conclusion: 'success', updated_at: '2026-10-13T10:00:00Z' };
  const evidence = { 'ci.yml': [good], 'android-check.yml': [{ ...good, event: 'workflow_dispatch' }], 'desktop-check.yml': [good] };
  assert.equal(Object.keys(requireCandidateCi(evidence, commit, 'test', { now })).length, 3);
  for (const workflow of ['android-check.yml', 'desktop-check.yml']) {
    for (const runs of [[], [{ ...good, conclusion: 'failure' }], [{ ...good, head_sha: 'b'.repeat(40) }], [{ ...good, updated_at: '2026-10-01T10:00:00Z' }]]) {
      assert.throws(() => requireCandidateCi({ ...evidence, [workflow]: runs }, commit, 'test', { now }));
    }
  }
});

test('CI lookup paginates exact commit and keeps workflow errors readable', async () => {
  const requested = [];
  const runs = await workflowRuns('example/project', 'desktop-check.yml', commit, 'synthetic-token', async url => {
    requested.push(url);
    return { ok: true, json: async () => ({ workflow_runs: url.searchParams.get('page') === '1' ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 101 }] }) };
  });
  assert.equal(runs.length, 101); assert.equal(requested.length, 2);
  assert.equal(requested[1].searchParams.get('head_sha'), commit);
  await assert.rejects(workflowRuns('example/project', 'android-check.yml', commit, 'synthetic-token', async () => ({ ok: false, status: 403 })), /android-check.yml.*HTTP 403/);
});
test('compose requires all digests and keeps data project stable for rollback', () => {
  const manifest = { commit, services: Object.fromEntries(services.map(n => [`sanye_${n}`, { image: imageRef }])) };
  const result = compose(manifest);
  assert.equal(Object.keys(result.services).length, 12);
  assert.equal(result.name, compose({ ...manifest, commit: 'c'.repeat(40) }).name);
  assert.equal(result.services.sanye_gateway.environment.NACOS_ENABLED, 'true');
  assert.equal(result.services.sanye_client.ports[0], '127.0.0.1:18080:8080');
  assert.equal(result.services.sanye_anime.env_file[0], './config/sanye_anime.env');
  manifest.services.sanye_auth.image = 'java:latest'; assert.throws(() => compose(manifest), /registry digest/);
});
test('runtime validates actual image identity and image revision', () => {
  const image = { Id: 'sha256:image', Config: { Labels: { 'org.opencontainers.image.revision': commit } } };
  const container = { Image: image.Id, Config: { Image: imageRef }, State: { Running: true, Health: { Status: 'healthy' } } };
  checkInstance(container, image, { image: imageRef }, commit);
  assert.throws(() => checkInstance({ ...container, Image: 'old' }, image, { image: imageRef }, commit), /digest mismatch/);
  assert.throws(() => checkInstance(container, image, { image: imageRef }, 'c'.repeat(40)), /revision mismatch/);
  assert.throws(() => checkInstance({ ...container, State: { Running: true } }, image, { image: imageRef }, commit), /not healthy/);
});
test('Nacos old, disabled, wrong-IP or duplicate registrations are rejected', () => {
  const host = { enabled: true, healthy: true, port: 8080, ip: '10.0.0.2', metadata: { 'release.commit': commit } };
  checkRegistration([host], commit, ['10.0.0.2']);
  for (const hosts of [[], [host, host], [{ ...host, enabled: false }], [{ ...host, healthy: false }], [{ ...host, ip: '10.0.0.3' }], [{ ...host, metadata: { 'release.commit': 'old' } }]]) assert.throws(() => checkRegistration(hosts, commit, ['10.0.0.2']), /one healthy/);
});
test('configuration refuses missing values, wrong namespace and interpolation', () => {
  const config = 'NACOS_SERVER_ADDR=nacos.internal:8848\nNACOS_NAMESPACE=sanye_test_fixture\nNACOS_USERNAME=operator\nNACOS_PASSWORD=synthetic-long-value\nAUTH_TOKEN_SECRET=synthetic-signing-value\n';
  validateConfig('gateway', config, 'sanye_test_fixture');
  assert.throws(() => validateConfig('gateway', config, 'public'), /namespace mismatch/);
  assert.throws(() => validateConfig('gateway', config.replace('AUTH_TOKEN_SECRET=', 'OTHER='), 'sanye_test_fixture'), /AUTH_TOKEN_SECRET/);
  assert.throws(() => validateConfig('gateway', config + 'UNSAFE=$OTHER\n', 'sanye_test_fixture'), /interpolation/);
});
test('branch protection requires all gates, strict updates and administrator enforcement', () => {
  const protection = { required_status_checks: { contexts: requiredChecks, strict: true }, enforce_admins: { enabled: true } };
  assert.equal(checkProtection(protection), true);
  assert.equal(checkProtection({ ...protection, enforce_admins: { enabled: false } }), false);
  assert.equal(checkProtection({ ...protection, required_status_checks: { contexts: requiredChecks.slice(1), strict: true } }), false);
  assert.equal(checkProtection({ ...protection, required_status_checks: { contexts: requiredChecks, strict: false } }), false);
});
test('binds configuration and rollback artifact hashes without exposing values', t => {
  const root = mkdtempSync(join(tmpdir(), 'sanye_binding_'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = { published: true, commit, services: Object.fromEntries(services.map(n => [`sanye_${n}`, { image: imageRef }])) };
  writeFileSync(join(root, 'release.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'rollback.json'), JSON.stringify({ ...manifest, commit: 'c'.repeat(40) }));
  writeFileSync(join(root, 'backup.json'), '{"fixture":true}');
  writeFileSync(join(root, 'review.md'), 'Synthetic review evidence');
  writeFileSync(join(root, 'plan.json'), JSON.stringify({ owner: 'fixture', target: 'isolated-fixture', configVersion: 'v1', namespace: 'sanye_test_fixture', rollbackManifest: 'rollback.json', backupEvidence: 'backup.json', migrationReview: 'review.md' }));
  mkdirSync(join(root, 'config'));
  const keys = ['NACOS_SERVER_ADDR', 'NACOS_USERNAME', 'NACOS_PASSWORD', 'DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'AUTH_TOKEN_SECRET', 'SANYE_MANAGE_TOKEN', 'SANYE_INTERNAL_CALL_TOKEN', 'XXL_JOB_ADMIN_ADDRESSES', 'XXL_JOB_ACCESS_TOKEN', 'SPRING_RABBITMQ_HOST', 'SPRING_RABBITMQ_USERNAME', 'SPRING_RABBITMQ_PASSWORD', 'REDIS_HOST', 'REDIS_PASSWORD', 'ES_HOST', 'SANYE_ADMIN_DATASOURCE_URL', 'SANYE_ADMIN_DATASOURCE_USERNAME', 'SANYE_ADMIN_DATASOURCE_PASSWORD', 'SANYE_ADMIN_REDIS_HOST', 'SANYE_ADMIN_REDIS_PASSWORD', 'SANYE_ADMIN_TOKEN_SECRET'];
  const text = 'NACOS_NAMESPACE=sanye_test_fixture\n' + keys.map(key => `${key}=synthetic-private-configuration`).join('\n');
  for (const name of services.filter(n => !['client', 'admin'].includes(n))) writeFileSync(join(root, 'config', `sanye_${name}.env`), text);
  const result = bindConfig(join(root, 'release.json'), join(root, 'plan.json'));
  assert.equal(Object.keys(result.configs).length, 10);
  assert.ok(!JSON.stringify(result).includes('synthetic-private-configuration'));
  writeFileSync(join(root, 'rollback.json'), JSON.stringify(manifest));
  assert.throws(() => bindConfig(join(root, 'release.json'), join(root, 'plan.json')), /Distinct published rollback/);
});
