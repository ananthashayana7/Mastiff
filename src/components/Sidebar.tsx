"use client";

import React, { useMemo } from 'react';
import {
    Plus, X, FileUp, Trash2, Info, Settings, Clock, Database, Sparkles,
    FileText, FileSpreadsheet, File, Loader2, Search, MessageSquare, MoreVertical,
    ChevronRight, LogOut
} from 'lucide-react';
import { DataFile, User, Session } from '../types';

interface SidebarProps {
    files: DataFile[];
    activeFileIds: string[];
    isSidebarOpen: boolean;
    currentUser: User;
    onClose: () => void;
    onClearMessages: () => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onToggleFile: (id: string) => void;
    onInspectFile: (id: string) => void;
    onDeleteFile: (id: string, e: React.MouseEvent) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    sessions: Session[];
    currentSessionId: string | null;
    onSwitchSession: (id: string) => void;
    onDeleteSession: (id: string, e: React.MouseEvent) => void;
    isUploading?: boolean;
    onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    files,
    activeFileIds,
    isSidebarOpen,
    currentUser,
    onClose,
    onClearMessages,
    onFileUpload,
    onToggleFile,
    onInspectFile,
    onDeleteFile,
    fileInputRef,
    sessions,
    currentSessionId,
    onSwitchSession,
    onDeleteSession,
    isUploading = false,
    onLogout
}) => {

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'csv': return <FileText size={14} className="text-green-400" />;
            case 'xlsx': case 'xls': return <FileSpreadsheet size={14} className="text-blue-400" />;
            case 'pdf': return <FileText size={14} className="text-red-400" />;
            case 'docx': case 'doc': return <FileText size={14} className="text-blue-300" />;
            default: return <File size={14} className="text-zinc-400" />;
        }
    };

    // Group sessions by date
    const groupedSessions = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;
        const weekAgo = today - 7 * 86400000;

        const groups: { label: string; sessions: Session[] }[] = [
            { label: 'Today', sessions: [] },
            { label: 'Yesterday', sessions: [] },
            { label: 'This Week', sessions: [] },
            { label: 'Older', sessions: [] },
        ];

        sessions.forEach(s => {
            const created = typeof s.createdAt === 'number' ? s.createdAt : new Date(s.createdAt).getTime();
            if (created >= today) groups[0].sessions.push(s);
            else if (created >= yesterday) groups[1].sessions.push(s);
            else if (created >= weekAgo) groups[2].sessions.push(s);
            else groups[3].sessions.push(s);
        });

        return groups.filter(g => g.sessions.length > 0);
    }, [sessions]);

    const uploadedFiles = files.filter(f => f.id !== 'sample-sales');

    return (
        <>
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={onClose} />
            )}

            <aside className={`fixed md:relative inset-y-0 left-0 w-72 glass flex flex-col z-50 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-zinc-900/80 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#E50914] to-[#ff4d4d] rounded-xl flex items-center justify-center shadow-lg glow-accent">
                            <span className="text-white text-sm font-black">M</span>
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-white tracking-tight">Mastiff</h1>
                            <p className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest">Data Intelligence</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="md:hidden p-1.5 text-zinc-500 hover:text-white rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* New Session Button */}
                <div className="p-3 shrink-0">
                    <button
                        onClick={onClearMessages}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#E50914] to-[#b20710] text-white font-extrabold text-[10px] uppercase tracking-widest rounded-xl hover:shadow-lg hover:shadow-[#E50914]/20 transition-all active:scale-[0.98]"
                    >
                        <Plus size={14} /> New Chat
                    </button>
                </div>

                {/* File Upload Input (Hidden) */}
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.doc,.txt"
                    onChange={onFileUpload}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Uploaded Files Section */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-[2px]">
                                Data Sources
                            </p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1 text-zinc-600 hover:text-[#E50914] transition-colors rounded"
                            >
                                <Plus size={12} />
                            </button>
                        </div>

                        {isUploading && (
                            <div className="flex items-center gap-2 p-2.5 glass rounded-xl mb-2 animate-fade-in">
                                <Loader2 size={12} className="animate-spin text-[#E50914]" />
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Processing file...</span>
                            </div>
                        )}

                        {uploadedFiles.length > 0 ? (
                            <div className="space-y-1">
                                {uploadedFiles.map(f => (
                                    <div
                                        key={f.id}
                                        className={`group flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all ${activeFileIds.includes(f.id)
                                            ? 'bg-[#E50914]/8 border border-[#E50914]/20'
                                            : 'hover:bg-zinc-900/50'
                                            }`}
                                        onClick={() => onInspectFile(f.id)}
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                                            {getFileIcon(f.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-white truncate">{f.name}</p>
                                            <p className="text-[8px] text-zinc-600 font-medium">
                                                {f.metadata?.row_count?.toLocaleString() || '?'} rows • {f.columns.length} cols
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => onDeleteFile(f.id, e)}
                                            className="p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full p-4 border border-dashed border-zinc-800 rounded-xl text-center hover:border-[#E50914]/30 hover:bg-[#E50914]/3 transition-all group"
                            >
                                <FileUp size={16} className="mx-auto text-zinc-700 group-hover:text-[#E50914] mb-1.5 transition-colors" />
                                <p className="text-[9px] font-bold text-zinc-600 group-hover:text-zinc-400 transition-colors">Upload files</p>
                            </button>
                        )}
                    </div>

                    {/* Sessions */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-[2px]">
                                History
                            </p>
                            <Clock size={10} className="text-zinc-700" />
                        </div>

                        <div className="space-y-3">
                            {groupedSessions.map(group => (
                                <div key={group.label}>
                                    <p className="text-[7px] font-bold text-zinc-700 uppercase tracking-wider px-1 mb-1">
                                        {group.label}
                                    </p>
                                    <div className="space-y-0.5">
                                        {group.sessions.map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => onSwitchSession(s.id)}
                                                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${currentSessionId === s.id
                                                    ? 'bg-[#E50914]/8 border border-[#E50914]/20'
                                                    : 'hover:bg-zinc-900/50'
                                                    }`}
                                            >
                                                <MessageSquare size={12} className={currentSessionId === s.id ? 'text-[#E50914]' : 'text-zinc-700'} />
                                                <span className={`flex-1 text-[10px] font-semibold truncate ${currentSessionId === s.id ? 'text-white' : 'text-zinc-500'}`}>
                                                    {s.title || 'New Chat'}
                                                </span>
                                                <button
                                                    onClick={(e) => onDeleteSession(s.id, e)}
                                                    className="p-0.5 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* User Footer */}
                <div className="p-3 border-t border-zinc-900/80 shrink-0">
                    <div className="flex items-center gap-2.5 p-2 rounded-xl">
                        <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-[10px] font-black text-[#E50914]">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-white truncate">{currentUser.name}</p>
                            <p className="text-[8px] text-zinc-600 font-medium truncate">{currentUser.email}</p>
                        </div>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="p-1.5 text-zinc-600 hover:text-red-400 rounded-lg transition-colors"
                                title="Sign out"
                            >
                                <LogOut size={13} />
                            </button>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
};
