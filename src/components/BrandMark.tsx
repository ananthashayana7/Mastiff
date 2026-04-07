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
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] border border-white/12 bg-[#08111f] shadow-[0_18px_45px_rgba(3,7,18,0.42)] ${className}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={title}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.44),transparent_32%),radial-gradient(circle_at_82%_20%,rgba(251,113,133,0.34),transparent_28%),radial-gradient(circle_at_50%_88%,rgba(45,212,191,0.22),transparent_38%),linear-gradient(145deg,#14233b_0%,#0b1627_52%,#09121f_100%)]" />
            <div className="absolute inset-[1px] rounded-[26%] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),transparent_28%)]" />
            <svg
                viewBox="0 0 64 64"
                className="relative z-10 h-[72%] w-[72%]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="mastiffCore" x1="12" y1="12" x2="51" y2="51" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#F8FAFC" />
                        <stop offset="0.55" stopColor="#D8EAFE" />
                        <stop offset="1" stopColor="#B7D8FF" />
                    </linearGradient>
                    <linearGradient id="mastiffOrbit" x1="38" y1="12" x2="54" y2="40" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#38BDF8" />
                        <stop offset="1" stopColor="#2DD4BF" />
                    </linearGradient>
                </defs>
                <path
                    d="M12.75 49V15H20.1L31.9 30.35L43.9 15H51.25V49H43.9V26.4L35.65 37.1H28.2L20.1 26.4V49H12.75Z"
                    fill="url(#mastiffCore)"
                />
                <path
                    d="M44.4 17.25C49 17.25 52.75 21.03 52.75 25.7V37.5C52.75 42.17 49 45.95 44.4 45.95"
                    stroke="url(#mastiffOrbit)"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                />
                <circle cx="49.9" cy="25.75" r="3.2" fill="#38BDF8" />
                <circle cx="49.9" cy="37.5" r="3.2" fill="#FB7185" />
            </svg>
            <div className="pointer-events-none absolute inset-0 rounded-[28%] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
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
                <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/75">
                    {subtitle}
                </div>
                <div className="mt-1 text-[clamp(1rem,2vw,1.3rem)] font-black tracking-[-0.04em] text-white">
                    {title}
                </div>
            </div>
        </div>
    );
};
