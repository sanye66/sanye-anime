const key = 'sanye:android-recent-search:v1'
function scopeKey(scope: string) {
  let hash = 2166136261
  for (let i = 0; i < scope.length; i++) hash = Math.imul(hash ^ scope.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36)
}
function read(): Record<string, string[]> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    if (!value || Array.isArray(value) || typeof value !== 'object') return {}
    return Object.fromEntries(Object.entries(value).slice(-20).filter(([scope, words]) => /^[a-z0-9]{1,7}$/.test(scope) && Array.isArray(words))
      .map(([scope, words]) => [scope, (words as unknown[]).filter((word): word is string => typeof word === 'string' && word.length > 0 && word.length <= 50).slice(0, 8)]))
  } catch { return {} }
}
export function recentSearches(scope: string) { return read()[scopeKey(scope)] || [] }
export function rememberSearch(scope: string, keyword: string) {
  const word = keyword.trim().slice(0, 50)
  if (!word) return recentSearches(scope)
  const all = read(), id = scopeKey(scope)
  const words = [word, ...(all[id] || []).filter(item => item.toLocaleLowerCase() !== word.toLocaleLowerCase())].slice(0, 8)
  delete all[id]; all[id] = words
  try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-20)))) } catch { /* 记忆失败不阻断搜索 */ }
  return words
}
export function clearRecentSearches(scope: string) {
  const all = read(); delete all[scopeKey(scope)]
  try { localStorage.setItem(key, JSON.stringify(all)) } catch { /* 不阻断页面操作 */ }
}
export function removeRecentSearch(scope: string, keyword: string) {
  const all = read(), id = scopeKey(scope)
  const words = (all[id] || []).filter(item => item.toLocaleLowerCase() !== keyword.trim().toLocaleLowerCase())
  if (words.length) all[id] = words
  else delete all[id]
  try { localStorage.setItem(key, JSON.stringify(all)) } catch { /* 不阻断页面操作 */ }
  return words
}
