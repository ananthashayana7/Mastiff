import type { Metadata } from "next";
import "./globals.css";
import startServerInit from '@/src/lib/serverInit';

// Start background server initialization (schedules, seeds)
const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build';

if (!isBuildPhase) {
    startServerInit();
}

export const metadata: Metadata = {
    title: "Mastiff AI — Data Intelligence Platform",
    description: "Chat with your data. Get instant insights, visualizations, and AI-powered analysis — no coding required.",
    icons: {
        icon: '/branding/mastiff-mark.svg',
        shortcut: '/branding/mastiff-mark.svg',
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
