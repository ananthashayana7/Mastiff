import type { NextConfig } from "next";

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
};

export default nextConfig;
