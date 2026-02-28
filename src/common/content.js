(() => {
    "use strict";

    const DEBUG = false;
    const CLEAN_GUARD_MS = 500;

    const STORAGE_KEYS = {
        settings: "tubeplus_settings",
        allowlist: "tubeplus_allowlist"
    };

    const DEFAULT_STRIP_PARAMS = {
        list: true,
        si: true,
        feature: true,
        pp: true,
        index: true,
        ab_channel: true,
        "utm_*": true
    };

    const DEFAULT_SETTINGS = {
        enabled: true,
        youtubeEnabled: true,
        youtubeMusicEnabled: true,
        shortsToWatch: false,
        preservePlaybackPosition: true,
        autoCleanShareUrls: true,
        stripParams: DEFAULT_STRIP_PARAMS
    };

    let settings = cloneDefaultSettings();
    let allowlistedPlaylists = [];
    let lastKnownHref = window.location.href;
    let lastCleanupAt = 0;
    let handleTimer = null;
    let shareScanAt = 0;

    function logDebug(...args) {
        if (DEBUG) {
            console.debug("[TubePlus]", ...args);
        }
    }

    function cloneDefaultSettings() {
        return {
            ...DEFAULT_SETTINGS,
            stripParams: { ...DEFAULT_STRIP_PARAMS }
        };
    }

    function mergeSettings(rawSettings) {
        const merged = cloneDefaultSettings();
        if (!rawSettings || typeof rawSettings !== "object") {
            return merged;
        }

        merged.enabled = rawSettings.enabled !== false;
        merged.youtubeEnabled = rawSettings.youtubeEnabled !== false;
        merged.youtubeMusicEnabled = rawSettings.youtubeMusicEnabled !== false;
        merged.shortsToWatch = Boolean(rawSettings.shortsToWatch);
        merged.preservePlaybackPosition = rawSettings.preservePlaybackPosition !== false;
        merged.autoCleanShareUrls = rawSettings.autoCleanShareUrls !== false;

        if (rawSettings.stripParams && typeof rawSettings.stripParams === "object") {
            merged.stripParams = {
                ...DEFAULT_STRIP_PARAMS,
                ...rawSettings.stripParams
            };
        }

        return merged;
    }

    function normalizeAllowlist(rawAllowlist) {
        if (!Array.isArray(rawAllowlist)) {
            return [];
        }

        return rawAllowlist
            .filter((entry) => entry && typeof entry.id === "string" && entry.id.trim())
            .map((entry) => ({
                id: entry.id.trim(),
                name: typeof entry.name === "string" ? entry.name : "",
                addedAt: typeof entry.addedAt === "number" ? entry.addedAt : Date.now()
            }));
    }

    function storageGet(keys) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(keys, (result) => {
                    resolve(result || {});
                });
            } catch (_error) {
                resolve({});
            }
        });
    }

    function safeParseUrl(rawUrl) {
        try {
            return new URL(rawUrl, window.location.origin);
        } catch (_error) {
            return null;
        }
    }

    function isYouTubeHost(hostname) {
        if (!hostname) {
            return false;
        }

        const host = hostname.toLowerCase();
        return host === "youtube.com" || host.endsWith(".youtube.com");
    }

    function isMusicHost(hostname) {
        return hostname.toLowerCase() === "music.youtube.com";
    }

    function isSupportedPath(pathname, searchParams) {
        if (!pathname || pathname.startsWith("/embed/")) {
            return false;
        }

        if (pathname === "/watch" || pathname.startsWith("/shorts/") || pathname.startsWith("/live/")) {
            return true;
        }

        if (pathname === "/playlist") {
            return Boolean(searchParams.get("v"));
        }

        return false;
    }

    function shouldProcessUrl(url, options = {}) {
        if (!url || !isYouTubeHost(url.hostname)) {
            return false;
        }

        const ignoreMasterToggle = Boolean(options.ignoreMasterToggle);
        if (!ignoreMasterToggle && !settings.enabled) {
            return false;
        }

        if (isMusicHost(url.hostname) && !settings.youtubeMusicEnabled) {
            return false;
        }

        if (!isMusicHost(url.hostname) && !settings.youtubeEnabled) {
            return false;
        }

        return isSupportedPath(url.pathname, url.searchParams);
    }

    function getCurrentPlaybackSeconds() {
        const video = document.querySelector("video");
        if (!video || typeof video.currentTime !== "number" || !Number.isFinite(video.currentTime)) {
            return null;
        }

        const seconds = Math.floor(video.currentTime);
        return seconds > 0 ? seconds : null;
    }

    function shouldStripParam(key) {
        if (!settings.stripParams || typeof settings.stripParams !== "object") {
            return false;
        }

        if (settings.stripParams[key]) {
            return true;
        }

        if (settings.stripParams["utm_*"] && key.startsWith("utm_")) {
            return true;
        }

        return false;
    }

    function extractVideoId(url) {
        if (!url) {
            return null;
        }

        if (url.pathname === "/watch") {
            return url.searchParams.get("v");
        }

        if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) {
            const parts = url.pathname.split("/").filter(Boolean);
            return parts.length > 1 ? parts[1] : null;
        }

        return url.searchParams.get("v");
    }

    function buildAllowlistSet() {
        return new Set(allowlistedPlaylists.map((entry) => entry.id));
    }

    function buildCleanUrl(rawUrl, options = {}) {
        const parsed = safeParseUrl(rawUrl);
        if (!parsed || !shouldProcessUrl(parsed, options)) {
            return {
                changed: false,
                cleanedUrl: rawUrl,
                actionType: "none",
                removedParams: [],
                videoId: null,
                playlistId: null
            };
        }

        const url = new URL(parsed.toString());
        const originalPath = url.pathname;
        const allowlistSet = buildAllowlistSet();
        const removedParams = [];
        let actionType = "param_cleanup";

        if (url.pathname.startsWith("/shorts/") && settings.shortsToWatch) {
            const shortsVideoId = extractVideoId(url);
            if (shortsVideoId) {
                url.pathname = "/watch";
                url.searchParams.set("v", shortsVideoId);
                actionType = "shorts_redirect";
            }
        }

        const nextParams = new URLSearchParams();
        for (const [key, value] of url.searchParams.entries()) {
            if (key === "v") {
                nextParams.append(key, value);
                continue;
            }

            if (key === "t") {
                nextParams.append(key, value);
                continue;
            }

            if (key === "list") {
                if (!shouldStripParam("list") || allowlistSet.has(value)) {
                    nextParams.append(key, value);
                } else {
                    removedParams.push("list");
                }
                continue;
            }

            if (shouldStripParam(key)) {
                removedParams.push(key);
                continue;
            }

            nextParams.append(key, value);
        }

        if (options.injectPlaybackTime && settings.preservePlaybackPosition) {
            const playbackSeconds = getCurrentPlaybackSeconds();
            if (playbackSeconds && playbackSeconds > 10) {
                nextParams.set("t", `${playbackSeconds}s`);
            }
        }

        if (url.pathname === "/watch" && !nextParams.get("v")) {
            const fallbackVideoId = extractVideoId(parsed);
            if (fallbackVideoId) {
                nextParams.set("v", fallbackVideoId);
            }
        }

        const query = nextParams.toString();
        url.search = query ? `?${query}` : "";

        const cleanedUrl = url.toString();
        const changed = cleanedUrl !== rawUrl;
        const playlistId = nextParams.get("list") || parsed.searchParams.get("list") || null;

        if (actionType === "param_cleanup" && originalPath !== url.pathname) {
            actionType = "path_cleanup";
        }

        return {
            changed,
            cleanedUrl,
            actionType,
            removedParams,
            videoId: extractVideoId(url),
            playlistId
        };
    }

    function notifyBackground(eventType, payload) {
        try {
            chrome.runtime.sendMessage({
                type: eventType,
                payload
            });
        } catch (_error) {
            // no-op: background may be unavailable during extension reloads
        }
    }

    function showToast(message) {
        if (!message) {
            return;
        }

        const existing = document.getElementById("tubeplus-toast");
        if (existing) {
            existing.remove();
        }

        const toast = document.createElement("div");
        toast.id = "tubeplus-toast";
        toast.textContent = message;
        Object.assign(toast.style, {
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "2147483647",
            background: "rgba(18, 18, 18, 0.95)",
            color: "#f5f5f5",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "13px",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
            opacity: "0",
            transition: "opacity 150ms ease"
        });

        document.documentElement.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
        });

        window.setTimeout(() => {
            toast.style.opacity = "0";
            window.setTimeout(() => toast.remove(), 200);
        }, 1600);
    }

    async function copyTextToClipboard(text) {
        if (!text) {
            return false;
        }

        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_error) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "true");
            textarea.style.position = "fixed";
            textarea.style.top = "-10000px";
            textarea.style.left = "-10000px";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            let copied = false;
            try {
                copied = document.execCommand("copy");
            } catch (_copyError) {
                copied = false;
            }

            textarea.remove();
            return copied;
        }
    }

    function cleanCurrentUrl(trigger) {
        const now = Date.now();
        if (now - lastCleanupAt < CLEAN_GUARD_MS) {
            return false;
        }

        const currentHref = window.location.href;
        const result = buildCleanUrl(currentHref, { injectPlaybackTime: true });
        if (!result.changed) {
            return false;
        }

        lastCleanupAt = now;
        notifyBackground("tubeplus_url_cleaned", {
            originalUrl: currentHref,
            cleanedUrl: result.cleanedUrl,
            videoId: result.videoId,
            playlistId: result.playlistId,
            removedParams: result.removedParams,
            actionType: result.actionType,
            title: document.title,
            trigger,
            occurredAt: now
        });

        if (result.actionType === "shorts_redirect") {
            window.location.replace(result.cleanedUrl);
            return true;
        }

        window.history.replaceState(window.history.state, "", result.cleanedUrl);
        lastKnownHref = result.cleanedUrl;
        maybeCleanShareInputs();
        return true;
    }

    function scheduleHandleURLChange(trigger, delay = 120) {
        if (handleTimer) {
            window.clearTimeout(handleTimer);
        }

        handleTimer = window.setTimeout(() => {
            handleTimer = null;
            cleanCurrentUrl(trigger);
        }, delay);
    }

    function maybeCleanShareInputs() {
        if (!settings.autoCleanShareUrls) {
            return;
        }

        const now = Date.now();
        if (now - shareScanAt < 250) {
            return;
        }
        shareScanAt = now;

        const selectors = [
            "ytd-unified-share-panel-renderer input#share-url",
            "ytd-unified-share-panel-renderer input[type='text']"
        ];

        const seen = new Set();
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((input) => {
                if (!(input instanceof HTMLInputElement)) {
                    return;
                }

                if (seen.has(input)) {
                    return;
                }
                seen.add(input);

                const currentValue = input.value ? input.value.trim() : "";
                if (!currentValue || !currentValue.includes("youtube.com")) {
                    return;
                }

                const cleaned = buildCleanUrl(currentValue, {
                    injectPlaybackTime: false
                });

                if (cleaned.changed && input.value !== cleaned.cleanedUrl) {
                    input.value = cleaned.cleanedUrl;
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                }

                input.title = "Cleaned by TubePlus";
                input.dataset.tubeplusShareCleaned = "true";
            });
        });
    }

    function handlePotentialUrlChange(trigger) {
        const currentHref = window.location.href;
        if (currentHref === lastKnownHref) {
            return;
        }

        lastKnownHref = currentHref;
        scheduleHandleURLChange(trigger);
    }

    function getCurrentPageContext() {
        const currentUrl = safeParseUrl(window.location.href);
        const preview = buildCleanUrl(window.location.href, {
            injectPlaybackTime: false,
            ignoreMasterToggle: true
        });

        const playlistId = currentUrl ? currentUrl.searchParams.get("list") : null;
        const title = (document.title || "").replace(/\s+-\s+YouTube\s*$/i, "").trim();

        return {
            url: window.location.href,
            cleanUrlPreview: preview.cleanedUrl,
            videoId: currentUrl ? extractVideoId(currentUrl) : null,
            playlistId,
            playlistName: playlistId ? title : "",
            title,
            canAllowlist: Boolean(playlistId)
        };
    }

    async function handleCopyCleanUrl(request, sendResponse) {
        const result = buildCleanUrl(window.location.href, {
            injectPlaybackTime: true,
            ignoreMasterToggle: true
        });

        const cleanUrl = result.cleanedUrl || window.location.href;
        const copied = await copyTextToClipboard(cleanUrl);
        if (copied) {
            showToast("Clean URL copied!");
            notifyBackground("tubeplus_copy_performed", {
                url: cleanUrl,
                changed: result.changed,
                source: request && request.source ? request.source : "unknown",
                title: document.title,
                occurredAt: Date.now()
            });
        }

        sendResponse({
            ok: copied,
            cleanUrl,
            changed: result.changed
        });
    }

    function attachListeners() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }

            if (changes[STORAGE_KEYS.settings]) {
                settings = mergeSettings(changes[STORAGE_KEYS.settings].newValue);
            }

            if (changes[STORAGE_KEYS.allowlist]) {
                allowlistedPlaylists = normalizeAllowlist(changes[STORAGE_KEYS.allowlist].newValue);
            }
        });

        chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
            if (!request || typeof request !== "object") {
                return;
            }

            if (request.action === "checkAndClean") {
                const cleaned = cleanCurrentUrl("background_message");
                sendResponse({ cleaned });
                return;
            }

            switch (request.type) {
                case "tubeplus_get_page_context": {
                    sendResponse(getCurrentPageContext());
                    break;
                }
                case "tubeplus_copy_clean_url": {
                    handleCopyCleanUrl(request, sendResponse);
                    return true;
                }
                case "tubeplus_check_and_clean": {
                    const cleaned = cleanCurrentUrl("manual_request");
                    sendResponse({ cleaned });
                    break;
                }
                default:
                    break;
            }
        });

        document.addEventListener("yt-navigate-finish", () => {
            handlePotentialUrlChange("yt_navigate_finish");
            maybeCleanShareInputs();
        });

        window.addEventListener("popstate", () => {
            handlePotentialUrlChange("popstate");
        });

        const observer = new MutationObserver(() => {
            handlePotentialUrlChange("mutation_observer");
            maybeCleanShareInputs();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    async function initialize() {
        const stored = await storageGet([STORAGE_KEYS.settings, STORAGE_KEYS.allowlist]);
        settings = mergeSettings(stored[STORAGE_KEYS.settings]);
        allowlistedPlaylists = normalizeAllowlist(stored[STORAGE_KEYS.allowlist]);

        attachListeners();
        scheduleHandleURLChange("initial_load", 0);
        window.setTimeout(maybeCleanShareInputs, 500);
        logDebug("content initialized");
    }

    initialize();
})();
