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

export function getWarehouseClient(warehouseId: string): PrismaClient | null {
  if (clientCache.has(warehouseId)) {
    return clientCache.get(warehouseId)!;
  }

  const warehouses = readWarehouses();
  const cfg = warehouses.get(warehouseId);
  if (!cfg) return null;

  try {
    const url = buildUrl(cfg);
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    clientCache.set(warehouseId, client);

    // Fix old schema on first connection (fire-and-forget, non-blocking)
    if (!schemaFixed.has(warehouseId)) {
      schemaFixed.add(warehouseId);
      Promise.all([
        client.$executeRawUnsafe(`ALTER TABLE "Log" DROP COLUMN IF EXISTS "storeId"`),
        client.$executeRawUnsafe(`ALTER TABLE "Message" DROP COLUMN IF EXISTS "storeId"`),
        client.$executeRawUnsafe(`ALTER TABLE "Summary" DROP COLUMN IF EXISTS "storeId"`),
        client.$executeRawUnsafe(`ALTER TABLE "Item" DROP COLUMN IF EXISTS "storeId"`),
        client.$executeRawUnsafe(`ALTER TABLE "Spot" DROP COLUMN IF EXISTS "storeId"`),
        client.$executeRawUnsafe(`ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3)`),
        client.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiName" TEXT`),
      ]).catch(() => {});
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
      createdAt: cfg.createdAt,
    });
  }

  return results;
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
  `;
  await client.$executeRawUnsafe(sql);
}
