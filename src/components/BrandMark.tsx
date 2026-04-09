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
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] border border-black/10 bg-white shadow-[0_18px_46px_rgba(3,7,18,0.24)] ${className}`}
            style={{ width: size, height: size }}
            role="img"
            aria-label={title}
        >
            <div className="absolute inset-[1px] rounded-[24%] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,244,246,0.98))]" />
            <img
                src="/branding/mastiff-mark.svg"
                alt=""
                aria-hidden="true"
                className="relative z-10 h-[84%] w-[84%] object-contain"
                draggable={false}
            />
        </div>
    );
};

export const BrandLockup: React.FC<BrandLockupProps> = ({
    size = 44,
    className = '',
    title = 'Mastiff',
    subtitle = 'Analytics Workspace',
    align = 'left',
}) => {
    const alignment = align === 'center'
        ? 'items-center text-center'
        : 'items-start text-left';

    return (
        <div className={`flex gap-3 ${alignment} ${className}`}>
            <BrandMark size={size} />
            <div className="min-w-0">
                <div className="bg-[linear-gradient(135deg,#f5e7d3,#d9a066,#b45734)] bg-clip-text text-[10px] font-black uppercase tracking-[0.34em] text-transparent">
                    {subtitle}
                </div>
                <div className="mt-1 text-[clamp(1rem,2vw,1.3rem)] font-black tracking-[-0.04em] text-white">
                    {title}
                </div>
            </div>
        </div>
    );
};
