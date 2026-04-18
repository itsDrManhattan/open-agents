import { NextResponse } from "next/server";
import { discoverBenchmarks } from "@/lib/harness/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const benchmarks = await discoverBenchmarks();
    return NextResponse.json({
      benchmarks: benchmarks.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        taskCount: b.taskCount,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
