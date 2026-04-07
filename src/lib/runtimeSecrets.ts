const DEFAULT_DEV_JWT_SECRET = 'mastiff-ai-secret-key-change-in-production';

let warnedAboutJwtSecret = false;

function warnOnce(message: string) {
    if (warnedAboutJwtSecret) {
        return;
    }

    warnedAboutJwtSecret = true;
    console.warn(message);
}

export function getJwtSecret(): string {
    const configuredSecret = process.env.JWT_SECRET?.trim();
    if (configuredSecret) {
        return configuredSecret;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be configured in production.');
    }

    warnOnce('[auth] JWT_SECRET is not set; using the development fallback secret.');
    return DEFAULT_DEV_JWT_SECRET;
}