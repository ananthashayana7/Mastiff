import { NextResponse } from 'next/server';
import client from 'prom-client';

client.collectDefaultMetrics();

const registry = client.register;

export async function GET() {
  try {
    const metrics = await registry.metrics();
    return new NextResponse(metrics, {
      status: 200,
      headers: { 'Content-Type': registry.contentType },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to collect metrics' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
