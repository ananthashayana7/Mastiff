import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '../csrf-token/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const user = await authenticateRequest(req);
        const userId = user?.id;
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        console.log("Fetching sessions for user:", userId);

        const userSessions = await db.query.sessions.findMany({
            where: eq(sessions.userId, userId),
            orderBy: desc(sessions.updatedAt),
            with: {
                files: true,
                messages: true
            }
        });

        return NextResponse.json(userSessions);
    } catch (error: any) {
        console.error("Session GET Error:", error);
        return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const csrfValidation = await validateCSRFRequest(req);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const user = await authenticateRequest(req);
        const userId = user?.id;
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { title } = body;

        console.log("POST /api/sessions - UserID:", userId);

        if (!userId || userId === "u1") {
            const msg = !userId ? "Missing userId" : "Legacy user ID 'u1' detected. Please refresh your browser or clear local storage.";
            console.warn(`Sessions POST blocked: ${msg}`);
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        // 1. Ensure user exists
        try {
            await db.insert(users).values({
                id: userId,
                email: `${userId}@beagle.ai`
            }).onConflictDoNothing();
        } catch (e) {
            console.warn("User insert/check failed (might already exist):", e);
        }

        // 2. Create session
        const inserted = await db.insert(sessions).values({
            userId,
            title: title || "New Analysis",
        }).returning();

        if (!inserted || inserted.length === 0) {
            throw new Error("Failed to create session record");
        }

        console.log("Session created successfully:", inserted[0].id);
        return NextResponse.json(inserted[0]);
    } catch (error: any) {
        console.error("Session POST Error:", error);
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }
}
