import { spawn, spawnSync } from 'node:child_process'
import { readFile, lstat, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const maxBytes = 64 * 1024 * 1024
const maxArchiveBytes = 256 * 1024 * 1024
const zipReader = `import java.nio.file.*; import java.util.*; import java.util.zip.*;
class SanyeZipAudit {
  public static void main(String[] args) throws Exception {
    try (var zip = new ZipFile(args[0])) {
      var entries = zip.entries(); long total = 0;
      while (entries.hasMoreElements()) {
        var entry = entries.nextElement(); if (entry.isDirectory()) continue;
        String name = entry.getName();
        String encoded = Base64.getEncoder().encodeToString(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        boolean dependency = name.startsWith("BOOT-INF/lib/") || name.startsWith("WEB-INF/lib/");
        boolean own = name.matches("(?:BOOT-INF|WEB-INF)/lib/sanye[-_].*\\\\.jar");
        if (args[1].equals("first-party") && dependency && !own) { System.out.print("S\\t" + encoded + "\\t0\\n"); continue; }
        try (var input = zip.getInputStream(entry)) {
          byte[] data = input.readNBytes(67108865); total += data.length;
          if (data.length > 67108864 || total > 536870912) throw new Exception("archive-limit");
          System.out.print("E\\t" + encoded + "\\t" + data.length + "\\n"); System.out.write(data); System.out.flush();
        }
      }
    }
  }
}`
const excluded = /(?:^|\/)(?:node_modules|\.git|target|dist|build|coverage|\.local)(?:\/|$)/
const archive = /\.(?:jar|war|zip)$/i
const placeholder = /^(?:\$\{[^}:]+\}|\$(?:env:)?[A-Z_][A-Z_0-9]*|<[^>]+>|\*+|x{3,}|REDACTED|replace[-_ ].*|change[-_ ]?me.*|your[-_ ].*|example[-_ ].*|test[-_ ].*|dummy[-_ ].*|local[-_ ].*|sanye[-_]local.*)$/i

function command(program, args, cwd, limit = maxBytes) {
  const result = spawnSync(program, args, { cwd, encoding: null, maxBuffer: limit, windowsHide: true })
  if (result.error || result.status !== 0) throw new Error('command-failed')
  return result.stdout
}

export function scanText(text, location, scope = 'worktree') {
  const findings = []
  const add = (rule, line, value) => {
    const category = placeholder.test(value) || /^\$\{[^}:]+:\s*\}$/.test(value) ? 'example-or-reference' : 'potential-secret'
    findings.push({ scope, location, line, rule, category })
  }
  text.split(/\r?\n/).forEach((line, index) => {
    const scannedFallbacks = new Set()
    const assignment = /(?:["']?)([\w.-]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)[\w.-]*)(?:["']?)\s*[:=]\s*(?:["']([^"'\r\n]*)["']|([^\s,;#]+))/ig
    for (const match of line.matchAll(assignment)) {
      if (line.slice(Math.max(0, match.index - 2), match.index) === '${') continue
      let value = (match[2] ?? match[3]).trim()
      if (!value || /^(?:null|undefined|false|true|String|boolean|number|\{|\[)$/i.test(value)) continue
      if (match[3] && /\.(?:java|[cm]?js|ts|vue|ps1)(?:$|!)/i.test(location) && /^[A-Za-z_$][\w$]*(?:[.?([]|$)/.test(value)) continue
      if (match[3] && /^(?:process\.|System\.|[\w.]+\(|[\w.]+\.(?:value|get|env)|[\w]+[;,)]$)/.test(value)) continue
      const fallback = value.match(/^\$\{[^}:]+:-?(.*)\}$/)
      if (fallback && fallback[1]) { value = fallback[1]; scannedFallbacks.add(value) }
      add('sensitive-assignment', index + 1, value)
    }
    for (const match of line.matchAll(/<(password|passwd|secret|api[-_]?key|access[-_]?key|private[-_]?key)\s*>\s*([^<]+)\s*<\/\1>/ig)) add('sensitive-xml-element', index + 1, match[2].trim())
    for (const match of line.matchAll(/\$\{[\w.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)[\w.-]*:-?([^}]+)\}/ig)) {
      if (!scannedFallbacks.has(match[1])) add('sensitive-environment-fallback', index + 1, match[1])
    }
    for (const match of line.matchAll(/\b(?:https?|postgres(?:ql)?|mysql|redis|amqps?):\/\/([^\s/:@]+):([^\s/@]+)@/g)) add('credential-url', index + 1, match[2])
    for (const match of line.matchAll(/\b(?:AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9_-]{24,})\b/g)) add('provider-token', index + 1, match[0])
    if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(line)) add('private-key', index + 1, 'private-key')
  })
  return findings
}

async function historyBlobs(root, onBlob) {
  const objects = command('git', ['rev-list', '--objects', '--all'], root).toString('utf8').trim().split('\n').filter(Boolean)
  if (!objects.length) return
  const child = spawn('git', ['cat-file', '--batch'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  const finished = new Promise((resolve, reject) => {
    child.on('error', () => reject(new Error('history-read-failed')))
    child.on('close', code => code === 0 ? resolve() : reject(new Error('history-read-failed')))
  })
  finished.catch(() => {})
  child.stdin.on('error', () => {})
  child.stdin.end(objects.map(item => item.split(' ')[0]).join('\n') + '\n')
  let buffer = Buffer.alloc(0), cursor = 0, header = null
  try {
    for await (const chunk of child.stdout) {
      buffer = Buffer.concat([buffer, chunk])
      while (true) {
        if (!header) {
          const newline = buffer.indexOf(10)
          if (newline < 0) break
          const fields = buffer.subarray(0, newline).toString('ascii').split(' ')
          if (fields.length !== 3 || !/^\d+$/.test(fields[2])) throw new Error('history-protocol-error')
          header = { id: fields[0], type: fields[1], size: Number(fields[2]) }
          if (header.size > maxBytes) throw new Error('history-object-too-large')
          buffer = buffer.subarray(newline + 1)
        }
        if (buffer.length < header.size + 1) break
        const object = objects[cursor++]
        if (header.type === 'blob') await onBlob(buffer.subarray(0, header.size), `${header.id}:${object.slice(object.indexOf(' ') + 1)}`)
        buffer = buffer.subarray(header.size + 1)
        header = null
      }
    }
    await finished
    if (cursor !== objects.length || buffer.length || header) throw new Error('history-incomplete')
  } catch (error) {
    child.kill()
    await finished.catch(() => {})
    throw error
  }
}

export async function audit({ root = process.cwd(), history = false, logs = [], artifacts = [], artifactMode = 'full' } = {}) {
  if (!['full', 'first-party'].includes(artifactMode)) throw new Error('invalid-artifact-mode')
  const report = { version: 2, engine: 'bounded-pattern-audit', limitations: ['Pattern rules cannot establish credential validity or detect every secret.', 'History covers all locally reachable refs; fetch remote refs before a release audit.', 'ZIP/JAR/WAR entries require Java 21; encrypted, unreadable, oversized or unsupported archives fail closed.', 'First-party artifact mode excludes non-sanye dependency JARs under BOOT-INF/lib and WEB-INF/lib; it is not a full-package audit.'], coverage: { history, logs, artifacts, artifactMode, excludedArchiveEntries: [] }, scanned: { worktree: 0, history: 0, log: 0, artifact: 0 }, findings: [], errors: [] }
  const temporary = await mkdtemp(path.join(tmpdir(), 'sanye-secret-audit-'))
  const readerPath = path.join(temporary, 'SanyeZipAudit.java')
  await writeFile(readerPath, zipReader)
  let archiveIndex = 0, expandedBytes = 0
  async function inspect(buffer, location, scope, depth = 0) {
    if (buffer.length > (archive.test(location) ? maxArchiveBytes : maxBytes)) throw new Error('file-too-large')
    if (archive.test(location)) {
      if (depth >= 8) throw new Error('archive-depth-limit')
      const archivePath = path.join(temporary, `${archiveIndex++}.zip`)
      await writeFile(archivePath, buffer)
      const output = command('java', [readerPath, archivePath, scope === 'artifact' ? artifactMode : 'full'], root, 513 * 1024 * 1024)
      let cursor = 0
      while (cursor < output.length) {
        const end = output.indexOf(10, cursor)
        if (end < 0) throw new Error('archive-protocol-error')
        const [kind, encoded, sizeText] = output.subarray(cursor, end).toString('utf8').split('\t')
        if (!['E', 'S'].includes(kind) || !/^\d+$/.test(sizeText)) throw new Error('archive-protocol-error')
        const name = Buffer.from(encoded, 'base64').toString('utf8'), size = Number(sizeText)
        cursor = end + 1
        if (kind === 'S') { report.coverage.excludedArchiveEntries.push(`${location}!/${name}`); continue }
        if (cursor + size > output.length) throw new Error('archive-protocol-error')
        const content = output.subarray(cursor, cursor + size)
        cursor += size
        expandedBytes += content.length
        if (expandedBytes > 512 * 1024 * 1024) throw new Error('archive-expansion-limit')
        await inspect(content, `${location}!/${name}`, scope, depth + 1)
      }
    } else {
      report.scanned[scope]++
      report.findings.push(...scanText(buffer.toString('utf8'), location, scope))
    }
  }
  async function inspectPath(filename, scope) {
    try {
      const info = await lstat(filename)
      if (info.isSymbolicLink()) throw new Error('symbolic-link-input')
      if (info.isDirectory()) {
        for (const entry of await readdir(filename)) await inspectPath(path.join(filename, entry), scope)
      } else {
        if (info.size > (archive.test(filename) ? maxArchiveBytes : maxBytes)) throw new Error('file-too-large')
        await inspect(await readFile(filename), path.relative(root, filename).replaceAll('\\', '/'), scope)
      }
    } catch { report.errors.push({ scope, location: path.relative(root, filename).replaceAll('\\', '/'), rule: 'unreadable-or-unsupported-input' }) }
  }
  try {
    try {
      const files = command('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root).toString('utf8').split('\0').filter(Boolean)
      for (const file of new Set(files)) if (!excluded.test(file)) await inspectPath(path.resolve(root, file), 'worktree')
    } catch { report.errors.push({ scope: 'worktree', rule: 'enumeration-failed' }) }
    if (history) {
      try { await historyBlobs(root, (data, location) => inspect(data, location, 'history')) }
      catch { report.errors.push({ scope: 'history', rule: 'history-incomplete' }) }
    }
    for (const file of logs) await inspectPath(path.resolve(root, file), 'log')
    for (const file of artifacts) await inspectPath(path.resolve(root, file), 'artifact')
  } finally { await rm(temporary, { recursive: true, force: true }) }
  report.passed = report.errors.length === 0 && !report.findings.some(finding => finding.category === 'potential-secret')
  return report
}

async function main() {
  const options = { root: process.cwd(), history: false, logs: [], artifacts: [] }
  let output
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--history') options.history = true
    else if (args[i] === '--artifact-mode' && args[i + 1]) options.artifactMode = args[++i]
    else if (['--root', '--log', '--artifact', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const option = args[i], value = args[++i]
      if (option === '--root') options.root = path.resolve(value)
      else if (option === '--output') output = path.resolve(value)
      else options[option === '--log' ? 'logs' : 'artifacts'].push(value)
    } else throw new Error('invalid-arguments')
  }
  const report = await audit(options)
  const json = JSON.stringify(report, null, 2) + '\n'
  if (output) await writeFile(output, json)
  process.stdout.write(json)
  process.exitCode = report.passed ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write('Sensitive configuration audit failed; details withheld to prevent disclosure.\n'); process.exitCode = 2 })
}
