import i18n from "@/i18n";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { normalizeLocalProxyUrl, withLocalProxy } from "@/stores/use-config-store";

export const MEDIA_RESPONSE_ERROR = "MediaResponseError";

/** The proxy answers its root path with its own identity payload, which doubles as a reachability check. */
export async function testLocalProxy(proxyUrl: string) {
    const base = normalizeLocalProxyUrl(proxyUrl);
    if (!base) throw new Error(i18n.t("config.proxy.missingUrl"));
    const response = await fetch(`${base}/`, { cache: "no-store" });
    const data = response.ok ? ((await response.json().catch(() => null)) as { proxy?: string; version?: string } | null) : null;
    if (!data?.proxy) throw new Error(i18n.t("config.proxy.unreachable"));
    return `${data.proxy} v${data.version || "?"}`;
}

type ProxyRetry = (error: unknown) => boolean;

/** Try the original URL first, then retry via the local proxy. Default: CORS / network errors only. */
export async function requestDirectThenProxy<T>(url: string, request: (url: string) => Promise<T>, shouldRetry: ProxyRetry = isCorsOrNetworkError): Promise<T> {
    if (!/^https?:\/\//i.test(url)) return request(url);
    try {
        return await request(url);
    } catch (error) {
        if (isAbortError(error) || !shouldRetry(error)) throw error;
        const proxied = withLocalProxy(url);
        if (proxied === url) throw error;
        try {
            return await request(proxied);
        } catch (proxyError) {
            if (isAbortError(proxyError) || !isCorsOrNetworkError(proxyError)) throw proxyError;
            throw error;
        }
    }
}

/** Media / WebDAV: retry on CORS, network, hotlink, or non-media responses. */
export async function requestMedia<T>(url: string, request: (url: string) => Promise<T>): Promise<T> {
    return requestDirectThenProxy(url, request, (error) => !isAbortError(error));
}

export async function axiosDirectThenProxy<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return requestDirectThenProxy(String(config.url || ""), (url) => axios.request<T>({ ...config, url }));
}

export async function fetchMediaBlob(url: string, init?: RequestInit): Promise<Blob> {
    return requestMedia(url, async (next) => {
        const response = await fetch(next, { ...init, referrerPolicy: "no-referrer" });
        const blob = await response.blob();
        if (!response.ok || isBlockedMediaBlob(blob, response.headers.get("content-type"))) {
            throw mediaResponseError(response.status);
        }
        return blob;
    });
}

export function isBlockedMediaType(contentType?: string | null) {
    const type = (contentType || "").split(";")[0].trim().toLowerCase();
    if (!type || /^(image|video|audio)\//.test(type) || type === "application/octet-stream") return false;
    return /html|json|text\/plain|xml/.test(type);
}

function isBlockedMediaBlob(blob: Blob, contentType?: string | null) {
    return isBlockedMediaType(blob.type || contentType);
}

export function mediaResponseError(status: number) {
    const error = new Error(status >= 400 ? `HTTP ${status}` : i18n.t("common.mediaDownloadFailed"));
    error.name = MEDIA_RESPONSE_ERROR;
    return error;
}

function isCorsOrNetworkError(error: unknown) {
    if (hasHttpResponse(error) || isAbortError(error)) return false;
    if (error instanceof TypeError) return true;
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ERR_NETWORK") return true;
    const message = error instanceof Error ? error.message : String(error || "");
    return /failed to fetch|network error|load failed/i.test(message);
}

function hasHttpResponse(error: unknown) {
    return Boolean(error && typeof error === "object" && "response" in error && (error as { response?: unknown }).response);
}

function isAbortError(error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error && (error.name === "AbortError" || error.name === "CanceledError" || error.name === "TimeoutError")) return true;
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ERR_CANCELED") return true;
    return false;
}
