const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')

test('clearing the fragment cache does not retain a request still in flight', async () => {
  const { createFragmentCache } = await import(pathToFileURL(path.resolve(__dirname, '../sanye_client/src/video/hlsFragmentCache.ts')))
  const pending = []
  class NetworkLoader {
    constructor() { this.stats = { aborted: false, loading: { start: 1, first: 1, end: 2 } } }
    load(context, _config, callbacks) { this.context = context; pending.push(() => callbacks.onSuccess({ url: context.url, data: new Uint8Array([7]).buffer, code: 200 }, this.stats, context, null)) }
    abort() { this.stats.aborted = true }
    destroy() {}
  }
  const { Loader, clear } = createFragmentCache({ DefaultConfig: { loader: NetworkLoader } }, () => true)
  const load = () => new Promise(resolve => new Loader().load({ url: 'https://example.com/part.ts', responseType: 'arraybuffer' }, {}, { onSuccess: resolve }))
  const first = load()
  assert.equal(pending.length, 1)
  clear()
  pending.shift()()
  await first
  const second = load()
  assert.equal(pending.length, 1, 'the next load must request the network after clear')
  pending.shift()()
  await second
  const third = load()
  assert.equal(pending.length, 0, 'a request started after clear can populate the cache')
  await third
})
