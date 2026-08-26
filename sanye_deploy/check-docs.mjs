import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const failures = []
const passed = []

// 记录检查结果，统一输出可以定位的失败原因。
function check(name, condition, detail) {
  if (condition) passed.push(name)
  else failures.push(`${name}：${detail}`)
}

// 递归收集 Markdown 文件，跳过依赖、Git 元数据和本地备份产物。
function collectMarkdown(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'backups'].includes(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) collectMarkdown(fullPath, result)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) result.push(fullPath)
  }
  return result
}

// 检查 Markdown 中的相对链接，忽略外部 URL、锚点和邮件地址。
function validateMarkdownLinks(filePath, content) {
  const linkPattern = /!??\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = linkPattern.exec(content)) !== null) {
    let target = match[1].trim().replace(/^<|>$/g, '')
    if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue
    target = target.split('#', 1)[0].split('?', 1)[0]
    const resolved = path.resolve(path.dirname(filePath), target)
    check(`链接 ${path.relative(root, filePath)} -> ${target}`, fs.existsSync(resolved), `目标不存在：${target}`)
  }
}

// 读取相对路径文件，统一使用仓库根目录解析，避免检查脚本受启动目录影响。
function readRepo(relativePath) {
  const filePath = path.join(root, relativePath)
  return { filePath, content: fs.readFileSync(filePath, 'utf8') }
}

const markdownFiles = collectMarkdown(root)
for (const filePath of markdownFiles) {
  validateMarkdownLinks(filePath, fs.readFileSync(filePath, 'utf8'))
}

const docsReadme = readRepo('docs/README.md').content
check('文档地图登记变更规则', docsReadme.includes('[文档变更规则](./document-change-rules.md)'), 'docs/README.md 缺少规则文件链接')
check('文档地图登记桌宠测试报告', docsReadme.includes('[桌宠测试报告](./desktop-companion-test-report.md)'), 'docs/README.md 缺少桌宠测试报告链接')

const factChecks = [
  ['桌宠产品透明边界', 'product/desktop-companion-requirements.md', ['透明', '客户端启动']],
  ['桌宠计划实现阶段', 'docs/desktop-companion-development-plan.md', ['实现阶段', '透明无背景']],
  ['D-026 桌宠启动绑定', 'docs/decision-log.md', ['D-026', '透明无边框', '客户端启动后自动拉起桌宠']],
  ['AI 供应商事实', 'docs/environment-config.md', ['硅基流动', 'Qwen/Qwen2.5-7B-Instruct', 'HTTP 402']],
  ['AI 差距状态', 'docs/gap-register.md', ['硅基流动', 'Qwen/Qwen2.5-7B-Instruct', 'HTTP 402']],
  ['AI 性能报告状态', 'docs/performance-test-report.md', ['硅基流动', 'Qwen/Qwen2.5-7B-Instruct', 'HTTP 402']],
]
for (const [name, relativePath, terms] of factChecks) {
  const content = readRepo(relativePath).content
  check(name, terms.every((term) => content.includes(term)), `缺少事实：${terms.filter((term) => !content.includes(term)).join('、')}`)
}

// 校验当前测试事实源与文档地图、发布评估、追溯矩阵保持一致；历史记录允许保留旧数字，但当前基线不能漂移。
const baselineChecks = [
  ['接口体检当前基线', 'docs/test-report-2026-08-20.md', '接口体检 | 9 个接口板块 | 60 | 0'],
  ['冒烟当前基线', 'docs/test-report-2026-08-20.md', '本地冒烟 | 网关、业务、AI、管理端、监控 | 77 | 0'],
  ['E2E 当前基线', 'docs/test-report-2026-08-20.md', 'Playwright 主链路 | 客户端、官网、管理端关键流程（`e2e/e2e-verify.mjs`） | 32 | 0'],
  ['E2E 全量当前基线', 'docs/test-report-2026-08-20.md', '11 个脚本合计 `548/548`'],
  ['按钮体检当前基线', 'docs/button-test-report.md', '425/425 通过，失败 0'],
  ['文档地图引用按钮基线', 'docs/README.md', '按钮体检报告（425 项）'],
  ['追溯矩阵引用按钮基线', 'docs/traceability-matrix.md', '已完成（按钮体检 425 项）'],
  ['当前网关端口', 'docs/environment-config.md', '统一本机网关为 8091'],
]
for (const [name, relativePath, expected] of baselineChecks) {
  const content = readRepo(relativePath).content
  check(name, content.includes(expected), `${relativePath} 缺少当前基线：${expected}`)
}

// 校验仓库内的可执行入口与文档命令一致，避免文档指向不存在的 workspace script。
const packageJson = JSON.parse(readRepo('package.json').content)
const e2ePackageJson = JSON.parse(readRepo('e2e/package.json').content)
check('根 E2E 验证命令存在', packageJson.scripts?.['e2e:verify'] === 'pnpm --filter @sanye/sanye_e2e test:verify', 'package.json 缺少 e2e:verify 或命令已漂移')
check('根 E2E 全量命令存在', packageJson.scripts?.['e2e:all'] === 'pnpm --filter @sanye/sanye_e2e test:all', 'package.json 缺少 e2e:all 或命令已漂移')
check('E2E 验证脚本存在', e2ePackageJson.scripts?.['test:verify'] === 'node e2e-verify.mjs', 'e2e/package.json 缺少 test:verify')
check('E2E 全量脚本存在', e2ePackageJson.scripts?.['test:all'] === 'node run-all.mjs', 'e2e/package.json 缺少 test:all')

const currentFactFiles = [
  'product/desktop-companion-requirements.md',
  'product/feature-specification.md',
  'docs/desktop-companion-development-plan.md',
  'docs/decision-log.md',
  'docs/development-todo.md',
  'docs/development-tasks.md',
  'docs/gap-register.md',
  'docs/performance-test-report.md',
  'sanye_deploy/benchmark-all.mjs',
]
const staleTerms = ['尚未进入代码阶段', '晚霞流星背景', '晚霞流星场景', '阿里云百炼', 'DashScope', 'qwen-plus']
for (const relativePath of currentFactFiles) {
  const content = readRepo(relativePath).content
  for (const term of staleTerms) {
    check(`当前文档过期表述 ${relativePath}：${term}`, !content.includes(term), `仍包含过期表述：${term}`)
  }
}

console.log(`文档检查完成：通过 ${passed.length} 项，失败 ${failures.length} 项`)
for (const item of failures) console.error(`失败：${item}`)
if (failures.length === 0) console.log('全部文档一致性检查通过。')
if (failures.length > 0) process.exitCode = 1
