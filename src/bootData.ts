const CACHE = 'vc-static-v1'

async function openCache() {
  try {
    return await caches.open(CACHE)
  } catch {
    return null
  }
}

/** stale-while-revalidate：有缓存先返回，后台更新 */
export async function fetchJsonCached<T>(url: string): Promise<T> {
  const cache = await openCache()
  const cached = cache ? await cache.match(url) : undefined
  const network = fetch(url)
    .then(async (res) => {
      if (res.ok && cache) {
        try {
          await cache.put(url, res.clone())
        } catch {
          /* quota / opaque */
        }
      }
      return res
    })
    .catch((e) => {
      if (cached) return cached
      throw e
    })

  if (cached) {
    void network
    return (await cached.json()) as T
  }
  const res = await network
  if (!res.ok) throw new Error(`加载失败 ${url} (${res.status})`)
  return (await res.json()) as T
}

export async function fetchJsonOptional<T>(url: string): Promise<T | null> {
  try {
    return await fetchJsonCached<T>(url)
  } catch {
    return null
  }
}
