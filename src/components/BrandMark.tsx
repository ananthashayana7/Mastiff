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
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(56,189,248,0.55),transparent_34%),radial-gradient(circle_at_84%_18%,rgba(251,113,133,0.4),transparent_28%),radial-gradient(circle_at_50%_88%,rgba(45,212,191,0.28),transparent_38%),linear-gradient(150deg,#11223c_0%,#0b1630_36%,#08111f_100%)]" />
            <div className="absolute inset-[1px] rounded-[28%] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_32%)]" />
            <div className="absolute inset-x-[18%] top-[14%] h-[12%] rounded-full bg-white/20 blur-[10px]" />
            <svg
                viewBox="0 0 64 64"
                className="relative z-10 h-[72%] w-[72%]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="mastiffCore" x1="14" y1="12" x2="49" y2="52" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#F8FAFC" />
                        <stop offset="0.45" stopColor="#DBEAFE" />
                        <stop offset="1" stopColor="#C4B5FD" />
                    </linearGradient>
                    <linearGradient id="mastiffOrbit" x1="18" y1="42" x2="50" y2="18" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#38BDF8" />
                        <stop offset="0.55" stopColor="#FB7185" />
                        <stop offset="1" stopColor="#2DD4BF" />
                    </linearGradient>
                </defs>
                <path
                    d="M12.5 49V15H20.3L31.95 29.7L43.7 15H51.5V49H43.95V26.95L35.5 37.55H28.4L20.05 26.95V49H12.5Z"
                    fill="url(#mastiffCore)"
                />
                <path
                    d="M17 43.5C23.1 36.2 28.3 31.9 33.25 31.9C38.05 31.9 41.05 36.35 45.35 36.35C48.1 36.35 50.55 34.6 53 31.1"
                    stroke="url(#mastiffOrbit)"
                    strokeWidth="3.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <circle cx="18.2" cy="42.2" r="2.8" fill="#38BDF8" />
                <circle cx="33.1" cy="31.9" r="2.8" fill="#FB7185" />
                <circle cx="52" cy="31.5" r="2.8" fill="#2DD4BF" />
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
                <div className="bg-[linear-gradient(135deg,#7dd3fc,#fda4af,#99f6e4)] bg-clip-text text-[10px] font-black uppercase tracking-[0.34em] text-transparent">
                    {subtitle}
                </div>
                <div className="mt-1 text-[clamp(1rem,2vw,1.3rem)] font-black tracking-[-0.04em] text-white">
                    {title}
                </div>
            </div>
        </div>
    );
};
