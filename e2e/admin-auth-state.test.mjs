import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(new URL('../sanye_admin/package.json', import.meta.url))
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')
const source = readFileSync(new URL('../sanye_admin/src/stores/auth.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

function setup() {
  let token = 'old'
  const requests = []
  const adminAuthApi = {
    getInfo: () => new Promise((resolve) => requests.push(resolve)),
    getRouters: async () => ({ data: [{ path: 'content' }] }),
  }
  const session = {
    isLoggedIn: () => !!token,
    getAccessToken: () => token,
    clearSession: () => { token = null },
    setSession: (access) => { token = access },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: (name) => {
    if (name === '@/api/admin') return { adminAuthApi }
    if (name === '@/auth/session') return session
    return require(name)
  } })
  setActivePinia(createPinia())
  return { store: exports.useAuthStore(), requests }
}

function info(id, permissions) {
  return { user: { userId: id, nickName: `user-${id}` }, permissions }
}

test('logout discards an outstanding administrator response', async () => {
  const { store, requests } = setup()
  const pending = store.loadUser()
  store.logout()
  requests[0](info(1, ['*:*:*']))
  await pending
  assert.equal(store.loggedIn, false)
  assert.equal(store.user, null)
  assert.equal(store.permissions.length, 0)
  assert.equal(store.serverRoutes.length, 0)
})

test('account change starts a fresh request and ignores late old permissions', async () => {
  const { store, requests } = setup()
  const old = store.loadUser()
  store.setSession('new', '')
  const current = store.loadUser()
  const duplicate = store.loadUser()
  assert.equal(requests.length, 2)
  requests[1](info(2, ['content:read']))
  await Promise.all([current, duplicate])
  requests[0](info(1, ['*:*:*']))
  await old
  assert.equal(store.user.id, 2)
  assert.equal(store.hasPerm('*:*:*'), false)
  assert.equal(store.hasPerm('content:read'), true)
})
