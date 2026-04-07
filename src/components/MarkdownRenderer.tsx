"use client";

import React from 'react';
import { renderMarkdownToHtml } from '../lib/markdown';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    return (
        <div
            className={`markdown-body ${className}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(content) }}
        />
    );
};
