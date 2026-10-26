import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const composeFile = fileURLToPath(new URL('./compose.yaml', import.meta.url));
const defaultPorts = {
  POSTGRES_HOST_PORT: '15432', REDIS_HOST_PORT: '16379', RABBITMQ_HOST_PORT: '15672',
  KIBANA_HOST_PORT: '5601', MINIO_HOST_PORT: '9001',
};

function composeConfig(overrides = {}) {
  return JSON.parse(execFileSync('docker', ['compose', '-f', composeFile, '--profile', '*', 'config', '--format', 'json'], {
    encoding: 'utf8', env: { ...process.env, ...defaultPorts, ...overrides }, stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

test('所有本地端口绑定回环地址并保留原有端口映射', () => {
  const config = composeConfig();
  const expected = {
    postgres: ['15432:5432'], redis: ['16379:6379'], rabbitmq: ['5672:5672', '15672:15672'],
    elasticsearch: ['9200:9200'], kibana: ['5601:5601'], minio: ['9001:9001'],
    nacos: ['8080:8080'], sentinel: ['8858:8858'], 'xxl-job-admin': ['18080:8080'],
  };
  for (const [service, definition] of Object.entries(config.services)) {
    for (const port of definition.ports ?? []) assert.equal(port.host_ip, '127.0.0.1', service);
  }
  for (const [service, ports] of Object.entries(expected)) {
    assert.deepEqual(config.services[service].ports.map(port => `${port.published}:${port.target}`).sort(), ports.sort(), service);
  }
  assert.equal(config.services.postgres.volumes[0].target, '/var/lib/postgresql/data');
});

test('自定义宿主机端口仍然生效且保持回环绑定', () => {
  const config = composeConfig({ POSTGRES_HOST_PORT: '25432', REDIS_HOST_PORT: '26379' });
  assert.equal(config.services.postgres.ports[0].published, '25432');
  assert.equal(config.services.redis.ports[0].published, '26379');
  assert.equal(config.services.postgres.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services.redis.ports[0].host_ip, '127.0.0.1');
});

test('Postgres 探活使用容器凭据通过 TCP 执行 SELECT 1', () => {
  const probe = composeConfig().services.postgres.healthcheck.test;
  assert.equal(probe[0], 'CMD-SHELL');
  assert.match(probe[1], /PGPASSWORD="\$\$POSTGRES_PASSWORD" psql -h 127\.0\.0\.1/);
  assert.match(probe[1], /-U "\$\$POSTGRES_USER" -d "\$\$POSTGRES_DB"/);
  assert.match(probe[1], /-w -v ON_ERROR_STOP=1 -tAc 'SELECT 1' \| grep -qx 1$/);
  assert.doesNotMatch(probe[1], /pg_isready/);
});
