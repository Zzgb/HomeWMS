# HomeWMS — AI 驱动的个人仓库管理系统

用自然语言和 AI 对话来管理家里的物品库存。支持多仓库、独立数据库。**5 层 Agent 架构，从意图分类到自我纠正全链路可控，杜绝 AI 幻觉。**

https://github.com/user-attachments/assets/0822e136-a825-4c23-be1e-91fc9949dbbb

## 功能亮点

- **自然语言对话** — 跟 AI 助手说「买了 6 瓶可乐放冰箱」即可完成入库，说「鸡蛋吃完了」自动出库
- **5 层 Agent 架构** — L1 意图 → L2 编排 → L3 上下文 → L4 回复 → L5 自纠正，层层把关
- **双语正则引擎** — 中英文 L0 正则自动检测，智能切换 extraction 逻辑，覆盖 90%+ 日常指令
- **多仓库支持** — 每个仓库独立 PostgreSQL 数据库，数据完全隔离，一键切换
- **物品拆分与重组** — 支持「分品牌」操作：一键将「可乐」按品牌拆分为无糖/有糖等子物品，库存自动分配
- **智能分类识别** — 入库时 AI 自动推断物品分类（食品/工具/电子/日用品/药品）
- **保质期追踪** — 自动识别变质/过期状态，字符串日期比对 expiryDate < today = expired
- **幻觉自纠正** — L5 层自动检测编造与执行失败，触发纠正重跑分层，DB 硬校验确保数据一致
- **正则学习系统** — L5 积累纠正案例，≥3 条自动生成候选正则
- **操作二次验证** — 所有写操作结束后查库确认，返回 verified 字段
- **全操作日志** — 所有 AI 操作 + 手动操作完整记录，支持按类型/日期筛选
- **定时任务** — 支持 cron 表达式，自动盘点、保质期检查，前台可视化管理
- **多 LLM 支持** — DeepSeek / OpenAI / Claude / Gemini / OpenRouter 自由切换

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | TailwindCSS v4 + shadcn/ui |
| 数据库 | PostgreSQL + Prisma 7 (PG adapter) |
| AI | Vercel AI SDK v6 (`streamText` + `tool` + `generateText`) |
| 调度 | node-cron |
| 部署 | Vercel / Docker / 自托管 |

## 5 层 Agent 架构

```
用户消息
  ↓
┌──────────────────────────────────────────────┐
│ L1: 意图分类 (Intent)                          │
│   L0 双语正则 → L1 generateText 兜底           │
│   输出: Intent[]（多物品消息拆分）               │
├──────────────────────────────────────────────┤
│ L2: 编排层 (Orchestrator)                     │
│   buildPlan → executePlan (findItem 门控)      │
│   输出: ToolResult[]（已验证的 DB 结果）         │
├──────────────────────────────────────────────┤
│ L3: 上下文组装 (Context)                       │
│   注入 ✅成功/❌失败/⚠️冲突 + 防编造指令        │
│   输出: ModelMessage[]                         │
├──────────────────────────────────────────────┤
│ L4: 回复生成 (Response)                        │
│   streamText — 零工具，仅基于 verified data    │
│   输出: stream + DB 存储                       │
├──────────────────────────────────────────────┤
│ L5: 自纠正 (Correction)                        │
│   编造检测 → DB 硬校验 → LLM 语义检查           │
│   纠正重跑 → 存纠正消息 → 正则学习              │
└──────────────────────────────────────────────┘
```

### 各层详解

**L1: 意图分类 (Intent Classification)**

6 种意图类型，L0 双语正则覆盖 90%+ 日常指令，L1 `generateText` 兜底：

| Intent | 中文信号 | 英文信号 |
|--------|---------|---------|
| consume | 吃了/喝了/扔了/用完了/过期/变质 | ate/drank/used/finished/threw |
| stockIn | 买了/入库/放进/添加/采购 | bought/purchased/got/added |
| move | 搬到/移到/挪到/搬了/位置不对 | moved/relocated/transferred |
| restructure | 分品牌/拆分/分割/重组/分类 | split/separate/break down |
| delete | 删除/去掉/移除/清空 | delete/remove/clear |
| query | 盘点/查看/库存/在哪/还有 | check/look/how many/where |

关键词提取根据语种自动选策略：中文移除动词+量词+粒子，英文移除动词+介词+冠词+数量词。中文数字 `十瓶`→10, `一百二十个`→120；英文数字词 `two dozen`→24。

**L2: 编排执行 (Orchestrator)**

意图 → 工具调用计划。findItem 未找到时，`pickName` 尊重 `found` flag 回退 keyword。delete 空 keyword → deleteAll。restructure 空 splits → LLM 生成拆分方案。

**L3: 上下文组装 (Context Assembly)**

注入系统提示词、仓库名、日期、语言指令、已验证结果、冲突检测。防编造指令：`hasOnlyQuery` → 禁止声称执行了操作；`hasFailedMutation` → 禁止声称成功。

**L4: 回复生成 (Response Generation)**

`streamText` **零工具**，仅基于 L3 注入的 verified results 生成文本。系统提示词明确：`you have no tools, the system already executed everything for you`。

**L5: 自纠正与学习 (Self-Correction)**

三重检测：编造检测（正则匹配成功声明 vs L2 实际执行）+ DB 硬校验（prisma 重查对比声称 vs 实际）+ LLM 语义检查。检测到问题 → 重新分类 → 重跑 L2 → 生成纠正回复 → 记录纠正 case → ≥3 条 → 生成候选正则。

## 支持的 AI 工具 (12 个)

| 工具 | 类型 | 功能 |
|------|------|------|
| `findItem` | 只读 | 模糊搜索，中→英 LLM 映射，未找到返回全量 |
| `stockIn` | 写入 | 入库，自动创建物品和位置，操作后查库验证 |
| `consumeItem` | 写入 | 出库，qty 归零自动删 Stock → Item（不留 orphan） |
| `moveItem` | 写入 | 移动物品，目标位置不存在自动创建 |
| `splitItem` | 写入 | 拆分重组，consume 源 + stockIn 新物品，均分库存 |
| `deleteItem` | 写入 | 单删/全删，空 kw → 遍历全仓库逐项清理 |
| `checkStock` | 只读 | 盘点长期未使用 + 损坏/过期物品 |
| `getSpots` | 只读 | 仓库位置树（树形层级） |
| `createItem` | 写入 | 手动创建新物品 |
| `updateStock` | 写入 | 修改库存（数量/状态/位置/保质期） |
| `listStores` | 只读 | 列出所有仓库 |
| `setAiName` | 写入 | 对话中改名，DB 持久化 |

## 技术难点

**LLM 幻觉消除**: L4 零工具剥夺能力 + L3 分层防编造指令 + L5 三重校验（正则+DB+LLM），编造检测到自动重跑全分层。

**中英双语正则引擎**: 6 个 signal 全部双语 + `isEnglish()` 自动检测语种 + findItem 内 LLM 中文→英文名映射。

**多物品消息拆分**: 从句连接词检测 → 独立 clause 分类 → Intent[] 循环执行。

**物品拆分重组**: `restructure` intent + `splitItem` 工具 + LLM 生成品牌列表 + 均分库存分配。

**导航打断流式**: `req.signal` 传 `streamText({ abortSignal })`，客户端断开仍触发 `onFinish` 保存。

**IME 回车防误发**: `isComposingRef` + `setTimeout(0)` 延迟清 flag + `nativeEvent.isComposing` 双保险。

## 数据库表结构

每个仓库独立 PostgreSQL 数据库，Prisma 自动初始化。7 张表：

| 表 | 核心字段 | 关系 |
|----|---------|------|
| Item | name (unique), category, desc | → Stock[Cascade], → Log[SetNull] |
| Spot | name, parentId (树形层级) | → Stock[Cascade] |
| Stock | itemId, spotId, qty, status, expiryDate | (itemId,spotId) 联合唯一 |
| Log | action, itemId, qty, fromSpot, toSpot, note | itemId, action, createdAt 索引 |
| Message | role, content, toolCalls(JSONB), tokenCount, aiName | createdAt 索引 |
| Summary | content (英文 LLM 压缩) | createdAt 索引 |
| Task | type, cron, lastRun, enabled | — |

## 配置

`warehouses.json` 每仓库支持独立配置：modelId、memorySize、contextMode、summaryEnabled、summaryThreshold、summaryCount、debugMode、customPrompt。

## 快速开始

Node.js 20+ / pnpm / PostgreSQL。`pnpm install` → 配 `.env` LLM Key → `pnpm dev` → 设置页加数据库。

## License

仅供个人非商业使用。详见 [LICENSE](./LICENSE) 文件。
