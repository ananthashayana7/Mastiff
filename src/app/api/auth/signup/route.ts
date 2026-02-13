import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'mastiff-ai-secret-key-change-in-production';

export async function POST(req: NextRequest) {
    try {
        const { name, email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
        }

        // Check if user already exists
        const existing = await db.query.users.findFirst({
            where: eq(users.email, email.toLowerCase().trim()),
        });

        if (existing) {
            return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
        }

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        // Create user
        const [newUser] = await db.insert(users).values({
            email: email.toLowerCase().trim(),
            name: name?.trim() || email.split('@')[0],
            passwordHash,
        }).returning();

        // Generate JWT
        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email, name: newUser.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return NextResponse.json({
            token,
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
            }
        });
    } catch (error: any) {
        console.error("Signup Error:", error);
        return NextResponse.json({ error: error.message || "Signup failed" }, { status: 500 });
    }
}
