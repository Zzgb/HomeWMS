import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";

// ── Config file in project root ──
const WAREHOUSES_FILE = path.resolve(process.cwd(), "warehouses.json");
console.log("[HomeWMS] Warehouses config file:", WAREHOUSES_FILE);

export function getWarehousesFilePath(): string {
  return WAREHOUSES_FILE;
}

// ── Types ──
export interface WarehouseConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  modelId?: string;
  memorySize?: number;
  customPrompt?: string;
  summaryEnabled?: boolean;
  summaryThreshold?: number;
  summaryCount?: number;
  contextMode?: string;
  debugMode?: boolean;
  deploymentMode?: "local" | "vercel" | "docker";
  createdAt: string;
}

export interface WarehouseListItem {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  database: string;
  connected: boolean;
  error?: string;
  modelId?: string;
  memorySize?: number;
  summaryEnabled?: boolean;
  summaryThreshold?: number;
  summaryCount?: number;
  contextMode?: string;
  debugMode?: boolean;
  deploymentMode?: "local" | "vercel" | "docker";
  createdAt: string;
}

// ── Client cache ──
const clientCache = new Map<string, PrismaClient>();
const schemaFixed = new Set<string>();

function buildUrl(cfg: WarehouseConfig): string {
  const encodedPassword = encodeURIComponent(cfg.password);
  const db = cfg.database || cfg.user;
  return `postgresql://${cfg.user}:${encodedPassword}@${cfg.host}:${cfg.port}/${db}`;
}

// ── JSON file read/write ──
function readWarehouses(): Map<string, WarehouseConfig> {
  const map = new Map<string, WarehouseConfig>();
  try {
    if (fs.existsSync(WAREHOUSES_FILE)) {
      const raw = fs.readFileSync(WAREHOUSES_FILE, "utf-8");
      const arr: WarehouseConfig[] = JSON.parse(raw);
      for (const cfg of arr) {
        map.set(cfg.id, cfg);
      }
    }
  } catch {
    // File missing or corrupt, return empty
  }
  return map;
}

function writeWarehouses(warehouses: Map<string, WarehouseConfig>): void {
  const arr = Array.from(warehouses.values());
  fs.writeFileSync(WAREHOUSES_FILE, JSON.stringify(arr, null, 2), "utf-8");
}

// ── Public API ──

export async function testConnection(
  host: string,
  port: number,
  user: string,
  password: string,
  database: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const pool = new Pool({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 5000,
  });
  try {
    const client = await pool.connect();
    const res = await client.query("SELECT version()");
    client.release();
    return {
      success: true,
      message: `Connected: ${res.rows[0]?.version?.split(",")[0] || "PostgreSQL"}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  } finally {
    await pool.end();
  }
}

function bootstrapFromEnv(): WarehouseConfig | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      id: "wh_default",
      name: "默认仓库",
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      user: parsed.username || "",
      password: parsed.password || "",
      database: parsed.pathname.slice(1) || "postgres",
      deploymentMode: "vercel",
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getWarehouseClient(warehouseId: string): PrismaClient | null {
  if (clientCache.has(warehouseId)) {
    return clientCache.get(warehouseId)!;
  }

  const warehouses = readWarehouses();

  // Auto-bootstrap from DATABASE_URL if no warehouses configured
  if (warehouses.size === 0) {
    const bootCfg = bootstrapFromEnv();
    if (bootCfg) {
      warehouses.set(bootCfg.id, bootCfg);
    }
  }

  const cfg = warehouses.get(warehouseId);
  if (!cfg) return null;

  try {
    const url = buildUrl(cfg);
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    clientCache.set(warehouseId, client);

    // Fix old schema on first connection (separate pool to avoid lock contention)
    if (!schemaFixed.has(warehouseId)) {
      schemaFixed.add(warehouseId);
      const fixPool = new Pool({ connectionString: url, max: 1 });
      Promise.all([
        fixPool.query(`ALTER TABLE "Log" DROP COLUMN IF EXISTS "storeId"`),
        fixPool.query(`ALTER TABLE "Message" DROP COLUMN IF EXISTS "storeId"`),
        fixPool.query(`ALTER TABLE "Summary" DROP COLUMN IF EXISTS "storeId"`),
        fixPool.query(`ALTER TABLE "Item" DROP COLUMN IF EXISTS "storeId"`),
        fixPool.query(`ALTER TABLE "Spot" DROP COLUMN IF EXISTS "storeId"`),
        fixPool.query(`ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3)`),
        fixPool.query(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiName" TEXT`),
      ]).catch(() => {}).finally(() => fixPool.end());
    }

    return client;
  } catch (err: any) {
    console.error(`Failed to create PrismaClient for warehouse ${warehouseId}:`, err.message);
    return null;
  }
}

export function disconnectWarehouse(warehouseId: string): void {
  const client = clientCache.get(warehouseId);
  if (client) {
    client.$disconnect().catch(() => {});
    clientCache.delete(warehouseId);
  }
}

export async function addWarehouse(
  name: string,
  host: string,
  port: number,
  user: string,
  password: string,
  database: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const test = await testConnection(host, port, user, password, database);
  if (!test.success) {
    return { success: false, error: test.error || "Connection failed" };
  }

  try {
    const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cfg: WarehouseConfig = {
      id,
      name,
      host,
      port,
      user,
      password,
      database,
      createdAt: new Date().toISOString(),
    };

    const url = buildUrl(cfg);
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });

    try {
      await initSchema(client);
    } finally {
      await client.$disconnect();
    }

    const warehouses = readWarehouses();
    warehouses.set(id, cfg);
    writeWarehouses(warehouses);

    return { success: true, id };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export function removeWarehouse(id: string): { success: boolean; error?: string } {
  try {
    disconnectWarehouse(id);
    const warehouses = readWarehouses();
    if (!warehouses.has(id)) {
      return { success: false, error: "Warehouse not found" };
    }
    warehouses.delete(id);
    writeWarehouses(warehouses);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export function updateWarehouse(
  id: string,
  updates: {
    name?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    modelId?: string;
    memorySize?: number;
    customPrompt?: string;
    summaryEnabled?: boolean;
    summaryThreshold?: number;
    summaryCount?: number;
    contextMode?: string;
    debugMode?: boolean;
    deploymentMode?: "local" | "vercel" | "docker";
  }
): { success: boolean; error?: string } {
  try {
    const warehouses = readWarehouses();
    const cfg = warehouses.get(id);
    if (!cfg) return { success: false, error: "Warehouse not found" };

    if (updates.name !== undefined) cfg.name = updates.name;
    if (updates.host !== undefined) cfg.host = updates.host;
    if (updates.port !== undefined) cfg.port = updates.port;
    if (updates.user !== undefined) cfg.user = updates.user;
    if (updates.password !== undefined) cfg.password = updates.password;
    if (updates.database !== undefined) cfg.database = updates.database;
    if (updates.modelId !== undefined) cfg.modelId = updates.modelId;
    if (updates.memorySize !== undefined) cfg.memorySize = updates.memorySize;
    if (updates.customPrompt !== undefined) cfg.customPrompt = updates.customPrompt;
    if (updates.summaryEnabled !== undefined) cfg.summaryEnabled = updates.summaryEnabled;
    if (updates.summaryThreshold !== undefined) cfg.summaryThreshold = updates.summaryThreshold;
    if (updates.summaryCount !== undefined) cfg.summaryCount = updates.summaryCount;
    if (updates.contextMode !== undefined) cfg.contextMode = updates.contextMode;
    if (updates.debugMode !== undefined) cfg.debugMode = updates.debugMode;
    if (updates.deploymentMode !== undefined) cfg.deploymentMode = updates.deploymentMode;
    warehouses.set(id, cfg);
    writeWarehouses(warehouses);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export async function listWarehouses(): Promise<WarehouseListItem[]> {
  const warehouses = readWarehouses();
  const results: WarehouseListItem[] = [];

  for (const [id, cfg] of warehouses) {
    const test = await testConnection(cfg.host, cfg.port, cfg.user, cfg.password, cfg.database);
    results.push({
      id,
      name: cfg.name,
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      database: cfg.database,
      connected: test.success,
      error: test.success ? undefined : test.error,
      modelId: cfg.modelId,
      memorySize: cfg.memorySize,
      summaryEnabled: cfg.summaryEnabled,
      summaryThreshold: cfg.summaryThreshold,
      summaryCount: cfg.summaryCount,
      contextMode: cfg.contextMode,
      debugMode: cfg.debugMode,
      deploymentMode: cfg.deploymentMode || "local",
      createdAt: cfg.createdAt,
    });
  }

  return results;
}

// ── StoreMeta helpers ──
export async function loadStoreMeta(prisma: PrismaClient): Promise<Record<string, string>> {
  try {
    const rows = await (prisma as any).storeMeta.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  } catch {
    return {};
  }
}

export async function saveStoreMeta(prisma: PrismaClient, settings: Record<string, string>): Promise<void> {
  try {
    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) continue;
      await (prisma as any).storeMeta.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  } catch {}
}

// ── LLMConfig helpers ──
export async function loadLLMConfigs(prisma: PrismaClient): Promise<Array<{ provider: string; apiKey: string; baseURL: string | null }>> {
  try {
    return await (prisma as any).lLMConfig.findMany();
  } catch {
    return [];
  }
}

export async function saveLLMConfig(prisma: PrismaClient, provider: string, apiKey: string, baseURL?: string): Promise<void> {
  try {
    await (prisma as any).lLMConfig.upsert({
      where: { provider },
      update: { apiKey, baseURL: baseURL || null },
      create: { provider, apiKey, baseURL: baseURL || null },
    });
  } catch {}
}

export async function deleteLLMConfig(prisma: PrismaClient, provider: string): Promise<void> {
  try {
    await (prisma as any).lLMConfig.deleteMany({ where: { provider } });
  } catch {}
}

export function getWarehouseConfig(id: string): WarehouseConfig | null {
  const warehouses = readWarehouses();
  return warehouses.get(id) || null;
}

// ── Schema initialization ──
async function initSchema(client: PrismaClient): Promise<void> {
  // Fix old schema: drop storeId columns from old single-DB days
  try { await client.$executeRawUnsafe(`ALTER TABLE "Item" DROP COLUMN IF EXISTS "storeId"`); } catch {}
  try { await client.$executeRawUnsafe(`ALTER TABLE "Spot" DROP COLUMN IF EXISTS "storeId"`); } catch {}
  try { await client.$executeRawUnsafe(`ALTER TABLE "Log" DROP COLUMN IF EXISTS "storeId"`); } catch {}
  try { await client.$executeRawUnsafe(`ALTER TABLE "Message" DROP COLUMN IF EXISTS "storeId"`); } catch {}
  try { await client.$executeRawUnsafe(`ALTER TABLE "Summary" DROP COLUMN IF EXISTS "storeId"`); } catch {}

  const sql = `
    CREATE TABLE IF NOT EXISTS "Item" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "desc" TEXT,
      "category" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Spot" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "parentId" TEXT REFERENCES "Spot"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Stock" (
      "id" TEXT PRIMARY KEY,
      "itemId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE CASCADE,
      "spotId" TEXT NOT NULL REFERENCES "Spot"("id") ON DELETE CASCADE,
      "qty" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'normal',
      "expiryDate" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("itemId", "spotId")
    );
    CREATE TABLE IF NOT EXISTS "Log" (
      "id" TEXT PRIMARY KEY,
      "itemId" TEXT REFERENCES "Item"("id") ON DELETE SET NULL,
      "action" TEXT NOT NULL,
      "qty" INTEGER,
      "fromSpot" TEXT,
      "toSpot" TEXT,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT PRIMARY KEY,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "toolCalls" JSONB,
      "tokenCount" INTEGER,
      "aiName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Summary" (
      "id" TEXT PRIMARY KEY,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Task" (
      "id" TEXT PRIMARY KEY,
      "type" TEXT NOT NULL,
      "cron" TEXT NOT NULL,
      "lastRun" TIMESTAMP(3),
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "StoreMeta" (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "LLMConfig" (
      "id" TEXT PRIMARY KEY,
      "provider" TEXT NOT NULL UNIQUE,
      "apiKey" TEXT NOT NULL,
      "baseURL" TEXT
    );
  `;
  await client.$executeRawUnsafe(sql);
}
