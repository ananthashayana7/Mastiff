import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import startServerInit from '@/src/lib/serverInit';

// Start background server initialization (schedules, seeds)
startServerInit();

const inter = Inter({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
    title: "Mastiff AI — Data Intelligence Platform",
    description: "Chat with your data. Get instant insights, visualizations, and AI-powered analysis — no coding required.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>{children}</body>
        </html>
    );
}
