import { buildCatalogFromFeishuRows } from '../lib/buildCatalog'
import { FEISHU_TABLES, fetchAllRecords, getTenantToken } from '../lib/feishu'

interface Env {
  DB: D1Database
  FEISHU_APP_ID?: string
  FEISHU_APP_SECRET?: string
  FEISHU_BITABLE_APP_TOKEN?: string
  SYNC_SECRET?: string
}

const CATALOG_ID = 'default'
const DEFAULT_APP_TOKEN = 'WmJebv7lna42Tgs3aPqcJWqMn4e'

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

/** Cron must send SYNC_SECRET. Browser「立即同步」可不带密钥。带了错误密钥则拒绝。 */
function authorized(req: Request, env: Env): boolean {
  const secret = (env.SYNC_SECRET || '').trim()
  const header = (req.headers.get('x-sync-secret') || '').trim()
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const provided = header || bearer
  if (provided) return Boolean(secret) && provided === secret
  // 站点内手动同步：无 Header 时放行（与 /api/state 同为内网工具用法）
  return true
}

async function runSync(env: Env) {
  const appId = (env.FEISHU_APP_ID || '').trim()
  const appSecret = (env.FEISHU_APP_SECRET || '').trim()
  const appToken = (env.FEISHU_BITABLE_APP_TOKEN || DEFAULT_APP_TOKEN).trim()
  if (!appId || !appSecret) {
    throw new Error('missing FEISHU_APP_ID / FEISHU_APP_SECRET')
  }

  const token = await getTenantToken(appId, appSecret)
  const [mainRows, ccRows] = await Promise.all([
    fetchAllRecords(appToken, FEISHU_TABLES.main.id, token),
    fetchAllRecords(appToken, FEISHU_TABLES.cc.id, token),
  ])

  const catalog = buildCatalogFromFeishuRows({
    mainRows,
    ccRows,
    sourceLabel: `feishu ${appToken} · 总表+CC表`,
  })

  await env.DB.prepare(
    `INSERT INTO catalog_state (id, payload, synced_at, source)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       synced_at = excluded.synced_at,
       source = excluded.source`,
  )
    .bind(CATALOG_ID, JSON.stringify(catalog), catalog.syncedAt, 'feishu')
    .run()

  return {
    ok: true,
    syncedAt: catalog.syncedAt,
    companies: catalog.companies.length,
    events: catalog.companies.reduce((n, c) => n + c.events.length, 0),
    cc: catalog.companies.filter((c) => c.cc).length,
    mainRecords: mainRows.length,
    ccRecords: ccRows.length,
  }
}

async function handle(ctx: EventContext<Env, any, Record<string, unknown>>) {
  try {
    if (!authorized(ctx.request, ctx.env)) {
      return json({ error: 'unauthorized' }, { status: 401 })
    }
    const result = await runSync(ctx.env)
    return json(result)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'sync failed' }, { status: 500 })
  }
}

export const onRequestPost: PagesFunction<Env> = handle
export const onRequestGet: PagesFunction<Env> = handle
