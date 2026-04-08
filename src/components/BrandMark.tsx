"use client";

import React from 'react';

interface BrandMarkProps {
    size?: number;
    className?: string;
    title?: string;
}

interface BrandLockupProps {
    size?: number;
    className?: string;
    title?: string;
    subtitle?: string;
    align?: 'left' | 'center';
}

export const BrandMark: React.FC<BrandMarkProps> = ({
    size = 44,
    className = '',
    title = 'Mastiff',
}) => {
    return (
        <div
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[26%] border border-white/[0.14] bg-[#08111b] shadow-[0_24px_70px_rgba(3,7,18,0.42)] ${className}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={title}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_14%,rgba(59,130,246,0.48),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(16,185,129,0.24),transparent_28%),radial-gradient(circle_at_50%_88%,rgba(245,158,11,0.18),transparent_36%),linear-gradient(160deg,#13253d_0%,#0b182b_40%,#071019_100%)]" />
            <div className="absolute inset-[1px] rounded-[24%] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_34%)]" />
            <div className="absolute left-[16%] top-[16%] h-[14%] w-[14%] rounded-full bg-white/14 blur-[10px]" />
            <svg
                viewBox="0 0 64 64"
                className="relative z-10 h-[72%] w-[72%]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="mastiffFrame" x1="13" y1="13" x2="51" y2="51" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#E2E8F0" />
                        <stop offset="0.5" stopColor="#DBEAFE" />
                        <stop offset="1" stopColor="#F8FAFC" />
                    </linearGradient>
                    <linearGradient id="mastiffTrend" x1="16" y1="45" x2="50" y2="16" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#3B82F6" />
                        <stop offset="0.52" stopColor="#10B981" />
                        <stop offset="1" stopColor="#F59E0B" />
                    </linearGradient>
                </defs>
                <path
                    d="M17 48V19.8C17 18.8 17.8 18 18.8 18H22.3C23 18 23.6 18.4 23.9 19L31.1 33.4L38.2 19C38.5 18.4 39.1 18 39.8 18H43.3C44.3 18 45.1 18.8 45.1 19.8V48"
                    stroke="url(#mastiffFrame)"
                    strokeWidth="4.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path
                    d="M16.5 41.5L25.5 33L31.8 36.3L47.5 20.5"
                    stroke="url(#mastiffTrend)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path d="M43.8 20.5H47.5V24.3" stroke="url(#mastiffTrend)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="16.5" cy="41.5" r="2.6" fill="#3B82F6" />
                <circle cx="25.5" cy="33" r="2.5" fill="#10B981" />
                <circle cx="31.8" cy="36.3" r="2.5" fill="#E2E8F0" />
                <circle cx="47.5" cy="20.5" r="2.8" fill="#F59E0B" />
            </svg>
            <div className="pointer-events-none absolute inset-0 rounded-[26%] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
        </div>
    );
};

export const BrandLockup: React.FC<BrandLockupProps> = ({
    size = 44,
    className = '',
    title = 'Mastiff',
    subtitle = 'Decision Intelligence',
    align = 'left',
}) => {
    const alignment = align === 'center'
        ? 'items-center text-center'
        : 'items-start text-left';

    return (
        <div className={`flex gap-3 ${alignment} ${className}`}>
            <BrandMark size={size} />
            <div className="min-w-0">
                <div className="bg-[linear-gradient(135deg,#dbeafe,#a7f3d0,#fde68a)] bg-clip-text text-[10px] font-black uppercase tracking-[0.34em] text-transparent">
                    {subtitle}
                </div>
                <div className="mt-1 text-[clamp(1rem,2vw,1.3rem)] font-black tracking-[-0.04em] text-white">
                    {title}
                </div>
            </div>
        </div>
    );
};
