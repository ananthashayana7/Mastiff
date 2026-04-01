"use client";

import { useEffect } from 'react';

export default function SharePointOauthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error') || params.get('error_description');

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: 'mastiff:sharepoint-oauth-callback',
          code,
          state,
          error,
        },
        window.location.origin
      );
    }

    // Close popup shortly after posting message.
    setTimeout(() => {
      window.close();
    }, 400);
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-200 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 text-center space-y-3">
        <h1 className="text-lg font-extrabold text-white tracking-tight">SharePoint Authorization</h1>
        <p className="text-sm text-zinc-400">Authorization response received. You can close this window.</p>
      </div>
    </main>
  );
}
