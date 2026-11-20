export const FEISHU_TABLES = {
  main: { id: 'tblVAbOa4tpLtr8E', name: '总表' },
  cc: { id: 'tblLuQvjEpaaKiHa', name: 'CC 表' },
} as const

export type FeishuRecord = {
  record_id?: string
  fields: Record<string, unknown>
}

export async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = (await res.json()) as { code?: number; msg?: string; tenant_access_token?: string }
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`feishu token failed: ${data.msg || data.code || res.status}`)
  }
  return data.tenant_access_token
}

export async function fetchAllRecords(
  appToken: string,
  tableId: string,
  token: string,
): Promise<FeishuRecord[]> {
  const items: FeishuRecord[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined
  for (let page = 0; page < 200; page++) {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    )
    url.searchParams.set('page_size', '500')
    if (pageToken) url.searchParams.set('page_token', pageToken)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await res.json()) as {
      code?: number
      msg?: string
      data?: { items?: FeishuRecord[]; page_token?: string; has_more?: boolean }
    }
    if (body.code !== 0) {
      throw new Error(`feishu records ${tableId}: ${body.msg || body.code}`)
    }
    for (const it of body.data?.items || []) {
      const id = it.record_id || `${items.length}`
      if (seen.has(id)) continue
      seen.add(id)
      items.push({ record_id: it.record_id, fields: it.fields || {} })
    }
    pageToken = body.data?.page_token
    if (!pageToken || body.data?.has_more === false) break
  }
  return items
}
