"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';

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
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Login failed');
                return;
            }

            localStorage.removeItem('mastiff_token');
            localStorage.setItem('mastiff_user', JSON.stringify(data.user));
            router.push('/');
        } catch (err: any) {
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
            {/* Background effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E50914]/5 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#E50914]/3 rounded-full blur-[150px]" />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#E50914] to-[#ff4d4d] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-[#E50914]/20">
                        <span className="text-white text-2xl font-black">M</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Mastiff</h1>
                    <p className="text-sm text-zinc-500 mt-2 font-medium">Enterprise AI Data Analyst</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="glass rounded-2xl p-8 space-y-5 border border-zinc-800/50">
                        {isMicrosoftEnabled && (
                            <>
                                <a
                                    href="/api/auth/microsoft/start"
                                    className="w-full py-3.5 border border-zinc-700 bg-zinc-900/70 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:border-zinc-500 transition-all flex items-center justify-center"
                                >
                                    Continue with Microsoft
                                </a>
                                <div className="flex items-center gap-3 text-zinc-600 text-[10px] font-bold uppercase tracking-[2px]">
                                    <div className="h-px flex-1 bg-zinc-800" />
                                    <span>Or use Mastiff password login</span>
                                    <div className="h-px flex-1 bg-zinc-800" />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-[2px] mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm font-medium placeholder:text-zinc-700 focus:outline-none focus:border-[#E50914]/50 focus:ring-1 focus:ring-[#E50914]/30 transition-all"
                                placeholder="you@company.com"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-[2px] mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-white text-sm font-medium placeholder:text-zinc-700 focus:outline-none focus:border-[#E50914]/50 focus:ring-1 focus:ring-[#E50914]/30 transition-all"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs font-semibold animate-fade-in">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 bg-gradient-to-r from-[#E50914] to-[#b20710] text-white font-extrabold text-xs uppercase tracking-widest rounded-xl hover:shadow-lg hover:shadow-[#E50914]/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>Sign In <ArrowRight size={14} /></>
                            )}
                        </button>
                    </div>
                </form>

                <p className="text-center mt-6 text-sm text-zinc-600">
                    Don't have an account?{' '}
                    <a href="/signup" className="text-[#E50914] hover:text-[#ff4d4d] font-bold transition-colors">
                        Create one
                    </a>
                </p>
            </div>
        </div>
    );
}
