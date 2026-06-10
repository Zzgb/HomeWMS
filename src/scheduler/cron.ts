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
        const result = await inventoryService.checkStock(prisma, 30);
        console.log(`Scheduled stock check for warehouse ${warehouseId}:`, {
          unusedCount: result.unusedItems.length,
          damagedCount: result.damagedItems.length,
        });
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
