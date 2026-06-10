import { storeService } from "@/services/store.service";

export async function GET() {
  try {
    const warehouses = await storeService.listStores();
    return Response.json(warehouses);
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to list warehouses" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, host, port, user, password, database } = body;

    const result = await storeService.addStore(
      name,
      host,
      parseInt(port) || 5432,
      user,
      password,
      database
    );

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result, { status: 201 });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to add warehouse" },
      { status: 500 }
    );
  }
}
