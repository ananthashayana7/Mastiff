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
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] border border-white/[0.12] bg-[#08111f] shadow-[0_22px_60px_rgba(3,7,18,0.45)] ${className}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={title}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(56,189,248,0.5),transparent_32%),radial-gradient(circle_at_82%_20%,rgba(20,184,166,0.28),transparent_26%),radial-gradient(circle_at_50%_92%,rgba(245,158,11,0.22),transparent_36%),linear-gradient(155deg,#12243b_0%,#0b1830_38%,#07111f_100%)]" />
            <div className="absolute inset-[1px] rounded-[28%] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_34%)]" />
            <div className="absolute inset-x-[18%] top-[12%] h-[12%] rounded-full bg-white/16 blur-[10px]" />
            <svg
                viewBox="0 0 64 64"
                className="relative z-10 h-[72%] w-[72%]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="mastiffBars" x1="14" y1="14" x2="49" y2="50" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#F8FAFC" />
                        <stop offset="0.45" stopColor="#DBEAFE" />
                        <stop offset="1" stopColor="#E0F2FE" />
                    </linearGradient>
                    <linearGradient id="mastiffSignal" x1="16" y1="44" x2="51" y2="16" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#38BDF8" />
                        <stop offset="0.5" stopColor="#14B8A6" />
                        <stop offset="1" stopColor="#F59E0B" />
                    </linearGradient>
                </defs>
                <path d="M14 48.5V21.5C14 20.1193 15.1193 19 16.5 19H20.5C21.8807 19 23 20.1193 23 21.5V48.5H14Z" fill="url(#mastiffBars)" opacity="0.94" />
                <path d="M28 48.5V15.5C28 14.1193 29.1193 13 30.5 13H34.5C35.8807 13 37 14.1193 37 15.5V48.5H28Z" fill="url(#mastiffBars)" opacity="0.98" />
                <path d="M42 48.5V27.5C42 26.1193 43.1193 25 44.5 25H48.5C49.8807 25 51 26.1193 51 27.5V48.5H42Z" fill="url(#mastiffBars)" opacity="0.9" />
                <path d="M15.5 41.5L26.5 31.5L34 35L48.5 20" stroke="url(#mastiffSignal)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M45.5 20H48.5V23" stroke="url(#mastiffSignal)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="15.5" cy="41.5" r="2.6" fill="#38BDF8" />
                <circle cx="26.5" cy="31.5" r="2.6" fill="#14B8A6" />
                <circle cx="34" cy="35" r="2.6" fill="#E2E8F0" />
                <circle cx="48.5" cy="20" r="2.8" fill="#F59E0B" />
            </svg>
            <div className="pointer-events-none absolute inset-0 rounded-[30%] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
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
                <div className="bg-[linear-gradient(135deg,#bae6fd,#99f6e4,#fcd34d)] bg-clip-text text-[10px] font-black uppercase tracking-[0.34em] text-transparent">
                    {subtitle}
                </div>
                <div className="mt-1 text-[clamp(1rem,2vw,1.3rem)] font-black tracking-[-0.04em] text-white">
                    {title}
                </div>
            </div>
        </div>
    );
};
