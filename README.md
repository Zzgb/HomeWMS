# HomeWMS — AI 驱动的个人仓库管理系统

用自然语言和 AI 对话来管理家里的物品库存。支持多仓库、独立数据库、AI 智能识别分类与保质期。
https://github.com/user-attachments/assets/0822e136-a825-4c23-be1e-91fc9949dbbb

## 功能亮点

- **自然语言对话** — 和 AI 助手「小鞠」聊天即可完成入库、出库、盘点、移动等操作
- **多仓库支持** — 每个仓库独立 PostgreSQL 数据库，数据完全隔离
- **AI 工具调用** — 9 个工具自动执行库存操作，支持多步调用，结果经 AI 格式化回复
- **智能分类识别** — 入库时 AI 自动推断物品分类（食品/工具/电子/日用品/药品）
- **保质期追踪** — 自动识别变质/过期状态，按日期计算过期
- **操作日志** — 所有 AI 操作完整记录，支持筛选查询
- **定时任务** — 支持 cron 表达式定时自动盘点
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
git clone https://github.com/your-username/homewms.git
cd homewms
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
├── tools/              # AI 工具（9 个）
├── services/           # 数据库操作封装
├── scheduler/          # 定时任务调度
├── lib/                # 配置管理、提示词、多语言
└── components/         # UI 组件
```

## 支持的 AI 工具

| 工具 | 功能 |
|------|------|
| `findItem` | 模糊搜索物品 |
| `stockIn` | 入库（自动创建物品和位置） |
| `consumeItem` | 出库 |
| `moveItem` | 移动物品 |
| `checkStock` | 盘点（长期未使用 + 损坏/过期） |
| `getSpots` | 查看仓库位置树 |
| `createItem` | 手动创建物品 |
| `listStores` | 列出所有仓库 |
| `setAiName` | 给 AI 助手改名 |

## 多仓库架构

每个仓库对应一个独立的 PostgreSQL 数据库连接，配置保存在项目根目录的 `warehouses.json` 中。添加仓库时系统自动建表并执行 Schema 迁移。

## License

本软件仅供个人非商业使用。禁止任何形式的商业用途（包括但不限于销售、租赁、SaaS 服务、商业部署）。详见 [LICENSE](./LICENSE) 文件。

This software is for personal, non-commercial use only. Any commercial use is prohibited.
