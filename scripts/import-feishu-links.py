#!/usr/bin/env python3
"""从飞书多维表格「总表 + CC 表」拉取公司简介链接 → public/data/feishu-company-links.json

凭证放仓库根目录 .env（勿提交）：
  FEISHU_APP_ID=...
  FEISHU_APP_SECRET=...
  FEISHU_BITABLE_APP_TOKEN=WmJebv7lna42Tgs3aPqcJWqMn4e
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "feishu-company-links.json"

# 总表用「项目」，CC 表用「公司名称」
TABLES = [
    ("tblVAbOa4tpLtr8E", "总表", "项目", "公司简介"),
    ("tblLuQvjEpaaKiHa", "CC 表", "公司名称", "公司简介"),
]


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def curl_json(url: str, *, method: str = "GET", data: dict | None = None, token: str | None = None) -> dict:
    cmd = ["curl", "-s", "-X", method, url, "-H", "Content-Type: application/json"]
    if token:
        cmd += ["-H", f"Authorization: Bearer {token}"]
    if data is not None:
        cmd += ["-d", json.dumps(data)]
    raw = subprocess.check_output(cmd, text=True)
    return json.loads(raw)


def field_text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        return "".join(x.get("text", "") if isinstance(x, dict) else str(x) for x in v).strip()
    if isinstance(v, dict):
        return (v.get("text") or "").strip()
    return str(v).strip()


def field_link(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip() if v.startswith("http") else ""
    if isinstance(v, list):
        for x in v:
            if isinstance(x, dict) and x.get("link"):
                return str(x["link"]).strip()
        return ""
    if isinstance(v, dict) and v.get("link"):
        return str(v["link"]).strip()
    return ""


def fetch_all(app_token: str, table_id: str, token: str) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    page_token = None
    while True:
        url = (
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records"
            f"?page_size=500&text_field_as_array=true"
        )
        if page_token:
            url += f"&page_token={page_token}"
        d = curl_json(url, token=token)
        if d.get("code") != 0:
            raise RuntimeError(d)
        for it in d["data"].get("items") or []:
            rid = it.get("record_id") or ""
            if rid in seen:
                continue
            seen.add(rid)
            items.append(it)
        if not d["data"].get("has_more"):
            break
        page_token = d["data"].get("page_token")
        if not page_token:
            break
    return items


def main() -> int:
    load_env()
    app_id = os.environ.get("FEISHU_APP_ID", "").strip()
    app_secret = os.environ.get("FEISHU_APP_SECRET", "").strip()
    app_token = os.environ.get("FEISHU_BITABLE_APP_TOKEN", "WmJebv7lna42Tgs3aPqcJWqMn4e").strip()

    if not app_id or not app_secret:
        print("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET，请写入 .env", file=sys.stderr)
        return 1

    tok = curl_json(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        method="POST",
        data={"app_id": app_id, "app_secret": app_secret},
    )
    if tok.get("code") != 0:
        print(tok, file=sys.stderr)
        return 1
    token = tok["tenant_access_token"]

    links: dict[str, dict] = {}
    for table_id, table_name, name_field, link_field in TABLES:
        items = fetch_all(app_token, table_id, token)
        with_link = no_link = 0
        for it in items:
            f = it.get("fields") or {}
            name = field_text(f.get(name_field))
            url = field_link(f.get(link_field))
            if not name:
                continue
            if not url:
                no_link += 1
                continue
            with_link += 1
            links.setdefault(
                name,
                {
                    "name": name,
                    "feishuUrl": url,
                    "recordId": it.get("record_id"),
                    "from": table_name,
                },
            )
        print(f"[{table_name}] records={len(items)} with_link={with_link} no_link={no_link}")

    out = {
        "source": f"feishu base {app_token} · 总表+CC表",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "count": len(links),
        "links": sorted(links.values(), key=lambda x: x["name"]),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"merged unique={len(links)} → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
