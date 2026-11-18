/** FA 机构活跃度榜：括号内为今年成交数量，顺序即排名 */
export const FA_ORG_RANK: { name: string; deals: number }[] = [
  { name: '多维资本', deals: 77 },
  { name: '光源资本', deals: 52 },
  { name: '凯乘资本', deals: 50 },
  { name: '一苇资本', deals: 50 },
  { name: '义柏资本', deals: 47 },
  { name: '高鹄资本', deals: 45 },
  { name: '庚辛资本', deals: 38 },
  { name: '云岫资本', deals: 36 },
  { name: '华兴资本', deals: 34 },
  { name: '投中资本', deals: 32 },
  { name: 'IO资本', deals: 32 },
  { name: '鞍羽资本', deals: 26 },
  { name: '领甪资本', deals: 23 },
  { name: '告捷资本', deals: 23 },
  { name: '深渡资本', deals: 21 },
  { name: '翊荣资本', deals: 19 },
  { name: '浪潮资本', deals: 19 },
  { name: '心流资本', deals: 19 },
  { name: '枫承资本', deals: 19 },
  { name: '向阳资本', deals: 18 },
  { name: '泰合资本', deals: 15 },
  { name: '势能资本', deals: 15 },
  { name: '云道资本', deals: 15 },
  { name: '跃为资本', deals: 14 },
  { name: '万创投行', deals: 14 },
  { name: '深蓝资本', deals: 13 },
  { name: '值观资本', deals: 13 },
  { name: '星涵资本', deals: 12 },
  { name: '指数资本', deals: 12 },
  { name: '浩悦资本', deals: 11 },
  { name: '启观资本', deals: 11 },
  { name: '启峰资本', deals: 11 },
  { name: '光澜资本', deals: 11 },
  { name: '大璞资本', deals: 10 },
  { name: '后浪资本', deals: 10 },
  { name: '点石资本', deals: 9 },
  { name: '拓界资本', deals: 9 },
  { name: '德太资本', deals: 9 },
  { name: '华势资本', deals: 9 },
  { name: '九云资本', deals: 9 },
  { name: '熙桥资本', deals: 8 },
  { name: '浩观资本', deals: 8 },
  { name: '易凯资本', deals: 8 },
  { name: '源合资本', deals: 7 },
  { name: '日新资本', deals: 7 },
  { name: '火树资本', deals: 6 },
  { name: '度越资本', deals: 6 },
  { name: '中岚科创', deals: 6 },
  { name: '毅仁资本', deals: 5 },
  { name: '星桥资本', deals: 5 },
  { name: '川依资本', deals: 5 },
  { name: '凌霄资本', deals: 5 },
  { name: '兴棠资本', deals: 5 },
  { name: '云悦资本', deals: 5 },
  { name: '丰和资本', deals: 5 },
  { name: '势乘资本', deals: 5 },
  { name: '黎曼猜想', deals: 4 },
  { name: '质变资本', deals: 4 },
  { name: '见灼资本', deals: 4 },
  { name: '盛德资本', deals: 4 },
  { name: '热金资本', deals: 4 },
  { name: '时来资本', deals: 4 },
  { name: '探奇资本', deals: 4 },
  { name: '循光资本', deals: 4 },
  { name: '唯快资本', deals: 4 },
  { name: '雷达资本', deals: 3 },
  { name: '航行资本', deals: 3 },
  { name: '至信资本', deals: 3 },
  { name: '源杉资本', deals: 3 },
  { name: '源投资本', deals: 3 },
  { name: '清科资本', deals: 3 },
  { name: '星辰资本', deals: 3 },
  { name: '星涟资本', deals: 3 },
  { name: '明德资本', deals: 3 },
  { name: '探针资本', deals: 3 },
  { name: '慕石资本', deals: 3 },
  { name: '悦泽资本', deals: 3 },
  { name: '悦丰资本', deals: 3 },
  { name: '志云资本', deals: 3 },
  { name: '大桉资本', deals: 3 },
  { name: '华君资本', deals: 3 },
  { name: '华兴证券', deals: 3 },
  { name: '悟凡资本', deals: 3 },
  { name: 'Blacksheep Technology', deals: 3 },
  { name: '长海资本', deals: 2 },
  { name: '远识资本', deals: 2 },
  { name: '赋伟咨询', deals: 2 },
  { name: '谦恒资本', deals: 2 },
  { name: '见信资本', deals: 2 },
  { name: '蓝桥资本', deals: 2 },
  { name: '苍竹资本', deals: 2 },
  { name: '芯湃资本', deals: 2 },
  { name: '舟渡资本', deals: 2 },
  { name: '羿山资本', deals: 2 },
  { name: '澜松资本', deals: 2 },
  { name: '源流资本', deals: 2 },
  { name: '源式资本', deals: 2 },
  { name: '涵宇资本', deals: 2 },
  { name: '治臻咨询', deals: 2 },
  { name: '毅成资本', deals: 2 },
]

/** 榜单名 → 通讯录里常见写法 */
const ALIASES: Record<string, string[]> = {
  光源资本: ['光源', '光源资本'],
  华兴资本: ['华兴', '华兴资本'],
  浪潮资本: ['浪潮', '浪潮FA', '浪潮资本'],
  向阳资本: ['向阳FA', '向阳', '向阳资本'],
  跃为资本: ['跃为', '跃为 / 铅笔道', '跃为资本'],
  后浪资本: ['后浪资本', '后浪资本 / 创享投资'],
  指数资本: ['指数', '指数资本'],
  慕石资本: ['慕石资本', '慕石资本 / 光本位FA'],
  鞍羽资本: ['鞍羽资本', '鞭羽资本'],
  华君资本: ['华君资本', '华君出海资本'],
  星辰资本: ['星辰资本', '星辰资本FA'],
  万创投行: ['万创投行'],
  多维资本: ['多维资本'],
}

function norm(s: string) {
  return s
    .replace(/\s+/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/FA$/i, '')
    .toLowerCase()
}

function core(s: string) {
  return norm(s).replace(/(资本|证券|投行|咨询|创投|海拓)$/i, '')
}

/** 通讯录机构名是否属于榜单上的这家 */
export function contactBelongsToOrg(companyName: string, orgName: string) {
  const raw = companyName || ''
  if (!raw) return false
  const aliases = ALIASES[orgName] || [orgName]
  const candidates = [...new Set([orgName, ...aliases])]
  const cn = norm(raw)
  const cc = core(raw)
  for (const a of candidates) {
    const an = norm(a)
    const ac = core(a)
    if (!an) continue
    if (cn === an || cn.includes(an) || an.includes(cn)) return true
    if (cc && ac && (cc === ac || cc.includes(ac) || ac.includes(cc))) return true
  }
  // 斜杠分隔的多机构写法
  for (const part of raw.split(/[\/／、]/)) {
    if (contactBelongsToOrgSimple(part.trim(), candidates)) return true
  }
  return false
}

function contactBelongsToOrgSimple(part: string, candidates: string[]) {
  if (!part) return false
  const cn = norm(part)
  const cc = core(part)
  for (const a of candidates) {
    const an = norm(a)
    const ac = core(a)
    if (!an) continue
    if (cn === an || cn.includes(an) || an.includes(cn)) return true
    if (cc && ac && (cc === ac || cc.includes(ac) || ac.includes(cc))) return true
  }
  return false
}
