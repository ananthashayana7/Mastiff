"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChartBar, Eye, EyeSlash, SpinnerGap, ShieldCheck, Sparkle } from '@phosphor-icons/react';
import { BrandLockup, BrandMark } from '../../components/BrandMark';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isMicrosoftEnabled, setIsMicrosoftEnabled] = useState(false);

    useEffect(() => {
        let mounted = true;

        void (async () => {
            try {
                const response = await fetch('/api/auth/session', {
                    headers: { Accept: 'application/json' },
                });

                if (!mounted || !response.ok) {
                    return;
                }

                router.replace('/');
            } catch {
                // Ignore session bootstrap errors on the login screen.
            }
        })();

        return () => {
            mounted = false;
        };
    }, [router]);

    useEffect(() => {
        let mounted = true;

        void (async () => {
            try {
                const response = await fetch('/api/auth/providers', {
                    headers: { Accept: 'application/json' },
                });

                if (!mounted || !response.ok) {
                    return;
                }

                const providers = await response.json();
                setIsMicrosoftEnabled(Boolean(providers?.microsoft));
            } catch {
                // Ignore provider discovery failures on the login screen.
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Login failed');
                return;
            }

            localStorage.removeItem('mastiff_token');
            localStorage.setItem('mastiff_user', JSON.stringify(data.user));
            router.push('/');
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute left-[8%] top-[12%] h-80 w-80 rounded-full bg-sky-400/[0.12] blur-[130px]" />
                <div className="absolute right-[10%] top-[10%] h-72 w-72 rounded-full bg-rose-400/10 blur-[130px]" />
                <div className="absolute bottom-[8%] left-[38%] h-80 w-80 rounded-full bg-teal-400/10 blur-[150px]" />
            </div>

            <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,18,30,0.92),rgba(8,13,24,0.8))] shadow-[0_40px_120px_rgba(2,6,23,0.45)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
                <div className="relative overflow-hidden border-b border-white/10 p-8 sm:p-10 lg:border-b-0 lg:border-r">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.14),transparent_32%),radial-gradient(circle_at_82%_16%,rgba(251,113,133,0.12),transparent_28%),radial-gradient(circle_at_56%_88%,rgba(45,212,191,0.1),transparent_34%)]" />
                    <div className="relative">
                        <BrandLockup size={64} title="SPARTA" />
                        <p className="mt-6 max-w-md text-[15px] leading-7 text-slate-200/80">
                            A sharper analysis workspace for teams that want insight-first reporting, live connectors, and interactive drill-downs without the clutter.
                        </p>

                        <div className="mt-8 grid gap-3">
                            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/[0.14] text-sky-200">
                                        <ChartBar size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-200/70">Interactive Charts</p>
                                        <p className="mt-1 text-sm font-semibold text-white">See the numbers, then drill to the root.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-400/[0.14] text-rose-200">
                                        <Sparkle size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-200/70">Crisp Actions</p>
                                        <p className="mt-1 text-sm font-semibold text-white">Less filler, more decisions and next steps.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400/[0.14] text-teal-200">
                                        <ShieldCheck size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-teal-200/70">Trusted Workspace</p>
                                        <p className="mt-1 text-sm font-semibold text-white">Connectors, uploads, and reproducible code in one place.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8 lg:p-10">
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300/70">Sign in</p>
                            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">Sign in to SPARTA</h1>
                        </div>
                        <BrandMark size={48} className="hidden sm:inline-flex" />
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        {isMicrosoftEnabled && (
                            <>
                                <a
                                    href="/api/auth/microsoft/start"
                                    className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-xs font-bold uppercase tracking-[0.24em] text-white transition-all hover:border-sky-300/30 hover:bg-white/10"
                                >
                                    Continue with Microsoft
                                </a>
                                <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                    <div className="h-px flex-1 bg-white/10" />
                                    <span>Or use SPARTA password login</span>
                                    <div className="h-px flex-1 bg-white/10" />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-300/75">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white placeholder:text-slate-500 transition-all focus:border-sky-300/[0.38] focus:ring-1 focus:ring-sky-300/20"
                                placeholder="you@company.com"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-300/75">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 pr-12 text-sm font-medium text-white placeholder:text-slate-500 transition-all focus:border-sky-300/[0.38] focus:ring-1 focus:ring-sky-300/20"
                                    placeholder="Enter your password"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white"
                                >
                                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="animate-fade-in rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs font-semibold text-red-200">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,rgba(56,189,248,0.98),rgba(251,113,133,0.92))] py-3.5 text-xs font-extrabold uppercase tracking-[0.24em] text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLoading ? (
                                <SpinnerGap size={16} className="animate-spin" />
                            ) : (
                                <>Sign In <ArrowRight size={14} /></>
                            )}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-slate-400/80">
                        Don't have an account?{' '}
                        <a href="/signup" className="font-bold text-sky-300 transition-colors hover:text-white">
                            Create one
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
