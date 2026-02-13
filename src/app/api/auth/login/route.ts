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
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }

        // Find user
        const user = await db.query.users.findFirst({
            where: eq(users.email, email.toLowerCase().trim()),
        });

        if (!user) {
            return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
        }

        if (!user.passwordHash) {
            return NextResponse.json({ error: "Account not set up for password login. Please sign up." }, { status: 401 });
        }

        // Compare password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            }
        });
    } catch (error: any) {
        console.error("Login Error:", error);
        return NextResponse.json({ error: error.message || "Login failed" }, { status: 500 });
    }
}
