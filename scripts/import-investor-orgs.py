#!/usr/bin/env python3
"""从 1019 抓取结果生成紧凑的投资机构画像 JSON。"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

from datetime import date, timedelta

from investor_teams import TEAM_SOURCES, TEAMS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "investor-orgs.json"

# 只保留近两年有明确投资日期的记录
DEAL_CUTOFF = (date.today() - timedelta(days=730)).isoformat()

# 大类顺序即优先级（先匹配先归类）
CATEGORIES = [
    "AI",
    "机器人",
    "半导体",
    "生物医药",
    "新能源",
    "汽车出行",
    "企业服务",
    "消费品",
    "先进制造",
    "文娱传媒",
    "其他",
]

CAT_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "机器人",
        re.compile(
            r"(机器人|具身|人形|机械臂|灵巧手|无人系统|无人机|无人车|"
            r"自动驾驶|智驾|Robot|robot|智能装备|工业自动化)"
        ),
    ),
    (
        "半导体",
        re.compile(
            r"(半导体|芯片|集成电路|晶圆|EDA|封测|光刻|存储芯片|功率器件|"
            r"射频|模拟芯片|MCU|SoC|ASIC|FPGA|化合物半导体|光芯片|光电芯片|"
            r"微电子|矽|硅基|硅酷|氮化镓|碳化硅|光子芯)"
        ),
    ),
    (
        "AI",
        re.compile(
            r"(人工智能|大模型|智能体|机器学习|深度学习|计算机视觉|自然语言|"
            r"AIGC|LLM|算法|智算|算力|智能语音|语音识别|知识图谱|"
            r"(?<![a-zA-Z])AI(?![a-zA-Z])|智谱|月之暗面|Minimax|MiniMax|"
            r"数智|智慧(?:软件|系统|科技)|智能(?:软件|决策|科技|技术|创新)|"
            r"认知智能|生成式|多模态)"
        ),
    ),
    (
        "生物医药",
        re.compile(
            r"(生物|医药|医疗|制药|药业|抗体|基因|细胞治疗|疫苗|诊断|器械|"
            r"临床|肿瘤|医美|康养|Health|Bio|Med|医院|诊疗|健康科技)"
        ),
    ),
    (
        "新能源",
        re.compile(
            r"(新能源|光伏|储能|电池|锂电|氢能|风电|太阳能|充电桩|固态电池|"
            r"钠电|燃料电池|碳中和|电力电子|逆变器)"
        ),
    ),
    (
        "汽车出行",
        re.compile(r"(汽车|车载|出行|物流|航运|航空|航天|卫星|电动车|智能驾驶舱|通航)"),
    ),
    (
        "企业服务",
        # 收窄：只认明确 ToB/SaaS 语义，不再用「软件/信息科技」这种大网
        re.compile(
            r"(企业服务|SaaS|云服务|云计算|数据中心|网络安全|信息安全|"
            r"协同办公|人力资源|HR SaaS|财税|ERP|CRM|低代码|DevOps|"
            r"开源基础设施|数字化转型|企业管理|办公软件)"
        ),
    ),
    (
        "消费品",
        re.compile(
            r"(消费|零售|电商|品牌|餐饮|食品|饮料|美妆|服饰|潮玩|家居|母婴|"
            r"宠物|文旅|酒店|咖啡|茶饮|直播带货|生活方式)"
        ),
    ),
    (
        "先进制造",
        re.compile(
            r"(制造|工业|材料|新材料|精密|传感器|激光|机床|自动化|装备|"
            r"增材|3D打印|仪器|检测|量测|光学|光电|智能硬件|传感|机电|"
            r"增材制造|先进材料)"
        ),
    ),
    (
        "文娱传媒",
        re.compile(r"(文娱|传媒|影视|游戏|动漫|音乐|直播|内容|社交|教育|培训|体育)"),
    ),
]

# 行业字段兜底：不再把「科技推广/软件信息」整包扔进企业服务
INDUSTRY_FALLBACK: list[tuple[str, re.Pattern[str]]] = [
    ("消费品", re.compile(r"(零售|批发|餐饮|食品|住宿)")),
    ("文娱传媒", re.compile(r"(文化|娱乐|广播|电视|电影|体育)")),
    ("生物医药", re.compile(r"(医药|卫生)")),
    (
        "先进制造",
        re.compile(
            r"(专用设备|通用设备|仪器仪表|金属制品|电气机械|汽车制造|"
            r"研究和试验发展|专业技术服务业)"
        ),
    ),
    ("半导体", re.compile(r"(计算机、通信和其他电子设备)")),
    # 明确 ToB 行业才进企业服务；泛科技行业留给「其他」
    ("企业服务", re.compile(r"(商务服务业)")),
]

STRONG = re.compile(
    r"(投资基金|创业投资基金|股权投资基金|产业投资基金|创业投资合伙|"
    r"股权投资合伙|投资合伙企业|母基金|引导基金|私募基金|资产管理计划|"
    r"创业投资管理|股权投资管理|投资管理有限公司)",
    re.I,
)
HOLDING = re.compile(
    r"(企业管理合伙|企业管理中心|管理咨询中心|管理咨询合伙|员工持股|持股平台|"
    r"咨询合伙企业|商务信息咨询|企业管理有限合伙|管理咨询服务合伙|"
    r"管理咨询有限公司|投资管理中心|咨询管理合伙|企业管理咨询)"
)
EMAIL_JUNK = re.compile(r"同邮箱企业|@")
IND_FUND = {"资本市场服务", "货币金融服务", "其他金融业", "保险业"}
PCT_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*%")

# 文件名前缀 → 展示名 / 一段话简介（含风格与赛道）
ORG_META: dict[str, dict] = {
    "峰瑞": {
        "name": "峰瑞资本",
        "blurb": "峰瑞资本由李丰创立，是偏研究驱动的早期基金，愿意在非共识方向上重仓。投资阶段以天使到 A/B 轮为主，常看消费科技、产业升级与企业服务，也关注消费和科技交叉的创业机会。",
        "focus": ["消费科技", "产业升级", "企业服务", "早期"],
    },
    "高榕": {
        "name": "高榕资本",
        "blurb": "高榕资本由张震、高翔、岳斌创立，早期到成长期都会出手，更偏好能做成品类头部或具备网络效应的公司。历史上在互联网、消费和企业服务上仓位较深，风格相对均衡、偏龙头导向。",
        "focus": ["互联网", "消费", "企业服务", "成长期"],
    },
    "和谐": {
        "name": "和谐汇一",
        "blurb": "和谐汇一是偏一二级联动的大型投资平台，更看重产业逻辑、成长确定性与资产流动性。组合里常见先进制造、消费和科技成长方向，整体风格偏成长与成熟期，而非极早期广撒网。",
        "focus": ["先进制造", "消费", "科技成长", "成长期"],
    },
    "红杉": {
        "name": "红杉中国",
        "blurb": "红杉中国由沈南鹏团队主导，是覆盖面很广的平台型机构，从早期到成长期、甚至更后阶段都有布局。科技、医疗健康、消费和企业服务是长期重仓赛道，投资上更偏向赛道龙头与高成长公司。",
        "focus": ["科技", "医疗健康", "消费", "企业服务", "全阶段"],
    },
    "旌卓投资": {
        "name": "旌卓投资",
        "blurb": "旌卓投资偏早期到成长期的产业投资，组合中硬科技与先进制造占比较高。决策上更看重技术壁垒、工程化能力和产业化落地，不太追纯概念型项目。",
        "focus": ["硬科技", "先进制造", "早期"],
    },
    "九合": {
        "name": "九合创投",
        "blurb": "九合创投由王啸创立，是典型的早期基金，以种子和天使轮为主，出手较快。长期关注人工智能、企业服务和消费科技，风格上强调早期判断和对创始团队的支持。",
        "focus": ["人工智能", "企业服务", "消费科技", "天使"],
    },
    "君联": {
        "name": "君联资本",
        "blurb": "君联资本是联想控股旗下的 VC/PE 机构，产业资源较强，更常出现在成长期与成熟期项目中。科技、医疗健康和先进制造是传统优势方向，投资风格偏产业协同与规模化成长。",
        "focus": ["科技", "医疗健康", "先进制造", "成长期"],
    },
    "蓝驰": {
        "name": "蓝驰创投",
        "blurb": "蓝驰创投是偏早期的科技基金，关注企业服务、人工智能和产业数字化。投资上更看重产品能力与商业化节奏，风格相对务实，较少追逐纯概念热潮。",
        "focus": ["企业服务", "人工智能", "产业数字化", "早期"],
    },
    "梅花": {
        "name": "梅花创投",
        "blurb": "梅花创投由吴世春创立，以天使和早期投资密度高著称，覆盖面较宽。消费互联网与硬科技早期都会看，风格偏广撒网、重团队，适合捕捉极早期创业机会。",
        "focus": ["消费互联网", "硬科技", "天使", "早期"],
    },
    "明势": {
        "name": "明势资本",
        "blurb": "明势资本由黄明明创立，硬科技早期色彩鲜明，重点关注自动化、新能源、机器人等能形成制造与技术壁垒的方向。投资风格偏产业深度，强调长期技术积累。",
        "focus": ["硬科技", "机器人", "新能源", "先进制造"],
    },
    "普华": {
        "name": "普华资本",
        "blurb": "普华资本更偏向成长期投资与产业整合，常见方向包括智能制造、医疗健康和消费升级。风格上重视规模化能力与产业协同，而不是单纯的早期概念卡位。",
        "focus": ["智能制造", "医疗健康", "消费升级", "成长期"],
    },
    "奇绩创坛": {
        "name": "奇绩创坛",
        "blurb": "奇绩创坛由陆奇创办，采用加速器加早期基金的模式，强调技术创业与批次制孵化。常看硬科技、人工智能等方向，也重视创始人背景和项目的全球化潜力。",
        "focus": ["硬科技", "人工智能", "全球化", "早期"],
    },
    "启赋": {
        "name": "启赋资本",
        "blurb": "启赋资本从深圳起步，早期到成长期都会参与，华南产业网络较强。重点布局硬科技、智能制造和消费电子，投资风格偏产业落地与工程能力。",
        "focus": ["硬科技", "智能制造", "消费电子", "早期"],
    },
    "启明维创": {
        "name": "启明创投",
        "blurb": "启明创投以科技与医疗双轮驱动著称，跨早期到成长期都有布局。医疗健康和 TMT 是长期深耕赛道，风格偏专业赛道研究，强调细分领域的持续积累。",
        "focus": ["医疗健康", "科技", "TMT", "成长期"],
    },
    "水木华清": {
        "name": "水木华清",
        "blurb": "水木华清带有清华系背景，偏早期科技投资，关注科研转化与硬科技产业化。先进制造和前沿技术项目较多，风格上更贴近高校与科研院所成果落地。",
        "focus": ["硬科技", "科研转化", "先进制造", "早期"],
    },
    "顺科": {
        "name": "顺科",
        "blurb": "顺科做早期到成长期的科技产业投资，关注智能硬件与产业升级相关公司。风格偏落地导向，更看重技术能否真正进入产业场景并形成商业闭环。",
        "focus": ["智能硬件", "产业升级", "科技", "早期"],
    },
    "松禾": {
        "name": "松禾资本",
        "blurb": "松禾资本是深圳老牌创投机构，硬科技与生物医药并重，成长期项目占比较高。依托华南产业资源，风格偏稳健，强调技术和产业化双重验证。",
        "focus": ["硬科技", "生物医药", "成长期"],
    },
    "小苗": {
        "name": "小苗朗程",
        "blurb": "小苗朗程偏天使和极早期投资，常看消费、文娱和科技创业团队。风格较轻、出手较早，更适合在项目很早期时建立连接。",
        "focus": ["消费", "文娱", "科技", "天使"],
    },
    "兴畔": {
        "name": "兴畔资本",
        "blurb": "兴畔资本是早期科技向基金，常见方向包括企业服务、产业数字化和硬科技。整体偏 ToB 与产业场景，投资上更关注能否嵌入真实业务流程。",
        "focus": ["企业服务", "产业数字化", "硬科技", "早期"],
    },
    "英诺": {
        "name": "英诺天使",
        "blurb": "英诺天使由李索亚团队主导，以天使阶段出手早、密度高为特点。硬科技与消费早期都会覆盖，风格强调创始人判断和对方向感的快速确认。",
        "focus": ["硬科技", "消费", "天使"],
    },
    "元禾": {
        "name": "元禾控股",
        "blurb": "元禾控股是国资背景的大型创投平台，覆盖早期到成长期，产业资本协同能力较强。半导体、先进制造等硬科技方向仓位突出，风格偏产业深耕与长期配置。",
        "focus": ["半导体", "先进制造", "硬科技", "成长期"],
    },
    "云畔": {
        "name": "云畔资本",
        "blurb": "云畔资本是早期科技基金，较多关注云计算、企业服务和产业互联网相关创业。风格偏基础设施与 ToB，重视底层能力和长期行业需求。",
        "focus": ["云计算", "企业服务", "产业互联网", "早期"],
    },
    "真格": {
        "name": "真格基金",
        "blurb": "真格基金由徐小平、王强创立，以天使到 A 轮为主，消费、科技和互联网创业覆盖很广。风格偏支持型、早期友好，强调陪伴创始人和长期信任关系。",
        "focus": ["消费", "科技", "互联网", "天使"],
    },
    "中科创星": {
        "name": "中科创星",
        "blurb": "中科创星是中科院系硬科技孵化投资平台，聚焦硬科技早期转化与产业化。光电、半导体、新能源等方向较常见，风格强调科研成果走向市场的完整链路。",
        "focus": ["硬科技", "光电", "半导体", "科研转化"],
    },
}


def is_fund(formal: str, industry: str) -> bool:
    name = (formal or "").strip()
    if not name:
        return True
    if EMAIL_JUNK.search(name):
        return True
    if STRONG.search(name):
        return True
    if HOLDING.search(name):
        return True
    if industry in IND_FUND and re.search(r"投资|基金|合伙", name):
        return True
    if re.search(r"(股权投资|创业投资).*(合伙|基金)", name):
        return True
    if re.search(r"投资|基金", name) and name.endswith("合伙企业（有限合伙）"):
        return True
    return False


def parse_pct(raw: str) -> str | None:
    m = PCT_RE.search(raw or "")
    return m.group(1) if m else None


def clean_date(raw: object) -> str | None:
    s = str(raw or "").strip()
    if not s or s in {"-", "None", "null", "nan"}:
        return None
    return s[:10]


def classify_deal(formal: str, short: str, industry: str) -> str:
    text = f"{formal} {short or ''}"
    for cat, pat in CAT_RULES:
        if pat.search(text):
            return cat
    for cat, pat in INDUSTRY_FALLBACK:
        if pat.search(industry or ""):
            return cat
    return "其他"


def load_org(path: Path) -> dict:
    key = path.name.split("_")[0]
    meta = ORG_META.get(
        key,
        {"name": key, "blurb": f"{key}相关投资机构，画像待补全。", "focus": []},
    )
    wb = load_workbook(path, read_only=True, data_only=True)
    if "原始抓取" not in wb.sheetnames:
        wb.close()
        raise RuntimeError(f"{path.name} 缺少「原始抓取」表")
    ws = wb["原始抓取"]
    header = next(ws.iter_rows(max_row=1, values_only=True))
    idx = {h: i for i, h in enumerate(header)}
    by: dict[str, dict] = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        formal = str(row[idx["被投资企业正式名称"]] or "").strip()
        short = str(row[idx["页面简称"]] or "").strip()
        industry = str(row[idx["所属行业"]] or "").strip()
        region = str(row[idx["所属地区"]] or "").strip()
        status = str(row[idx["企业状态"]] or "").strip()
        date = clean_date(row[idx["投资日期"]])
        pct = parse_pct(str(row[idx["投资比例"]] or ""))
        if is_fund(formal, industry):
            continue
        # 仅保留近两年，且必须有可解析投资日期
        if not date or date < DEAL_CUTOFF:
            continue
        cat = classify_deal(formal, short, industry)
        prev = by.get(formal)
        if prev:
            if date > (prev["d"] or ""):
                prev.update(
                    n=short or prev["n"],
                    d=date,
                    r=region or prev["r"],
                    c=cat or prev["c"],
                    p=pct or prev["p"],
                    s=status or prev["s"],
                )
        else:
            by[formal] = {
                "n": short or None,
                "d": date,
                "r": region or None,
                "c": cat,
                "p": pct,
                "s": status or None,
            }
    wb.close()

    regions = sorted({v["r"] for v in by.values() if v["r"]})
    cats_present = sorted(
        {v["c"] for v in by.values() if v["c"]},
        key=lambda c: CATEGORIES.index(c) if c in CATEGORIES else 99,
    )
    rmap = {x: i for i, x in enumerate(regions)}
    cmap = {x: i for i, x in enumerate(cats_present)}
    deals = []
    for formal, v in sorted(
        by.items(), key=lambda kv: (kv[1]["d"] or "", kv[0]), reverse=True
    ):
        # [formal, short, date, regionIdx, categoryIdx, pct, status]
        deals.append(
            [
                formal,
                v["n"],
                v["d"],
                rmap.get(v["r"]),
                cmap.get(v["c"]),
                v["p"],
                v["s"],
            ]
        )
    team = list(TEAMS.get(key) or [])
    cat_counts = {}
    for v in by.values():
        cat_counts[v["c"]] = cat_counts.get(v["c"], 0) + 1
    return {
        "id": key,
        "name": meta["name"],
        "blurb": meta["blurb"],
        "focus": list(meta.get("focus") or []),
        "team": team,
        "teamSource": TEAM_SOURCES.get(key) or "",
        "cutoff": DEAL_CUTOFF,
        "R": regions,
        "C": cats_present,
        "catCounts": cat_counts,
        "deals": deals,
    }


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "1019"
    if not src.is_dir():
        print(f"找不到目录: {src}", file=sys.stderr)
        return 1
    files = sorted(
        p
        for p in src.glob("*.xlsx")
        if not p.name.startswith(".") and not p.name.startswith("~$")
    )
    if not files:
        print(f"{src} 下没有 xlsx", file=sys.stderr)
        return 1

    orgs = []
    for path in files:
        try:
            org = load_org(path)
        except Exception as e:
            print(f"跳过 {path.name}: {e}", file=sys.stderr)
            continue
        orgs.append(org)
        print(f"{org['name']}: {len(org['deals'])} 家公司")

    orgs.sort(key=lambda o: (-len(o["deals"]), o["name"]))
    payload = {
        "v": 2,
        "source": "融资变更",
        "cutoff": DEAL_CUTOFF,
        "categories": CATEGORIES,
        "orgCount": len(orgs),
        "dealCount": sum(len(o["deals"]) for o in orgs),
        "orgs": orgs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(raw, encoding="utf-8")
    print(
        f"写入 {OUT.relative_to(ROOT)}  "
        f"{len(orgs)} 机构 / {payload['dealCount']} 公司 / {OUT.stat().st_size // 1024} KB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
