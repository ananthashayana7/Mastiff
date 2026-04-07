import type { NextConfig } from "next";

const teamsFrameAncestors = [
    "'self'",
    'https://teams.microsoft.com',
    'https://*.teams.microsoft.com',
    'https://*.skype.com',
    'https://*.office.com',
    'https://office.com',
];

const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    `frame-ancestors ${teamsFrameAncestors.join(' ')}`,
    "frame-src 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.office.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
    /* config options here */
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    serverExternalPackages: ["dockerode", "docker-modem", "ssh2"],
    staticPageGenerationTimeout: 300,
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: contentSecurityPolicy,
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
