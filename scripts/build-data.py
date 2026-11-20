#!/usr/bin/env python3
"""把「融资事件.xlsx」转成原型用的 public/data/workbench.json。

只读 Excel，不改原文件。用法：
    python3 scripts/build-data.py [Excel 路径]
"""
import datetime
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "Downloads/融资事件.xlsx")
OUTPUT = Path(__file__).resolve().parent.parent / "public/data/workbench.json"
YEAR = 2026  # CC 状态里的「9.21」这类日期没有年份

# 判断结论：按原文开头归并成五档
VERDICTS = [
    ("priority", ("优先关注", "符合重点关注标准")),
    ("focus", ("符合关注标准", "奇绩创坛已投资", "建议关注")),
    ("watch", ("建议持续观察",)),
    ("hold", ("暂不优先", "暂不进入CC", "不符合CC")),
    ("pass", ("不看此类项目",)),
]

# 研究赛道：细分赛道太碎（一千多种写法），按关键词归到大类，顺序即优先级
GROUPS = [
    ("具身智能与机器人", r"机器人|具身|灵巧手|人形|触觉|机械臂|外骨骼"),
    ("脑机与量子", r"脑机|量子|核聚变|聚变"),
    ("芯片与半导体", r"芯片|半导体|晶圆|封装|光刻|EDA|存储器|集成电路|光电子|光互连|光模块|传感器"),
    ("航天与低空", r"卫星|火箭|航天|太空|低空|无人机|eVTOL|飞行器|航空"),
    ("生物医药", r"药|医疗|基因|细胞|生物|诊断|医学|器械|临床|合成生物|DNA|蛋白"),
    ("新能源与材料", r"电池|储能|光伏|氢|新能源|材料|电力|充电|碳"),
    ("AI 模型与算力", r"大模型|基础模型|算力|数据中心|云计算|GPU|推理|训练|向量|AI基础设施|AI计算"),
    ("AI 应用", r"AI|智能体|Agent|AIGC|人工智能|数字人|智能"),
    ("消费与品牌", r"消费|品牌|食品|饮料|保健|户外|服饰|服装|美妆|咖啡|宠物|家居|零售|潮玩|运动"),
    ("先进制造与硬件", r"工业|制造|装备|设备|光学|光通信|3D打印|增材|汽车|电机|零部件|仪器|加工|激光|车载"),
    ("企业软件与数据", r"软件|SaaS|数据|安全|云|平台|系统|互联网"),
]
UNGROUPED = "未归类"

# 项目库来源展示名：原始 Excel「来源」→ 工作台标注
SOURCE_MAP = {
    "机构融资": "融资变更",
    "机构投资列表": "融资变更",
    "国内融资": "PR爬取",
    "国内融资事件": "PR爬取",
    "企名片补录": "企名片",
    "企名片": "企名片",
    # 外滩大会、CC表手动项目等保留原名
}


def map_source(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    return SOURCE_MAP.get(text, text)


STAGE_RULES = [
    ("talked", r"聊过|已聊|交流过"),
    ("connected", r"已加|通过|已添加|已有微信|已建联|加到微信"),
    ("blocked", r"可尝试|可重打|没接|未接|未绑定|好友库无"),
    ("reached", r"申请|发送|私信|邮箱|邮件|短信|小红书|cc|CC|留言|已打电话|发微信|公众号|座机电话"),
    ("blocked", r"无联系|没找到|无直接|暂无|无$"),
]
CHANNELS = [
    ("企微", r"企微"),
    ("微信", r"微信(?!公众号)|申请|已加上"),
    ("公众号", r"公众号"),
    ("邮件", r"邮箱|邮件"),
    ("短信", r"短信"),
    ("电话", r"电话|座机|拨号"),
    ("小红书", r"小红书"),
    ("FA", r"FA|fa"),
    ("官网留言", r"留言"),
]
PERSON_KEY = re.compile(r"^(创始人[^：:]{0,14}|法定代表人|法人[^：:]{0,8}|联系人|实控人|核心团队|CEO|CFO)[：:]\s*(.+)$")
PERSON_NAME = re.compile(r"[\u4e00-\u9fa5·]{2,4}(?![\u4e00-\u9fa5])|[A-Za-z][A-Za-z .\-]{1,30}")
NOT_A_NAME = {"未披露", "未确认", "暂无", "未知", "待核实", "不详", "暂未", "未公开", "公开信息"}
MOBILE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
LANDLINE = re.compile(r"(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)")
EMAIL = re.compile(r"[A-Za-z0-9_.+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+")


def text(cell):
    raw = cell.value
    if raw is None:
        return ""
    if isinstance(raw, (datetime.datetime, datetime.date)):
        return raw.strftime("%Y-%m-%d")
    return str(raw).strip()


def is_industry_class(sector):
    """「科技推广和应用服务业」这类是工商行业分类，不是真正的赛道。"""
    return bool(sector) and (sector.endswith("业") or sector in ("研究和试验发展", "资本市场服务"))


def verdict_of(judgment):
    for key, prefixes in VERDICTS:
        if judgment.startswith(prefixes):
            return key
    return "none"


def group_of(*labels):
    for label in labels:
        if not label or is_industry_class(label):
            continue
        for name, pattern in GROUPS:
            if re.search(pattern, label, flags=re.I):
                return name
    return UNGROUPED


def parse_status(raw):
    stage = None
    for key, pattern in STAGE_RULES:
        if re.search(pattern, raw):
            stage = key
            break
    dates = []
    for month, day in re.findall(r"(?<![\d.])(\d{1,2})\.(\d{1,2})(?![\d.])", raw):
        if 1 <= int(month) <= 12 and 1 <= int(day) <= 31:
            dates.append(f"{YEAR}-{int(month):02d}-{int(day):02d}")
    if stage is None:
        stage = "reached" if dates else "todo"
    channels = [name for name, pattern in CHANNELS if re.search(pattern, raw)]
    return stage, (max(dates) if dates else None), channels


def parse_contact(raw):
    people, seen = [], set()
    for segment in re.split(r"[\n；;]", raw):
        match = PERSON_KEY.match(segment.strip())
        if not match:
            continue
        name = PERSON_NAME.match(match.group(2).strip())
        if not name:
            continue
        name = re.sub(r"(教授|博士|先生|女士|老师)$", "", name.group(0).strip())
        if name in NOT_A_NAME or name in seen or any(name.startswith(x) for x in NOT_A_NAME):
            continue
        if len(name) < 2 or re.search(r"创始人|来自|公司|团队|履历|法人|负责人", name):
            continue
        seen.add(name)
        people.append({"name": name, "role": match.group(1).strip()})
    phones = list(dict.fromkeys(MOBILE.findall(raw) + LANDLINE.findall(raw)))
    emails = list(dict.fromkeys(EMAIL.findall(raw)))
    direct = None
    if "无直接联系方式" in raw:
        direct = False
    elif "有直接联系方式" in raw:
        direct = True
    return people, phones, emails, direct


def owner_of(reason):
    for pattern in (r"同事需求（([\u4e00-\u9fa5]{2,3})[，,）]", r"^([\u4e00-\u9fa5]{2,3})赛道 待CC", r"^([\u4e00-\u9fa5]{2,3})待cc名单"):
        match = re.search(pattern, reason)
        if match:
            return match.group(1)
    return None


def reason_kind(reason):
    if re.match(r"抖音|双十一", reason):
        return "消费榜单"
    if re.match(r"符合重点关注|优先关注", reason):
        return "重点关注"
    if reason.startswith(("符合关注标准", "建议关注", "项目符合公司画像")):
        return "符合关注标准"
    if "奇绩创坛" in reason[:12]:
        return "奇绩创坛已投"
    if owner_of(reason):
        return "同事提名"
    return "其他" if reason else ""


def main():
    workbook = load_workbook(SOURCE, data_only=True)
    companies = {}

    def company(name):
        if name not in companies:
            companies[name] = {
                "id": hashlib.md5(name.encode()).hexdigest()[:8],
                "name": name, "events": [], "cc": None,
            }
        return companies[name]

    rows = iter(workbook["总表"].iter_rows())
    header = [text(cell) for cell in next(rows)]
    for cells in rows:
        row = dict(zip(header, (text(cell) for cell in cells)))
        if not row.get("项目"):
            continue
        founder = row["创始人"]
        if founder in ("未披露", "None", "及核心团队履历") or founder.startswith("及"):
            founder = ""
        company(row["项目"])["events"].append({
            "date": row["投资日期"][:10] or None,
            "investors": [x.strip() for x in re.split(r"[、,，;；]", row["机构"]) if x.strip() and x.strip() != "未披露"],
            "source": map_source(row["来源"]),
            "sector": row["赛道"],
            "related": row["赛道关联"],
            "founder": founder,
            "status": row["状态"],
            "verdict": verdict_of(row["判断"]),
            "judgment": row["判断"],
        })

    rows = iter(workbook["CC 表"].iter_rows())
    header = [text(cell) for cell in next(rows)]
    for cells in rows:
        row = dict(zip(header, (text(cell) for cell in cells)))
        if not row.get("公司名称"):
            continue
        item = company(row["公司名称"])
        stage, last_touch, channels = parse_status(row["CC状态"])
        people, phones, emails, direct = parse_contact(row["联系方式"])
        cc = {
            "stage": stage, "status": row["CC状态"], "lastTouch": last_touch, "channels": channels,
            "reason": row["cc原因"], "reasonKind": reason_kind(row["cc原因"]), "owner": owner_of(row["cc原因"]),
            "contact": row["联系方式"], "people": people, "phones": phones, "emails": emails, "direct": direct,
            "source": map_source(row["来源"]), "sector": row["赛道"],
        }
        if item["cc"]:  # 同名公司出现两行：保留信息更全的字段
            previous = item["cc"]
            if not previous["status"] and cc["status"]:
                previous.update(stage=cc["stage"], lastTouch=cc["lastTouch"], channels=cc["channels"])
            for key, value in cc.items():
                if not previous.get(key) and value:
                    previous[key] = value
        else:
            item["cc"] = cc

    result = []
    for item in companies.values():
        events = sorted(item["events"], key=lambda e: e["date"] or "", reverse=True)
        cc = item["cc"]
        sectors = [cc["sector"] if cc else ""] + [e["sector"] for e in events] + [e["related"] for e in events]
        sector = next((s for s in sectors if s and not is_industry_class(s)), "") or next((s for s in sectors if s), "")
        judged = next((e for e in events if e["verdict"] != "none"), None)
        group = group_of(*sectors)
        if group == UNGROUPED and cc and cc["reasonKind"] == "消费榜单":
            group = "消费与品牌"
        # 公司级来源：按最近融资事件优先，再补 CC；多来源去重后用顿号拼接
        source_parts = []
        for e in events:
            s = e.get("source") or ""
            if s and s not in source_parts:
                source_parts.append(s)
        if cc and cc.get("source") and cc["source"] not in source_parts:
            source_parts.append(cc["source"])
        # 仅出现在 CC、Excel 未填来源：仍给公司级标注，避免项目库空白
        if not source_parts and cc:
            source_parts.append("CC表")
            if not cc.get("source"):
                cc["source"] = "CC表"
        company_source = "、".join(source_parts)
        result.append({
            "id": item["id"], "name": item["name"], "sector": sector, "sectorIsClass": is_industry_class(sector),
            "group": group,
            "source": company_source,
            "founder": next((e["founder"] for e in events if e["founder"]), ""),
            "relation": next((e["status"] for e in events if e["status"]), ""),
            "verdict": judged["verdict"] if judged else "none",
            "judgment": judged["judgment"] if judged else "",
            "lastDate": events[0]["date"] if events else None,
            "events": [{k: e[k] for k in ("date", "investors", "source", "sector")} for e in events],
            "cc": {k: v for k, v in cc.items() if k != "sector"} if cc else None,
        })
    result.sort(key=lambda c: (c["lastDate"] or "", c["name"]), reverse=True)

    owners = sorted({c["cc"]["owner"] for c in result if c["cc"] and c["cc"]["owner"]})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({
        "generatedAt": datetime.datetime.now().isoformat(timespec="minutes"),
        "sourceFile": SOURCE.name, "owners": owners, "companies": result,
    }, ensure_ascii=False, separators=(",", ":")))

    in_cc = [c for c in result if c["cc"]]
    print(f"公司 {len(result)} 家，融资事件 {sum(len(c['events']) for c in result)} 条，CC {len(in_cc)} 家")
    print("判断:", dict(Counter(c["verdict"] for c in result)))
    print("CC 阶段:", dict(Counter(c["cc"]["stage"] for c in in_cc)))
    print("公司来源:", dict(Counter(c["source"] or "(空)" for c in result).most_common(12)))
    print("研究赛道:", dict(Counter(c["group"] for c in result).most_common()))
    print("负责人:", owners)
    print("识别到联系人:", sum(bool(c["cc"]["people"]) for c in in_cc),
          "有电话:", sum(bool(c["cc"]["phones"]) for c in in_cc),
          "有邮箱:", sum(bool(c["cc"]["emails"]) for c in in_cc))
    print(f"已写入 {OUTPUT}（{OUTPUT.stat().st_size / 1024:.0f} KB）")


if __name__ == "__main__":
    main()
