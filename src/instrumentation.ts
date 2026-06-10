export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initScheduler } = await import("@/scheduler/cron");
    await initScheduler();
  }
}
