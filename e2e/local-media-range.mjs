import { open, stat } from 'node:fs/promises'

export function selectByteRange(header, size) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return false
  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = suffix ? size - 1 : match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && end < size
    ? { start, end } : false
}

export async function fulfillLocalMedia(route, file) {
  const size = (await stat(file)).size
  const headers = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  const range = selectByteRange(route.request().headers().range, size)
  if (range === false) {
    await route.fulfill({ status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` }, body: '' })
  } else if (!range) {
    await route.fulfill({ path: file, contentType: 'video/mp4', headers })
  } else {
    const length = range.end - range.start + 1
    const bytes = Buffer.allocUnsafe(length)
    const handle = await open(file, 'r')
    try {
      let offset = 0
      while (offset < length) {
        const { bytesRead } = await handle.read(bytes, offset, length - offset, range.start + offset)
        if (!bytesRead) throw new Error('Short media read')
        offset += bytesRead
      }
    } finally { await handle.close() }
    await route.fulfill({ status: 206, contentType: 'video/mp4', body: bytes,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(length) } })
  }
}
