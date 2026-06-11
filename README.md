# HomeWMS — AI 驱动的个人仓库管理系统

[English](./README_en.md) | 中文

用自然语言和 AI 对话管理家庭物品库存。支持多仓库独立数据库、5 层 Agent 架构消除幻觉、双语正则引擎、物品拆分重组、自纠正与正则学习。

https://github.com/user-attachments/assets/0822e136-a825-4c23-be1e-91fc9949dbbb

## 功能亮点

- **自然语言对话** — 跟 AI 说「买了六瓶可乐放冰箱」即入库，「鸡蛋吃完了」即出库
- **5 层 Agent 架构** — L1 意图分类 → L2 编排执行 → L3 上下文组装 → L4 回复生成 → L5 自纠正，逐层把关，杜绝幻觉
- **双语正则引擎** — 中英文 L0 正则自动检测语种，覆盖 90%+ 日常指令，关键词提取/数量识别/位置提取全部双路径
- **物品拆分与重组** — 支持「分品牌」操作：将「可乐」拆为无糖/有糖等品牌子物品，LLM 自动生成拆分方案，库存均分
- **自纠正与学习** — L5 层编造检测 + DB 硬校验 + LLM 语义检查，检测到错误自动重跑分层，积累纠正 case 生成候选正则
- **多仓库隔离** — 每仓库独立 PostgreSQL 数据库，`warehouses.json` 管理连接，一键切换
- **保质期追踪** — 入库时自动设定保质期，字符串日期比对 `expiryDate < today` 判定过期
- **12 个 AI 工具** — findItem / stockIn / consumeItem / moveItem / splitItem / deleteItem / checkStock / getSpots / createItem / updateStock / listStores / setAiName
- **定时任务** — cron 表达式配置，自动盘点、保质期检查，前台可视化管理
- **多 LLM** — DeepSeek / OpenAI / Claude / Gemini / OpenRouter，按仓库自由切换
- **中英双语 UI** — Chat / Inventory / Logs / Settings 四个页面完整双语，语言偏好持久化
- **全操作日志** — AI + 手动全部操作记录，支持按类型/日期筛选查询

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | TailwindCSS v4 + shadcn/ui |
| 数据库 | PostgreSQL + Prisma 7 (PG adapter) |
| AI | Vercel AI SDK v6 (`streamText` + `generateText` + `tool`) |
| 调度 | node-cron (60s DB 轮询，动态加载任务) |

## 5 层 Agent 架构

```
用户消息
  │
  ▼
┌──────────────────────────────────────────────┐
│ L1: 意图分类                                  │
│   L0 双语正则 (90%+) → L1 generateText 兜底    │
│   多物品消息拆分 → Intent[]                    │
├──────────────────────────────────────────────┤
│ L2: 编排执行                                  │
│   buildPlan(Intent) → CallStep[]              │
│   executePlan: 顺序执行，findItem 门控，失败重试│
│   pickName/pickSpot 尊重 found flag           │
├──────────────────────────────────────────────┤
│ L3: 上下文组装                                │
│   注入系统提示词、仓库名、日期、语言指令        │
│   注入 ✅成功 / ❌失败 / ⚠️冲突                 │
│   hasOnlyQuery → 禁止声称操作                  │
│   hasFailedMutation → 禁止声称成功             │
├──────────────────────────────────────────────┤
│ L4: 回复生成                                  │
│   streamText + 零工具 — LLM 无写能力           │
│   仅基于 L3 注入的 verified results 生成文本     │
├──────────────────────────────────────────────┤
│ L5: 自纠正与学习                              │
│   编造检测(正则) + DB 硬校验(prisma)            │
│   + LLM 语义检查                               │
│   检测到问题 → 重分类 → 重跑 L2 → 纠正回复       │
│   纠正 case ≥3 → LLM 生成候选正则               │
└──────────────────────────────────────────────┘
```

### L1: 意图分类

六种意图类型，L0 双语正则覆盖绝大多数日常指令，L1 `generateText` 处理边缘情况。

| Intent | 中文信号 | 英文信号 |
|--------|---------|---------|
| `consume` | 吃了/喝了/扔了/用完了/过期/变质/出库 | ate/drank/used/finished/threw/discarded |
| `stockIn` | 买了/入库/放进/添加/采购/进货 | bought/purchased/got/added/stocked |
| `move` | 搬到/移到/挪到/搬了/位置不对/放错 | moved/relocated/transferred/shifted |
| `restructure` | 分品牌/拆分/分割/重组/分类/分成 | split/separate/break down/reorganize |
| `delete` | 删除/去掉/移除/清空 | delete/remove/clear |
| `query` | 盘点/查看/库存/在哪/还有/多少 | check/look/how many/where/inventory |

**关键词提取**: 中文移除动词 + 量词 + 语气词；英文移除动词 + 介词 + 冠词 + 数量词。

**数量识别**: Arabic 数字 + 中文数字（二十 → 20, 一百二 → 120）+ 英文数字词（two dozen → 24）。

**多物品拆分**: 检测 `,` + 又/还/也/and also/and then → 拆为独立 clause → 分别分类 → 返回 `Intent[]`，编排层循环执行。

**冒犯回退**: keyword 匹配到抱怨词（你/我/不会/操作/搞/没/you/how/what）时降级为 query。

### L2: 编排执行

意图 → `buildPlan()` → `CallStep[]` → `executePlan()` → 顺序执行。

| Intent | Plan |
|--------|------|
| `query` | findItem |
| `consume` | findItem → consumeItem |
| `stockIn` | findItem → stockIn(target ∥ pickSpot) |
| `move` | findItem → moveItem(target ∥ pickSpot) |
| `delete` | findItem → deleteItem(found===false ? "" : pickName) |
| `restructure` | findItem → resolveSplitsViaLLM → splitItem |

- `pickName` / `pickSpot` 尊重 findItem 的 `found` flag，未找到时回退 keyword/target
- delete 空 keyword → `deleteItem("")` → 全仓库清空
- restructure 空 splits → LLM 生成品牌列表 → splitItem 均分库存

### L3: 上下文组装

- 注入 `SYSTEM_PROMPT`（零工具规则 + 双语 DB 警告 + 状态/保质期规则）
- 注入 AI 名称、仓库名、今日日期（供过期比对）、语言指令（zh/en）
- 注入 `✅ Verified DB Results` / `❌ Failed Operations` / `⚠️ Context Conflicts`
- **防编造**: `hasOnlyQuery` → 注入"你只能报告数据，不能声称执行了操作"
- **防编造**: `hasFailedMutation` → 注入"操作失败了，数据库没变化，不要声称成功"

### L4: 回复生成

`streamText` **零工具**。LLM 只拿到 L3 注入的 verified results，无法调用任何工具。系统提示词明确规定：`you have no tools, the system already executed everything for you`。`onFinish` 保存消息到 Message 表。

### L5: 自纠正与学习

**三重检测**:

1. **编造检测** — 正则扫描回复 → 匹配 `已清空/删除成功/✅成功/操作成功` → 对比 L2 执行 → 声称成功但未执行/失败 → `FABRICATION`
2. **DB 硬校验** — `verifyDB()` 用 prisma 重查数据库 → 逐物品对比声称数量/位置 → 不匹配 → `needsCorrection`
3. **LLM 语义检查** — `generateText` 对比用户原话 vs 意图 vs 执行 vs 回复 → 不匹配 → `needsCorrection`

**纠正流程**: 检测到问题 → 重分类 → 重跑 L2 → 生成纠正回复 → 存 DB。客户端 500ms/1.2s/2.2s 三级刷新获取纠正消息。

**正则学习**: 纠正 case 写 Log(action=correction) → ≥3 条 → `maybeLearn()` → LLM 提取关键词模式 → 生成候选正则 → 存 Log(action=regex_candidate)。

## 项目结构

```
src/
├── agent/
│   ├── intent/            # L1: classifier.ts + types.ts
│   ├── orchestrator/      # L2: matcher.ts + executor.ts + types.ts
│   ├── context/           # L3: assembler.ts + compose.ts + conflict.ts + types.ts
│   ├── response/          # L4: generator.ts + types.ts
│   ├── correction/        # L5: checker.ts + learner.ts
│   ├── index.ts           # Agent 主入口，串联 5 层
│   ├── router.ts          # LLM 路由 (5 厂商)
│   └── summarizer.ts      # 对话摘要压缩
├── tools/                 # 12 个 AI 工具 (工厂模式)
├── services/              # Prisma 查询封装 (inventory + message)
├── app/
│   ├── api/chat/          # 对话 API (5 层入口)
│   ├── api/inventory/     # 库存 CRUD
│   ├── api/logs/          # 操作日志
│   ├── api/stores/        # 仓库管理
│   ├── api/settings/      # 模型/记忆配置
│   ├── api/tasks/         # 定时任务
│   ├── chat/              # 聊天页 (双语 UI)
│   ├── inventory/         # 库存管理页 (双语)
│   ├── logs/              # 日志页 (双语)
│   └── settings/          # 设置页 (模型/仓库/记忆/任务/语言)
├── scheduler/cron.ts      # 定时调度器
├── lib/
│   ├── prompts.ts         # 系统提示词
│   ├── i18n.tsx           # 中英双语 (~150 key)
│   ├── connections.ts     # 多仓库连接 + Schema 自动初始化/迁移
│   └── constants.ts       # 全局常量
└── components/ui/         # shadcn/ui 组件
```

## 数据库表结构

每仓库独立 PostgreSQL 数据库，Prisma 自动建表/迁移。

| 表 | 核心字段 | 关系 |
|----|---------|------|
| **Item** | id, name(unique), desc, category | → Stock[Cascade], → Log[SetNull] |
| **Spot** | id, name, parentId (树形自引用) | → Stock[Cascade] |
| **Stock** | id, itemId, spotId, qty, status, expiryDate | (itemId, spotId) 联合唯一 |
| **Log** | id, itemId, action, qty, fromSpot, toSpot, note | itemId/action/createdAt 索引 |
| **Message** | id, role, content, toolCalls(JSONB), tokenCount, aiName | createdAt 索引 |
| **Summary** | id, content (LLM 英文压缩) | createdAt 索引 |
| **Task** | id, type, cron, lastRun, enabled | — |

## 配置

`warehouses.json` 每仓库独立配置：

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `modelId` | LLM 模型 | `deepseek/deepseek-v4-flash` |
| `memorySize` | 短期记忆条数 (50-2000) | 200 |
| `contextMode` | 上下文模式: recent / summary / hybrid | recent |
| `summaryEnabled` | 启用摘要压缩 | false |
| `summaryThreshold` | 触发摘要的消息数 (10-500) | 50 |
| `summaryCount` | 上下文包含摘要数 (1-10) | 3 |
| `debugMode` | 完整上下文写 Log | false |
| `customPrompt` | 自定义系统提示词 | 空 (使用默认) |

## 部署

### Vercel

1. Fork 本项目，在 Vercel 导入
2. Framework Preset 选 Next.js
3. 环境变量: `DEEPSEEK_API_KEY`, `CRON_SECRET`
4. 部署后打开 Settings → 添加 PostgreSQL
5. 外部 cron: 设置每分钟调用 `https://your-app.vercel.app/api/cron/run?secret=your-cron-secret`

### Docker

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t homewms .
docker run -d -p 3000:3000 \
  -e DEEPSEEK_API_KEY=sk-your-key \
  -e CRON_SECRET=your-random-secret \
  -v $(pwd)/warehouses.json:/app/warehouses.json \
  homewms
```

### 自部署 (Node.js)

```bash
git clone https://github.com/Zzgb/HomeWMS.git
cd HomeWMS
pnpm install
cp .env.example .env  # 编辑 API Key
npx prisma generate
pnpm build
pnpm start            # 推荐 pm2 或 systemd 守护
```

外部 cron: `curl -X POST https://your-domain.com/api/cron/run?secret=your-cron-secret`

## 快速开始 (开发)

```bash
git clone https://github.com/Zzgb/HomeWMS.git
cd HomeWMS
pnpm install
# 创建 .env → 配 DEEPSEEK_API_KEY + CRON_SECRET
pnpm dev
```

打开 `http://localhost:3000` → 设置页添加 PostgreSQL 数据库。

## License

仅供个人非商业使用。详见 [LICENSE](./LICENSE)。This source code is for personal, non-commercial use only.
