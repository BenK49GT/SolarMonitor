import { connection } from "next/server";

import { sampleSnapshot } from "@/lib/sample";
import { getSolar } from "@/lib/solar";

export async function GET() {
  await connection();
  try {
    const snapshot = await getSolar();
    return Response.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The monitor failed to read the gateway";
    return Response.json(sampleSnapshot(message));
  }
}
