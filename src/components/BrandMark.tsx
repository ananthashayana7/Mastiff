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
    title = 'SPARTA logo',
}) => {
    return (
        <div
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] border border-stone-300 bg-[radial-gradient(circle_at_30%_25%,#fffaf0,#f2e4ce_62%,#e7d1ac)] shadow-[0_12px_28px_rgba(28,25,23,0.14)] ${className}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={title}
        >
            <img
                src="/branding/sparta-mark.svg"
                alt=""
                aria-hidden="true"
                className="relative z-10 h-[96%] w-[96%] object-contain"
                draggable={false}
            />
        </div>
    );
};

export const BrandLockup: React.FC<BrandLockupProps> = ({
    size = 44,
    className = '',
    title = 'SPARTA',
    subtitle,
    align = 'left',
}) => {
    const alignment = align === 'center'
        ? 'items-center text-center'
        : 'items-start text-left';

    return (
        <div className={`flex gap-3 ${alignment} ${className}`}>
            <BrandMark size={size} />
            <div className="min-w-0">
                {subtitle ? (
                    <div className="bg-[linear-gradient(135deg,#7c1a16,#c0482f,#d39a54)] bg-clip-text text-[10px] font-black uppercase tracking-[0.3em] text-transparent">
                        {subtitle}
                    </div>
                ) : null}
                <div className="mt-1 text-[clamp(1rem,2vw,1.32rem)] font-black tracking-[-0.05em] text-stone-900">
                    {title}
                </div>
            </div>
        </div>
    );
};
