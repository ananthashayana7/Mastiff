import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, messages, files } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id;
        if (!id) return NextResponse.json({ error: "Missing session ID" }, { status: 400 });

        console.log(`Deleting session: ${id}`);

        // Delete associated messages and files records (metadata only, files stay on disk for now)
        await db.delete(messages).where(eq(messages.sessionId, id));
        await db.delete(files).where(eq(files.sessionId, id));
        await db.delete(sessions).where(eq(sessions.id, id));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete Session Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
