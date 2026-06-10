# HomeWMS — AI 驱动的个人仓库管理系统

## 架构

```
用户 → 聊天 UI → LLM Router → Agent → Tool → Service → PostgreSQL
```

### 技术栈
Next.js 15 + TypeScript + TailwindCSS v4 + shadcn/ui + PostgreSQL + Prisma 7 + Vercel AI SDK v6 + node-cron

### 目录
```
src/
├── app/api/chat/       # 核心对话 + 历史
├── app/api/inventory/  # 库存 + 盘点
├── app/api/logs/       # 操作日志
├── app/api/stores/     # 仓库 CRUD + 测试连接
├── app/api/settings/   # 模型/记忆配置
├── app/api/tasks/      # 定时任务
├── lib/connections.ts  # 多仓库连接管理(warehouses.json)
├── lib/prompts.ts      # AI 提示词
├── lib/i18n.tsx        # 多语言(zh/en/ja)
├── services/           # Prisma 查询封装
├── tools/              # AI 工具(8个,工厂模式)
├── agent/router.ts     # LLM 路由(5厂商)
├── agent/context.ts    # 上下文组装
├── agent/summarizer.ts # 摘要压缩
└── scheduler/cron.ts   # 定时调度器
```

### 配置
- `.env` — LLM API Key + CRON_SECRET
- `warehouses.json` — 仓库连接 + 模型/记忆设置

### 数据库(每仓库独立 PG)
Item / Spot(树) / Stock / Log(全部操作) / Message(聊天) / Summary(英文摘要) / Task(定时)

---

## 上下文与记忆

```
用户消息 → 存 Message 表
→ assembleContext(): 系统提示词 + 仓库名 + 最新3条Summary + 最近N条Message
→ streamText({ tools, stopWhen: stepCountIs(5) })
→ AI调用工具 → 写Log → 生成中文回复
→ 存AI回复到Message(含toolCalls) → maybeSummarize(每50条触发)
```

- **摘要**: 只压工具操作对话,英文,50条阈触发,存 Summary 表
- **短期上下文**: memorySize(默认200), 存在仓库 DB 的 Message 表
- **切换仓库**: 加载新仓库全量聊天记录

---

## 完成状态

### ✅ 已完成
- 多仓库连接(warehouses.json) + DataGrip 表单
- AI 对话(DeepSeek/OpenAI/Claude/Gemini/OpenRouter)
- 8 个工具(findItem/stockIn/consumeItem/moveItem/checkStock/getSpots/createItem/listStores)
- 聊天记录持久化(保存+加载+时间戳)
- 库存表格 + 盘点对话框
- 操作日志(全部AI操作:查询/入库/出库/移动/盘点)
- 设置页(模型/仓库/记忆/任务/语言)
- 多语言框架(Nav 支持 zh/en/ja)
- 小鞠人格 + 反幻觉规则
- stepCountIs(5) 多步调用
- 仓库选择器 + 过期ID清理
- 库存页 CRUD（新增/编辑/删除物品+库存，API POST/PUT/DELETE）
- 保质期追踪（Stock.expiryDate，stockIn 工具+手动表单均支持，自动过期检测）
- AI 名称替代"助手"（Message.aiName，设置页配置，提示词注入，改名同步历史消息）
- 聊天标题（{AI名} AI 替代仓库名）
- UI 现代化（全站玻璃效果 backdrop-blur，输入框 44→80px）
- 用户消息气泡空白修复（w-fit + max-w-[70%]）

### ❌ 待办

- [ ] 定时盘点结果输出到聊天页（需改 scheduler → 写入 Message）
- [ ] 摘要压缩开关/频率 + 上下文联想来源设置
- [ ] 语言切换完整翻译（当前仅 Nav）
- [ ] initSchema 兼容更多旧表场景
