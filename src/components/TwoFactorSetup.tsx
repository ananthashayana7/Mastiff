/**
 * 2FA Setup Component
 * 
 * UI for enabling two-factor authentication
 */

'use client';

import { useState } from 'react';
import { csrfFetch } from '@/hooks/useCSRFToken';

interface TwoFactorSetupProps {
    onComplete?: () => void;
    onCancel?: () => void;
}

export function TwoFactorSetup({ onComplete, onCancel }: TwoFactorSetupProps) {
    const [step, setStep] = useState<'initial' | 'scan' | 'verify' | 'complete'>(
        'initial'
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [setupData, setSetupData] = useState<{
        secret: string;
        formattedSecret: string;
        qrCode: string;
        backupCodes: string[];
    } | null>(null);

    const [verificationCode, setVerificationCode] = useState('');
    const [backupCodesSaved, setBackupCodesSaved] = useState(false);

    const handleStartSetup = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await csrfFetch('/api/2fa/setup', {
                method: 'POST',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start 2FA setup');
            }

            const data = await response.json();
            setSetupData(data);
            setStep('scan');
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!setupData) {
            setError('Setup data missing');
            return;
        }

        if (verificationCode.length !== 6) {
            setError('Code must be 6 digits');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await csrfFetch('/api/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: verificationCode,
                    secret: setupData.secret,
                    backupCodes: setupData.backupCodes,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Verification failed');
            }

            setStep('complete');
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6">Enable Two-Factor Authentication</h2>

            {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    {error}
                </div>
            )}

            {step === 'initial' && (
                <div className="space-y-4">
                    <p className="text-gray-600">
                        Add an extra layer of security to your account by enabling
                        two-factor authentication.
                    </p>
                    <button
                        onClick={handleStartSetup}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        {loading ? 'Setting up...' : 'Get Started'}
                    </button>
                    <button
                        onClick={onCancel}
                        className="w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {step === 'scan' && setupData && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Step 1: Scan this QR code with your authenticator app (Google
                        Authenticator, Authy, Microsoft Authenticator, etc):
                    </p>

                    <div className="flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={setupData.qrCode}
                            alt="TOTP QR Code"
                            className="w-48 h-48"
                        />
                    </div>

                    <div className="bg-gray-100 p-4 rounded">
                        <p className="text-xs text-gray-600 mb-2">Or enter this code:</p>
                        <p className="font-mono text-lg text-center">
                            {setupData.formattedSecret}
                        </p>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                        <p className="font-bold text-sm mb-2">⚠️ Save your backup codes:</p>
                        <div className="space-y-1 mb-3">
                            {setupData.backupCodes.map((code, idx) => (
                                <code
                                    key={idx}
                                    className="block text-xs bg-white p-1 font-mono"
                                >
                                    {code}
                                </code>
                            ))}
                        </div>
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={backupCodesSaved}
                                onChange={(e) => setBackupCodesSaved(e.target.checked)}
                                className="mr-2"
                            />
                            <span className="text-xs">
                                I've saved my backup codes in a safe location
                            </span>
                        </label>
                    </div>

                    <button
                        onClick={() => setStep('verify')}
                        disabled={!backupCodesSaved}
                        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        Continue
                    </button>
                </div>
            )}

            {step === 'verify' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Step 2: Enter a 6-digit code from your authenticator app:
                    </p>

                    <input
                        type="text"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-center text-2xl tracking-widest font-mono"
                    />

                    <button
                        onClick={handleVerify}
                        disabled={loading || verificationCode.length !== 6}
                        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
                    </button>

                    <button
                        onClick={() => setStep('scan')}
                        className="w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
                    >
                        Back
                    </button>
                </div>
            )}

            {step === 'complete' && (
                <div className="space-y-4 text-center">
                    <div className="text-4xl">✅</div>
                    <h3 className="text-xl font-bold text-green-600">
                        2FA is now enabled!
                    </h3>
                    <p className="text-gray-600 text-sm">
                        Your account is now protected with two-factor authentication.
                    </p>

                    <button
                        onClick={onComplete}
                        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                    >
                        Done
                    </button>
                </div>
            )}
        </div>
    );
}
