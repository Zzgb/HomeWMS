# HomeWMS — AI-Powered Personal Warehouse Management

[中文](./README.md) | English

Natural language AI chat interface for home inventory tracking. Multi-warehouse isolated PostgreSQL databases, 5-layer Agent architecture with self-correction, bilingual regex engine, and item splitting/restructuring.

https://github.com/user-attachments/assets/0822e136-a825-4c23-be1e-91fc9949dbbb

## Features

- **Chat-Driven Inventory** — Stock in, consume, move, split, and audit items by talking to AI assistant "小鞠" (Xiao Ju)
- **5-Layer Agent Architecture** — L1 Intent → L2 Orchestration → L3 Context → L4 Response → L5 Self-Correction. Each layer has strict boundaries to eliminate AI hallucination
- **Bilingual Regex Engine** — Chinese + English L0 pattern matching with automatic language detection, covering 90%+ daily commands. Keyword extraction, quantity parsing, and location extraction all dual-path
- **Item Splitting & Restructuring** — "Split by brand": break a merged item into sub-items (e.g. "Cola" → "Coke Zero" + "Pepsi Zero" + "Regular Pepsi") with LLM-generated splits and automatic stock distribution
- **Self-Correction & Learning** — L5 detects AI fabrication, runs DB verification, triggers correction re-runs, and learns regex patterns from accumulated correction cases
- **Multi-Warehouse Isolation** — Each warehouse maps to an independent PostgreSQL database; `warehouses.json` manages connections
- **Expiry Tracking** — String date comparison (`expiryDate < today`) determines expiry status; scheduled expiry checks via cron
- **12 AI Tools** — findItem / stockIn / consumeItem / moveItem / splitItem / deleteItem / checkStock / getSpots / createItem / updateStock / listStores / setAiName
- **Scheduled Tasks** — Cron-based auto inventory checks and expiry monitoring with visual frontend management
- **Multi-LLM** — DeepSeek / OpenAI / Claude / Gemini / OpenRouter, switchable per warehouse
- **Bilingual UI** — Full zh/en support across Chat, Inventory, Logs, and Settings pages
- **Full Audit Trail** — AI + manual operation logs with action type, quantity, location, and timestamp filtering

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | TailwindCSS v4 + shadcn/ui |
| Database | PostgreSQL + Prisma 7 (PG adapter) |
| AI | Vercel AI SDK v6 (`streamText` + `generateText` + `tool`) |
| Scheduling | node-cron (60s DB polling, dynamic task loading) |

## 5-Layer Agent Architecture

```
User Message
  │
  ▼
┌──────────────────────────────────────────────┐
│ L1: Intent Classification                     │
│   L0 Bilingual Regex (90%+) → L1 generateText │
│   Multi-item splitting → Intent[]             │
├──────────────────────────────────────────────┤
│ L2: Orchestration                             │
│   buildPlan(Intent) → CallStep[]              │
│   Sequential execution, findItem gating       │
│   pickName/pickSpot respect found flag        │
├──────────────────────────────────────────────┤
│ L3: Context Assembly                          │
│   System prompt, warehouse, date, language    │
│   ✅ success / ❌ failure / ⚠️ conflicts       │
│   Anti-fabrication guardrails                 │
├──────────────────────────────────────────────┤
│ L4: Response Generation                       │
│   streamText with ZERO tools — LLM is read-only│
│   Generates text from L3 verified results only │
├──────────────────────────────────────────────┤
│ L5: Self-Correction & Learning                │
│   Fabrication detection + DB verification      │
│   + LLM semantic check                        │
│   Detection → re-classify → re-run L2 → fix    │
│   Correction cases ≥3 → generate regex        │
└──────────────────────────────────────────────┘
```

### L1: Intent Classification

Six intent types. L0 bilingual regex handles 90%+ patterns; L1 `generateText` covers edge cases.

| Intent | Chinese Signals | English Signals |
|--------|----------------|-----------------|
| `consume` | 吃了/喝了/扔了/用完了/过期/出库 | ate/drank/used/finished/threw/discarded |
| `stockIn` | 买了/入库/放进/添加/采购 | bought/purchased/got/added/stocked |
| `move` | 搬到/移到/挪到/搬了/位置不对 | moved/relocated/transferred/shifted |
| `restructure` | 分品牌/拆分/分割/重组/分成 | split/separate/break down/reorganize |
| `delete` | 删除/去掉/移除/清空 | delete/remove/clear |
| `query` | 盘点/查看/库存/在哪/还有 | check/look/how many/where/inventory |

**Keyword extraction** adapts per language: Chinese strips verbs + measure words + particles; English strips verbs + prepositions + articles + quantity words. **Quantity parsing**: Arabic + Chinese numerals (`二十`→20, `一百二`→120) + English number words (`two dozen`→24). **Multi-item splitting**: detects clause conjunctions (又/还/也/and also/and then) → independent clause classification → `Intent[]`. **Complaint fallback**: keyword matches complaint patterns → downgrade to query.

### L2: Orchestration

Intent → `buildPlan()` → `CallStep[]` → `executePlan()` → sequential execution.

| Intent | Plan |
|--------|------|
| `query` | findItem |
| `consume` | findItem → consumeItem |
| `stockIn` | findItem → stockIn(target ∥ pickSpot) |
| `move` | findItem → moveItem(target ∥ pickSpot) |
| `delete` | findItem → deleteItem(found===false ? "" : pickName) |
| `restructure` | findItem → resolveSplitsViaLLM → splitItem |

`pickName`/`pickSpot` respect findItem's `found` flag, falling back to keyword/target when not found. Delete with empty keyword → `deleteItem("")` clears the entire warehouse. Restructure with empty splits → LLM generates brands → splitItem distributes stock evenly.

### L3: Context Assembly

Injects `SYSTEM_PROMPT` (zero-tool rule + bilingual DB warning), AI name, warehouse name, today's date, language instruction, verified/failed/conflict results. Anti-fabrication guards: `hasOnlyQuery` → forbids claiming operations were performed; `hasFailedMutation` → forbids claiming success.

### L4: Response Generation

`streamText` with **zero tools**. The LLM receives only verified results from L3. System prompt explicitly states: `you have no tools, the system already executed everything for you`. `onFinish` saves messages to the `Message` table.

### L5: Self-Correction & Learning

Three detection layers: (1) Fabrication detection via regex matching success claims against L2 execution; (2) DB verification via `verifyDB()` re-querying and comparing claims vs actual; (3) LLM semantic check comparing user intent vs execution vs response. Correction: detection → re-classify → re-run L2 → generate fix. Regex learning: correction cases ≥3 → LLM extracts keyword patterns → generates candidate regex.

## Project Structure

```
src/
├── agent/
│   ├── intent/            # L1: classifier.ts + types.ts
│   ├── orchestrator/      # L2: matcher.ts + executor.ts + types.ts
│   ├── context/           # L3: assembler.ts + compose.ts + conflict.ts + types.ts
│   ├── response/          # L4: generator.ts + types.ts
│   ├── correction/        # L5: checker.ts + learner.ts
│   ├── index.ts           # Agent entry — wires all 5 layers
│   ├── router.ts          # LLM routing (5 providers)
│   └── summarizer.ts      # Conversation compression
├── tools/                 # 12 AI tools (factory pattern)
├── services/              # Prisma CRUD (inventory + message)
├── app/
│   ├── api/chat/          # Chat API (5-layer entry)
│   ├── api/inventory/     # Inventory CRUD
│   ├── api/logs/          # Activity logs
│   ├── api/stores/        # Warehouse CRUD + connection test
│   ├── api/settings/      # Model/memory config
│   ├── api/tasks/         # Scheduled tasks
│   ├── chat/              # Chat UI (bilingual)
│   ├── inventory/         # Inventory UI (bilingual)
│   ├── logs/              # Log viewer (bilingual)
│   └── settings/          # Settings dashboard
├── scheduler/cron.ts      # node-cron scheduler
├── lib/
│   ├── prompts.ts         # System prompts
│   ├── i18n.tsx           # zh/en (~150 keys)
│   ├── connections.ts     # Multi-warehouse + schema migration
│   └── constants.ts       # Global defaults
└── components/ui/         # shadcn/ui primitives
```

## Database Schema

Per-warehouse PostgreSQL database, 7 tables (Prisma auto-migrates):

| Table | Key Columns | Relations |
|-------|------------|-----------|
| **Item** | id, name(unique), desc, category | → Stock[Cascade], → Log[SetNull] |
| **Spot** | id, name, parentId (tree self-ref) | → Stock[Cascade] |
| **Stock** | id, itemId, spotId, qty, status, expiryDate | (itemId, spotId) unique |
| **Log** | id, itemId, action, qty, fromSpot, toSpot, note | Indexed: itemId, action, createdAt |
| **Message** | id, role, content, toolCalls(JSONB), tokenCount, aiName | Indexed: createdAt |
| **Summary** | id, content (LLM compressed, English) | Indexed: createdAt |
| **Task** | id, type, cron, lastRun, enabled | — |

## Configuration

Per-warehouse in `warehouses.json`:

| Field | Description | Default |
|-------|------------|---------|
| `modelId` | LLM model | `deepseek/deepseek-v4-flash` |
| `memorySize` | Recent messages in context (50-2000) | 200 |
| `contextMode` | recent / summary / hybrid | recent |
| `summaryEnabled` | Enable summary compression | false |
| `summaryThreshold` | Messages to trigger summary (10-500) | 50 |
| `summaryCount` | Summaries in context (1-10) | 3 |
| `debugMode` | Log full context to Log table | false |

## Deployment

### Local Deployment (the only currently supported method)

Vercel / Docker deployment is not yet supported (warehouse config persistence is under development).

```bash
git clone https://github.com/Zzgb/HomeWMS.git
cd HomeWMS
pnpm install
# Create .env with DEEPSEEK_API_KEY + CRON_SECRET
cp .env.example .env
npx prisma generate
pnpm dev   # Development mode
# or
pnpm build && pnpm start  # Production mode, use PM2 or systemd
```

Open `http://localhost:3000` → Settings → add PostgreSQL connection (local or remote, standard PostgreSQL).

External cron (optional): `curl -X POST http://localhost:3000/api/cron/run?secret=your-cron-secret`

### Deployment Support Status

| Method | Status | Notes |
|--------|--------|-------|
| Local Node.js | ✅ Supported | `warehouses.json` based connection management |
| Vercel | 🚧 In progress | Needs `DATABASE_URL` env var bootstrap + `StoreMeta` table persistence |
| Docker | 🚧 In progress | Env var injection + volume mount for warehouses.json |

---

## Roadmap

### P0 — Deployment & Configuration

- [ ] **Vercel deployment persistence** — `DATABASE_URL` env var auto-bootstrap for default warehouse, `StoreMeta` table for persisting warehouse configs (solves Vercel ephemeral filesystem issue where `warehouses.json` writes are lost)
- [ ] **Deployment method selector** — Settings page deployment mode (Local / Vercel / Docker), database connection fields adapt accordingly
- [ ] **Custom prompt verification** — Confirm settings API GET/PUT customPrompt works, customPrompt overrides SYSTEM_PROMPT correctly

### P0 — AI Rules Frontend

- [ ] **Settings page: all AI rules** — L0 regex patterns list + custom prompt editor + L1 classifier prompt display + L5 regex candidate approval entry
- [ ] **Regex learning approval UI** — Learner.ts writes candidate regex to Log(action=regex_candidate); needs settings/chat UI to display candidates → user approve/reject/modify → approved regex stored in StoreMeta, loaded dynamically by L0

### P1 — Feature Enhancements

- [ ] Scheduled check results output to chat page (scheduler → write to Message table)
- [ ] Delete chat history (compressed summary delete + full delete)
- [ ] Summary compression toggle/frequency settings

## License

Personal, non-commercial use only. See [LICENSE](./LICENSE).
