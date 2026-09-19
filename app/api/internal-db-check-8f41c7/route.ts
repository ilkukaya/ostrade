import { MongoClient } from "mongodb";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.MONGODB_URI;

  if (!raw) {
    return NextResponse.json({ ok: false, stage: "env", error: "MONGODB_URI missing" }, { status: 500 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ ok: false, stage: "parse", error: "MONGODB_URI is not a valid URI" }, { status: 500 });
  }

  const meta = {
    protocol: parsed.protocol,
    username: decodeURIComponent(parsed.username),
    host: parsed.host,
    database: parsed.pathname.replace(/^\//, "") || null,
    authSource: parsed.searchParams.get("authSource") || "default",
    passwordLength: decodeURIComponent(parsed.password).length,
  };

  const client = new MongoClient(raw, {
    serverSelectionTimeoutMS: 8000,
  });

  try {
    await client.db("admin").command({ ping: 1 });
    return NextResponse.json({ ok: true, meta });
  } catch (error) {
    const err = error as { name?: string; message?: string; code?: number; codeName?: string };
    return NextResponse.json(
      {
        ok: false,
        stage: "connect",
        meta,
        error: {
          name: err.name || "UnknownError",
          message: err.message || "Unknown error",
          code: err.code ?? null,
          codeName: err.codeName ?? null,
        },
      },
      { status: 500 },
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}
