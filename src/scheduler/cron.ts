import { schedule, validate, ScheduledTask } from "node-cron";
import { listWarehouses, getWarehouseClient } from "@/lib/connections";

const runningJobs = new Map<string, ScheduledTask>();

function scheduleTask(id: string, cronExpr: string, warehouseId: string, type: string): void {
  if (!validate(cronExpr)) {
    console.error(`Invalid cron expression for task ${id}: ${cronExpr}`);
    return;
  }

  runningJobs.get(id)?.stop();

  const job = schedule(cronExpr, async () => {
    try {
      const prisma = getWarehouseClient(warehouseId);
      if (!prisma) {
        console.error(`Warehouse ${warehouseId} not connected for task ${id}`);
        return;
      }

      if (type === "check_stock") {
        const { inventoryService } = await import("@/services/inventory.service");
        const { messageService } = await import("@/services/message.service");
        const result = await inventoryService.checkStock(prisma, 30);
        console.log(`Scheduled stock check for warehouse ${warehouseId}:`, {
          unusedCount: result.unusedItems.length,
          damagedCount: result.damagedItems.length,
        });
        // Write result to chat
        const parts: string[] = [];
        if (result.damagedItems.length > 0) {
          const names = result.damagedItems.map((i) => i.itemName).join("、");
          parts.push(`损坏/过期物品 (${result.damagedItems.length}): ${names}`);
        }
        if (result.unusedItems.length > 0) {
          const names = result.unusedItems.slice(0, 10).map((i) => i.itemName).join("、");
          const more = result.unusedItems.length > 10 ? ` 等${result.unusedItems.length}项` : "";
          parts.push(`长期未使用 (${result.unusedItems.length}): ${names}${more}`);
        }
        const msg = parts.length > 0
          ? `[定时盘点] ${parts.join("; ")}`
          : `[定时盘点] 库存状态正常，无异常物品。`;
        await messageService.saveMessage(prisma, "assistant", msg);
      } else if (type === "expiry_check") {
        const { inventoryService } = await import("@/services/inventory.service");
        const { messageService } = await import("@/services/message.service");
        const result = await inventoryService.updateExpiryStatus(prisma);
        console.log(`Expiry check for warehouse ${warehouseId}: ${result.updated} stocks marked expired`);
        // Write result to chat
        const msg = result.updated > 0
          ? `[保质期检查] 发现 ${result.updated} 个库存已过期，已自动标记为过期状态。`
          : `[保质期检查] 未发现过期物品。`;
        await messageService.saveMessage(prisma, "assistant", msg);
      }
    } catch (error) {
      console.error(`Task ${id} failed:`, error);
    }
  });

  runningJobs.set(id, job);
}

async function refreshTasks(): Promise<void> {
  try {
    const warehouses = await listWarehouses();

    for (const wh of warehouses) {
      if (!wh.connected) continue;
      const prisma = getWarehouseClient(wh.id);
      if (!prisma) continue;

      let tasks: any[] = [];
      try {
        tasks = await prisma.task.findMany({ where: { enabled: true } });
      } catch {
        // Table may not exist yet — skip this warehouse
        continue;
      }

      for (const task of tasks) {
        const jobKey = `${wh.id}:${task.id}`;
        if (!runningJobs.has(jobKey)) {
          scheduleTask(jobKey, task.cron, wh.id, task.type);
        }
      }

      // Stop jobs for disabled/deleted tasks
      for (const [key, job] of runningJobs) {
        if (key.startsWith(`${wh.id}:`)) {
          const taskId = key.slice(wh.id.length + 1);
          if (!tasks.find((t) => t.id === taskId)) {
            job.stop();
            runningJobs.delete(key);
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to refresh tasks:", error);
  }
}

export async function initScheduler(): Promise<void> {
  console.log("[Scheduler] Initializing...");
  await refreshTasks();
  setInterval(refreshTasks, 60_000);
  console.log("[Scheduler] Initialized");
}
