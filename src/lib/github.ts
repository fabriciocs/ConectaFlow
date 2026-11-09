import { logger } from "./logger";

type LatestRelease = {
    tag_name: string;
    name: string | null;
    html_url: string;
    body: string | null;
    published_at: string | null;
};

const releaseCache = new Map<string, { expiresAt: number; value: LatestRelease | null }>();
const releaseRequests = new Map<string, Promise<LatestRelease | null>>();

export async function getLatestRelease(owner: string, repo: string) {
    const key = `${owner}/${repo}`;
    const cached = releaseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = releaseRequests.get(key);
    if (pending) return pending;

    const request = (async (): Promise<LatestRelease | null> => {
        try {
            const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
            const res = await fetch(url, {
                headers: {
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "ConectaFlow-System"
                },
                cache: "no-store"
            });

            if (!res.ok) {
                if (res.status === 404) {
                    // GitHub also uses 404 when a public repository has no published release.
                    logger.info("GitHub", `No published release is available for ${key}`);
                    releaseCache.set(key, { expiresAt: Date.now() + 30 * 60_000, value: null });
                    return null;
                }
                logger.warn("GitHub", `Release lookup failed for ${key}: HTTP ${res.status}`);
                releaseCache.set(key, { expiresAt: Date.now() + 60_000, value: null });
                return null;
            }

            const data = await res.json();
            const release: LatestRelease = {
                tag_name: data.tag_name, // e.g. v1.0.1
                name: data.name,
                html_url: data.html_url,
                body: data.body,
                published_at: data.published_at
            };
            releaseCache.set(key, { expiresAt: Date.now() + 15 * 60_000, value: release });
            return release;
        } catch (e) {
            logger.warn("GitHub", `Release lookup failed for ${key}`, e);
            releaseCache.set(key, { expiresAt: Date.now() + 60_000, value: null });
            return null;
        }
    })();

    releaseRequests.set(key, request);
    try {
        return await request;
    } finally {
        releaseRequests.delete(key);
    }
}
