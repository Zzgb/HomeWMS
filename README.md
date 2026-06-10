# HomeWMS — AI 驱动的个人仓库管理系统

用自然语言和 AI 对话来管理家里的物品库存。支持多仓库、独立数据库、AI 智能识别分类与保质期。

https://github.com/user-attachments/assets/0822e136-a825-4c23-be1e-91fc9949dbbb

## 功能亮点

- **自然语言对话** — 和 AI 助手「小鞠」聊天即可完成入库、出库、盘点、移动等操作
- **多仓库支持** — 每个仓库独立 PostgreSQL 数据库，数据完全隔离
- **AI 工具调用** — 11 个工具自动执行库存操作，支持多步调用，结果经 AI 格式化回复
- **智能分类识别** — 入库时 AI 自动推断物品分类（食品/工具/电子/日用品/药品）
- **保质期追踪** — 自动识别变质/过期状态，按日期计算过期，定时任务自动更新
- **操作日志** — 所有 AI 操作完整记录，支持筛选查询
- **定时任务** — 支持 cron 表达式，自动盘点、保质期检查
- **多 LLM 支持** — DeepSeek / OpenAI / Claude / Gemini / OpenRouter 自由切换

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | TailwindCSS v4 + shadcn/ui |
| 数据库 | PostgreSQL + Prisma 7 (PG adapter) |
| AI | Vercel AI SDK v6 (`streamText` + `tool`) |
| 调度 | node-cron |
| 部署 | Vercel / Docker / 自托管 |

## 快速开始

### 前置条件

- Node.js 20+
- pnpm
- PostgreSQL（本地或远程均可）

### 1. 克隆项目

```bash
git clone https://github.com/Zzgb/HomeWMS.git
cd HomeWMS
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```env
# 至少配置一个 LLM API Key
DEEPSEEK_API_KEY=sk-your-key
# OPENAI_API_KEY=sk-your-key
# ANTHROPIC_API_KEY=sk-your-key
# GOOGLE_GENERATIVE_AI_API_KEY=your-key
# OPENROUTER_API_KEY=sk-your-key

# 定时任务密钥
CRON_SECRET=your-random-secret
```

### 4. 启动开发服务器

```bash
pnpm dev
```

打开 `http://localhost:3000`，进入设置页添加你的 PostgreSQL 数据库连接即可开始使用。

## 项目结构

```
src/
├── app/
│   ├── api/chat/       # AI 对话 API
│   ├── api/inventory/  # 库存 CRUD + 盘点
│   ├── api/logs/       # 操作日志查询
│   ├── api/stores/     # 仓库连接管理
│   ├── api/settings/   # 模型/记忆配置
│   ├── api/tasks/      # 定时任务管理
│   ├── chat/           # 聊天页面
│   ├── inventory/      # 库存管理页面
│   ├── logs/           # 操作日志页面
│   └── settings/       # 设置页面
├── agent/              # LLM 路由 + 上下文组装 + 摘要
├── tools/              # AI 工具（11 个）
├── services/           # 数据库操作封装
├── scheduler/          # 定时任务调度
├── lib/                # 配置管理、提示词、多语言
└── components/         # UI 组件
```

## 数据库表结构

每个仓库独立数据库，包含以下 7 张表：

### Item（物品）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `name` | TEXT (NOT NULL) | 物品名称 |
| `desc` | TEXT | 描述/备注 |
| `category` | TEXT | 分类：食品/工具/电子/日用品/药品/其他 |
| `createdAt` | TIMESTAMP | 创建时间 |
| `updatedAt` | TIMESTAMP | 更新时间 |

### Spot（存放位置）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `name` | TEXT (NOT NULL) | 位置名称，如"冰箱"、"储物架" |
| `parentId` | TEXT (FK → Spot) | 父位置 ID，支持树形层级 |
| `createdAt` | TIMESTAMP | 创建时间 |
| `updatedAt` | TIMESTAMP | 更新时间 |

### Stock（库存）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `itemId` | TEXT (FK → Item, CASCADE) | 物品 ID |
| `spotId` | TEXT (FK → Spot, CASCADE) | 位置 ID |
| `qty` | INTEGER (DEFAULT 0) | 当前数量 |
| `status` | TEXT (DEFAULT 'normal') | 状态：normal / damaged / expired |
| `expiryDate` | TIMESTAMP | 保质期截止日期 |
| `updatedAt` | TIMESTAMP | 更新时间 |
| | | `(itemId, spotId)` 联合唯一索引 |

### Log（操作日志）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `itemId` | TEXT (FK → Item, SET NULL) | 关联物品 |
| `action` | TEXT (NOT NULL) | 操作类型：in / out / move / adjust / expire / query / rename |
| `qty` | INTEGER | 涉及数量 |
| `fromSpot` | TEXT | 来源位置（出库/移动） |
| `toSpot` | TEXT | 目标位置（入库/移动） |
| `note` | TEXT | 操作备注 |
| `createdAt` | TIMESTAMP | 操作时间 |

### Message（聊天消息）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `role` | TEXT (NOT NULL) | 角色：user / assistant / system |
| `content` | TEXT (NOT NULL) | 消息内容 |
| `toolCalls` | JSONB | 工具调用记录（名称、参数、结果） |
| `tokenCount` | INTEGER | Token 消耗统计 |
| `aiName` | TEXT | 当时的 AI 名称（用于改名追踪） |
| `createdAt` | TIMESTAMP | 发送时间 |

### Summary（摘要）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `content` | TEXT (NOT NULL) | 摘要内容 |
| `createdAt` | TIMESTAMP | 生成时间 |

### Task（定时任务）

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT (PK) | CUID 主键 |
| `type` | TEXT (NOT NULL) | 任务类型：check_stock / expiry_check |
| `cron` | TEXT (NOT NULL) | Cron 表达式 |
| `lastRun` | TIMESTAMP | 上次执行时间 |
| `enabled` | BOOLEAN (DEFAULT true) | 是否启用 |
| `createdAt` | TIMESTAMP | 创建时间 |
| `updatedAt` | TIMESTAMP | 更新时间 |

## 支持的 AI 工具

| 工具 | 功能 |
|------|------|
| `findItem` | 模糊搜索物品及库存 |
| `stockIn` | 入库（自动创建物品和位置，支持保质期、分类、状态） |
| `consumeItem` | 出库（扣减数量，清零自动删除） |
| `moveItem` | 移动物品到其他位置 |
| `checkStock` | 盘点（长期未使用 + 损坏/过期物品） |
| `getSpots` | 查看仓库位置树 |
| `createItem` | 手动创建物品 |
| `deleteItem` | 删除物品及所有库存 |
| `updateStock` | 修改库存（数量/状态/位置/保质期） |
| `listStores` | 列出所有仓库 |
| `setAiName` | 给 AI 助手改名 |

## 多仓库架构

每个仓库对应一个独立的 PostgreSQL 数据库，连接配置保存在项目根目录的 `warehouses.json` 中。

添加仓库时系统自动执行：
- 创建以上 7 张表
- 修补旧版本 Schema（删除冗余列、新增缺失列）

所有数据完全隔离，互不影响。

## License

本开源代码仅供个人非商业使用。禁止任何形式的商业用途（包括但不限于销售、租赁、SaaS 服务、商业部署）。详见 [LICENSE](./LICENSE) 文件。

This source code is for personal, non-commercial use only. Any commercial use is prohibited.
