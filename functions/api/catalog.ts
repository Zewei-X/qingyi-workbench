interface Env {
  DB: D1Database
}

const CATALOG_ID = 'default'

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  })
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const row = await ctx.env.DB.prepare(
      'SELECT payload, synced_at, source FROM catalog_state WHERE id = ?',
    )
      .bind(CATALOG_ID)
      .first<{ payload: string; synced_at: string; source: string }>()

    if (!row) {
      return new Response(null, { status: 204 })
    }

    const data = JSON.parse(row.payload) as Record<string, unknown>
    return json({
      ...data,
      syncedAt: row.synced_at,
      source: row.source,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'read failed' }, { status: 500 })
  }
}
