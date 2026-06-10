import { storeService } from "@/services/store.service";

export async function POST(req: Request) {
  try {
    const { host, port, user, password, database } = await req.json();
    const result = await storeService.testConnection(
      host,
      parseInt(port) || 5432,
      user,
      password,
      database
    );
    return Response.json(result);
  } catch (error: any) {
    return Response.json(
      { success: false, error: error?.message || "Test failed" },
      { status: 500 }
    );
  }
}
