# 青屹工作台

青屹创投内部 VC 日常工具：项目库、CC 跟进、赛道研究、展会、飞书纪要、联系人。

- 线上：https://vc-workbench.pages.dev/
- 业务跟进数据存在 Cloudflare D1，同事打开同一站点可见
- 项目库 / CC 种子目录优先来自飞书多维表同步（总表 + CC 表）；本站改过的 CC **不会被飞书覆盖**
- 本地仍可用 Excel 生成 `workbench.json` 作回退，**不进 Git**（含联系方式）

## 同事怎么加入（GitHub）

### 1. 你（仓库管理员）

```bash
cd ~/Desktop/vc-workbench
git init
git add .
git commit -m "Initial commit: 青屹工作台"
# 在 GitHub 新建一个 Private 仓库，例如 qingyi-vc-workbench
git branch -M main
git remote add origin git@github.com:<你的用户名>/qingyi-vc-workbench.git
git push -u origin main
```

然后在 GitHub → Settings → Collaborators 把同事加进来。

### 2. 同事本地跑起来

```bash
git clone git@github.com:<你的用户名>/qingyi-vc-workbench.git
cd qingyi-vc-workbench
npm install
```

准备数据（二选一）：

1. **推荐**：向你要这三份文件，放到 `public/data/`  
   - `workbench.json`  
   - `contact-cc.json`  
   - `feishu-company-links.json`
2. 或自己有 Excel 时：`npm run data`（脚本默认读本机 Downloads 里的融资表）

然后：

```bash
npm run dev
# 浏览器打开终端里提示的本地地址，一般是 http://localhost:5180
```

改代码流程：

```bash
git checkout -b feat/xxx
# 改完
git add .
git commit -m "说明改了什么"
git push -u origin HEAD
# 在 GitHub 提 Pull Request，合并进 main
```

发线上（需 Cloudflare 权限 + 已 `npx wrangler login`）：

```bash
npm run cf:deploy
```

## 本地命令

```bash
npm run data       # Excel → public/data/workbench.json（无飞书 catalog 时回退）
npm run feishu-links  # 飞书简介链接 → feishu-company-links.json
npm run dev        # 本地开发（无 D1 时用 localStorage）
npm run cf:dev     # 本地 Pages + D1
npm run cf:migrate # 远端 D1 迁移（含 catalog_state）
npm run cf:deploy  # 构建并发布到 Cloudflare Pages
```

## 飞书多维表同步

1. Cloudflare Pages 配置环境变量：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BITABLE_APP_TOKEN`、`SYNC_SECRET`
2. 执行 `npm run cf:migrate` 创建 `catalog_state` 表
3. 站点「项目库 / CC」点 **立即同步**，或等 GitHub Action 每 15 分钟跑一次
4. GitHub 仓库 Secrets：`SYNC_SECRET`（与 CF 相同）、可选 `SYNC_FEISHU_URL`（默认 `https://vc-workbench.pages.dev/api/sync-feishu`）

同步写入 D1 catalog；网站 overlay（判断、CC 状态、触达等）仍走 `/api/state`，CC 冲突以网站为准。

## 注意

| 文件 | 是否进 Git | 原因 |
|------|------------|------|
| 源码 `src/`、`functions/` | 是 | 大家一起改 |
| `.env` | 否 | 密钥 |
| `public/data/*.json` | 否 | 含联系方式 |
| `node_modules/`、`dist/` | 否 | 可重新安装/构建 |

线上共享状态在 D1；知道 https://vc-workbench.pages.dev/ 的人目前都能读写（暂无登录）。
