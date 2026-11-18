#!/usr/bin/env python3
"""把「联系管理_总库」里的运动户外 / 健康营养导入为 CC 公司。

品类映射：运动户外 → 户外，健康营养 → 保健品。
用法：
    python3 scripts/import-contact-cc.py [xlsx 路径]
"""
from __future__ import annotations

import datetime
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook

DEFAULT = Path.home() / "Desktop/副本联系管理_总库及历史(1).xlsx"
SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT)
OUTPUT = Path(__file__).resolve().parent.parent / "public/data/contact-cc.json"

GROUP_MAP = {
    "运动户外": "户外",
    "健康营养": "保健品",
    "营养健康": "保健品",
}

MOBILE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
LANDLINE = re.compile(r"(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)")
EMAIL = re.compile(r"[A-Za-z0-9_.+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+")


def cell(v):
    if v is None:
        return ""
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def map_stage(status: str, research: str, follow: str, tried: str) -> str:
    s = status.strip()
    blob = "\n".join([s, research, follow])

    if re.search(r"产品不行|大品牌不cc|海外品牌不cc|属海外|不按独立国产|上市公司旗下", blob, re.I):
        if re.search(r"聊过|交流过|已初聊", s):
            return "talked"
        return "dropped"
    if re.search(r"不用|已注销|和.+一个公司", s) or (follow == "大品牌不cc"):
        if re.search(r"聊过|交流过|已初聊", s):
            return "talked"
        return "dropped"
    if re.search(r"聊过|交流过|已初聊", s):
        return "talked"
    if re.search(r"微信通过|已拉群", s):
        return "connected"
    if re.search(r"申请|短信|发短信", s):
        return "reached"
    if re.search(
        r"没有找到|无有效|找不到|还没找到|已查找|已达电话|已打|没人接|是ai|不是有效|没接",
        s,
    ):
        return "blocked"
    if s in ("没联系",):
        return "todo"
    if not s:
        if re.search(r"不cc|大品牌", follow) or re.search(r"不cc|海外品牌不cc|大品牌不cc", research):
            return "dropped"
        if tried in ("是", "true", "True", "1"):
            return "reached"
        return "todo"
    return "todo"


def channels_of(status: str, contact: str, research: str) -> list[str]:
    blob = f"{status}\n{contact}\n{research}"
    out = []
    for name, pat in (
        ("微信", r"微信"),
        ("短信", r"短信"),
        ("电话", r"电话|打"),
        ("企微", r"企微"),
    ):
        if re.search(pat, blob):
            out.append(name)
    return out


def main():
    if not SOURCE.exists():
        raise SystemExit(f"找不到文件：{SOURCE}")

    wb = load_workbook(SOURCE, data_only=True, read_only=True)
    ws = wb["公司总库"]
    rows = ws.iter_rows(values_only=True)
    header_row = next(rows)
    headers = [cell(h) or f"_col{i}" for i, h in enumerate(header_row)]

    companies = []
    stages = Counter()
    groups = Counter()

    for raw in rows:
        if not raw or not any(raw):
            continue
        row = {headers[i]: cell(raw[i]) if i < len(raw) else "" for i in range(len(headers))}
        category = row.get("品类", "")
        group = GROUP_MAP.get(category)
        if not group:
            continue

        project = row.get("项目名称", "")
        brand = row.get("关联品牌", "")
        if not project and not brand:
            continue

        name = brand or project
        # 多品牌时取第一个
        if "、" in name:
            name = name.split("、")[0].strip()
        company_body = row.get("公司主体", "") or project
        business = row.get("主营业务", "")
        status = row.get("交流状态", "")
        follow = row.get("跟进分类", "") or row.get("原始跟进备注", "")
        # 原始跟进备注有时是「重点跟进」，跟进分类同；研究备注是长文
        follow_class = row.get("跟进分类", "")
        raw_follow = row.get("原始跟进备注", "")
        research = row.get("研究备注", "")
        contact = row.get("联系方式", "")
        tried = row.get("已尝试触达", "")
        next_date = row.get("下次跟进日期", "") or None
        last_contact = row.get("最近联系日期", "") or None
        source = row.get("榜单来源", "") or "联系管理总库"

        stage = map_stage(status, research, follow_class or raw_follow, tried)
        stages[stage] += 1
        groups[group] += 1

        status_text = status
        if not status_text and tried in ("是", "true", "True", "1"):
            status_text = "已尝试触达（表内未写交流状态）"
        if not status_text and follow_class:
            status_text = follow_class

        phones = list(dict.fromkeys(MOBILE.findall(contact + "\n" + research) + LANDLINE.findall(contact + "\n" + research)))
        emails = list(dict.fromkeys(EMAIL.findall(contact + "\n" + research)))
        channels = channels_of(status_text, contact, research)

        applied_at = None
        last_touch = last_contact or None
        if stage == "reached":
            applied_at = last_contact or None
            # 发申请阶段不把 lastTouch 当已触达
            last_touch = None
        elif stage in ("connected", "talked"):
            last_touch = last_contact or None

        reason = research or raw_follow or follow_class
        verdict = "focus" if follow_class == "重点跟进" or raw_follow == "重点跟进" else "none"
        if stage == "dropped":
            verdict = "hold"

        uid = "occ-" + hashlib.md5(f"{group}|{project}|{brand}".encode()).hexdigest()[:10]

        companies.append(
            {
                "id": uid,
                "name": name,
                "sector": business[:80] if business else category,
                "sectorIsClass": False,
                "group": group,
                "founder": "",
                "relation": company_body[:120] if company_body else "",
                "verdict": verdict,
                "judgment": (research or raw_follow or "")[:500],
                "lastDate": last_contact or None,
                "events": [],
                "cc": {
                    "stage": stage,
                    "status": status_text,
                    "lastTouch": last_touch,
                    "appliedAt": applied_at,
                    "nextDate": next_date,
                    "channels": channels,
                    "reason": reason[:800],
                    "reasonKind": "联系管理总库",
                    "owner": None,
                    "contact": contact or research[:200],
                    "people": [],
                    "phones": phones,
                    "emails": emails,
                    "direct": bool(phones or emails) or None,
                    "source": source[:200],
                },
                "custom": True,
            }
        )

    companies.sort(key=lambda c: (c["group"], c["name"]))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="minutes"),
        "sourceFile": SOURCE.name,
        "companies": companies,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"导入 {len(companies)} 家（户外/保健品）")
    print("赛道:", dict(groups))
    print("阶段:", dict(stages))
    print(f"已写入 {OUTPUT}（{OUTPUT.stat().st_size / 1024:.0f} KB）")


if __name__ == "__main__":
    main()
