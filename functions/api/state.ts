interface Env {
  DB: D1Database
}

type StateRow = {
  payload: string
  version: number
  updated_at: string
}

const WORKSPACE = 'default'

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

async function readState(db: D1Database) {
  return db
    .prepare('SELECT payload, version, updated_at FROM workspace_state WHERE id = ?')
    .bind(WORKSPACE)
    .first<StateRow>()
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const row = await readState(ctx.env.DB)
    if (!row) {
      return json({ version: 0, updatedAt: null, data: {} })
    }
    return json({
      version: row.version,
      updatedAt: row.updated_at,
      data: JSON.parse(row.payload),
    })
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'read failed' },
      { status: 500 },
    )
  }
}

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  try {
    const body = (await ctx.request.json()) as {
      data?: unknown
      baseVersion?: number
    }
    if (!body || typeof body.data !== 'object' || body.data === null) {
      return json({ error: 'invalid body' }, { status: 400 })
    }

    const current = await readState(ctx.env.DB)
    const currentVersion = current?.version || 0
    if (
      typeof body.baseVersion === 'number' &&
      currentVersion > 0 &&
      body.baseVersion < currentVersion
    ) {
      return json(
        {
          error: 'conflict',
          version: currentVersion,
          updatedAt: current!.updated_at,
          data: JSON.parse(current!.payload),
        },
        { status: 409 },
      )
    }

    const nextVersion = currentVersion + 1
    const updatedAt = new Date().toISOString()
    const payload = JSON.stringify(body.data)

    await ctx.env.DB.prepare(
      `INSERT INTO workspace_state (id, payload, updated_at, version)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         version = excluded.version`,
    )
      .bind(WORKSPACE, payload, updatedAt, nextVersion)
      .run()

    return json({ version: nextVersion, updatedAt })
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 },
    )
  }
}
