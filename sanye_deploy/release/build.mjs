import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compose, inventory, pinnedImage, sha256 } from './prepare.mjs';

const output = resolve(process.argv[2] ?? '');
const publish = process.argv[3] === '--push';
if (process.argv.length < 3 || (process.argv[3] && !publish)) throw new Error('Usage: build.mjs <candidate-directory> [--push]');
const candidate = JSON.parse(readFileSync(join(output, 'candidate.json')));
const manifest = { ...candidate, workflowRun: process.env.GITHUB_RUN_ID ?? null, published: publish };
for (const [key, service] of Object.entries(candidate.services)) {
  const context = join(output, key.slice('sanye_'.length));
  if (JSON.stringify(inventory(context)) !== JSON.stringify(service.inputs)) throw new Error(`Build input changed: ${key}`);
  pinnedImage(service.baseImage);
  const metadata = join(output, `${key}.build.json`);
  execFileSync('docker', ['buildx', 'build', '--platform', candidate.platform, '--provenance=mode=min',
    '--build-arg', `BASE_IMAGE=${service.baseImage}`, '--label', `org.opencontainers.image.revision=${candidate.commit}`,
    '--tag', service.tag, '--metadata-file', metadata, publish ? '--push' : '--load', context], { stdio: 'inherit', timeout: 1800000 });
  const result = JSON.parse(readFileSync(metadata));
  const digest = result['containerimage.digest'];
  const image = pinnedImage(`${service.tag.split(':').slice(0, -1).join(':')}@${digest}`);
  manifest.services[key] = { ...service, image, buildMetadataSha256: sha256(readFileSync(metadata)) };
}
writeFileSync(join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
// Local image IDs are not registry pull references; deployment files are produced only after push.
if (publish) writeFileSync(join(output, 'compose.json'), JSON.stringify(compose(manifest), null, 2) + '\n', { flag: 'wx' });
console.log(publish ? 'Published digest manifest created' : 'Local build complete; not deployable until published');
