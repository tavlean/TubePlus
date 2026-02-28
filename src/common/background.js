(() => {
    "use strict";

    const MAX_ALLOWLIST_ENTRIES = 20;
    const MAX_HISTORY_ENTRIES = 50;
    const BADGE_DURATION_MS = 3000;
    const COPY_CONTEXT_MENU_ID = "tubeplus-copy-clean-url";

    const STORAGE_KEYS = {
        settings: "tubeplus_settings",
        allowlist: "tubeplus_allowlist",
        history: "tubeplus_history",
        sessionCount: "tubeplus_session_count"
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

    const ACTIVE_ICON_PATHS = {
        16: "assets/icon-16.png",
        32: "assets/icon-32.png",
        48: "assets/icon-48.png",
        128: "assets/icon-128.png"
    };

    const INACTIVE_ICON_PATHS = {
        16: "assets/icon-16-gray.png",
        32: "assets/icon-32-gray.png",
        48: "assets/icon-48-gray.png",
        128: "assets/icon-128-gray.png"
    };

    let sessionCleanCount = 0;
    const badgeTimers = new Map();
    const lastActionByTab = new Map();

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

    function normalizeHistory(rawHistory) {
        if (!Array.isArray(rawHistory)) {
            return [];
        }

        return rawHistory
            .filter((entry) => entry && typeof entry === "object")
            .slice(0, MAX_HISTORY_ENTRIES);
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

    function storageSet(values) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.set(values, () => resolve());
            } catch (_error) {
                resolve();
            }
        });
    }

    function tabsQuery(queryInfo) {
        return new Promise((resolve) => {
            try {
                chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
            } catch (_error) {
                resolve([]);
            }
        });
    }

    function tabsGet(tabId) {
        return new Promise((resolve) => {
            try {
                chrome.tabs.get(tabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }

                    resolve(tab || null);
                });
            } catch (_error) {
                resolve(null);
            }
        });
    }

    function tabsSendMessage(tabId, message) {
        return new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }

                    resolve(response || null);
                });
            } catch (_error) {
                resolve(null);
            }
        });
    }

    function isYouTubeUrl(rawUrl) {
        if (!rawUrl) {
            return false;
        }

        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch (_error) {
            return false;
        }

        const host = parsed.hostname.toLowerCase();
        return host === "youtube.com" || host.endsWith(".youtube.com");
    }

    async function ensureDefaultsInStorage() {
        const stored = await storageGet([
            STORAGE_KEYS.settings,
            STORAGE_KEYS.allowlist,
            STORAGE_KEYS.history,
            STORAGE_KEYS.sessionCount
        ]);

        const updates = {};

        const mergedSettings = mergeSettings(stored[STORAGE_KEYS.settings]);
        const existingSettings = stored[STORAGE_KEYS.settings] || null;
        if (!existingSettings || JSON.stringify(existingSettings) !== JSON.stringify(mergedSettings)) {
            updates[STORAGE_KEYS.settings] = mergedSettings;
        }

        if (!Array.isArray(stored[STORAGE_KEYS.allowlist])) {
            updates[STORAGE_KEYS.allowlist] = [];
        }

        if (!Array.isArray(stored[STORAGE_KEYS.history])) {
            updates[STORAGE_KEYS.history] = [];
        }

        if (typeof stored[STORAGE_KEYS.sessionCount] !== "number") {
            updates[STORAGE_KEYS.sessionCount] = 0;
            sessionCleanCount = 0;
        } else {
            sessionCleanCount = stored[STORAGE_KEYS.sessionCount];
        }

        if (Object.keys(updates).length > 0) {
            await storageSet(updates);
            if (typeof updates[STORAGE_KEYS.sessionCount] === "number") {
                sessionCleanCount = updates[STORAGE_KEYS.sessionCount];
            }
        }
    }

    async function setSessionCleanCount(value) {
        sessionCleanCount = Number.isFinite(value) ? value : 0;
        await storageSet({ [STORAGE_KEYS.sessionCount]: sessionCleanCount });
    }

    async function incrementSessionCleanCount() {
        sessionCleanCount += 1;
        await storageSet({ [STORAGE_KEYS.sessionCount]: sessionCleanCount });
    }

    async function resetSessionCount() {
        await setSessionCleanCount(0);
    }

    async function getPopupState(tabId) {
        const stored = await storageGet([
            STORAGE_KEYS.settings,
            STORAGE_KEYS.allowlist,
            STORAGE_KEYS.history,
            STORAGE_KEYS.sessionCount
        ]);

        if (typeof stored[STORAGE_KEYS.sessionCount] === "number") {
            sessionCleanCount = stored[STORAGE_KEYS.sessionCount];
        }

        const lastAction = Number.isFinite(tabId) ? lastActionByTab.get(tabId) || null : null;

        return {
            settings: mergeSettings(stored[STORAGE_KEYS.settings]),
            allowlist: normalizeAllowlist(stored[STORAGE_KEYS.allowlist]),
            history: normalizeHistory(stored[STORAGE_KEYS.history]),
            sessionCleanCount,
            lastAction
        };
    }

    async function updateSettings(patch) {
        const stored = await storageGet([STORAGE_KEYS.settings]);
        const current = mergeSettings(stored[STORAGE_KEYS.settings]);

        const merged = mergeSettings({
            ...current,
            ...patch,
            stripParams: {
                ...current.stripParams,
                ...(patch && patch.stripParams ? patch.stripParams : {})
            }
        });

        await storageSet({ [STORAGE_KEYS.settings]: merged });
        return merged;
    }

    async function addPlaylistToAllowlist(playlist) {
        if (!playlist || typeof playlist.id !== "string" || !playlist.id.trim()) {
            return normalizeAllowlist([]);
        }

        const playlistId = playlist.id.trim();
        const stored = await storageGet([STORAGE_KEYS.allowlist]);
        const current = normalizeAllowlist(stored[STORAGE_KEYS.allowlist]);

        const filtered = current.filter((entry) => entry.id !== playlistId);
        filtered.unshift({
            id: playlistId,
            name: typeof playlist.name === "string" ? playlist.name.trim() : "",
            addedAt: Date.now()
        });

        const next = filtered.slice(0, MAX_ALLOWLIST_ENTRIES);
        await storageSet({ [STORAGE_KEYS.allowlist]: next });
        return next;
    }

    async function removePlaylistFromAllowlist(playlistId) {
        const stored = await storageGet([STORAGE_KEYS.allowlist]);
        const current = normalizeAllowlist(stored[STORAGE_KEYS.allowlist]);
        const next = current.filter((entry) => entry.id !== playlistId);
        await storageSet({ [STORAGE_KEYS.allowlist]: next });
        return next;
    }

    async function appendHistory(entry) {
        if (!entry || !entry.originalUrl || !entry.cleanedUrl || entry.originalUrl === entry.cleanedUrl) {
            return normalizeHistory([]);
        }

        const stored = await storageGet([STORAGE_KEYS.history]);
        const current = normalizeHistory(stored[STORAGE_KEYS.history]);
        const next = [entry, ...current].slice(0, MAX_HISTORY_ENTRIES);
        await storageSet({ [STORAGE_KEYS.history]: next });
        return next;
    }

    async function clearHistory() {
        await storageSet({ [STORAGE_KEYS.history]: [] });
        return [];
    }

    function clearBadge(tabId) {
        chrome.action.setBadgeText({ tabId, text: "" });
    }

    function showBadge(tabId) {
        if (!Number.isFinite(tabId)) {
            return;
        }

        chrome.action.setBadgeBackgroundColor({ tabId, color: "#16a34a" });
        chrome.action.setBadgeText({ tabId, text: "✓" });

        if (badgeTimers.has(tabId)) {
            clearTimeout(badgeTimers.get(tabId));
        }

        const timer = setTimeout(() => {
            clearBadge(tabId);
            badgeTimers.delete(tabId);
        }, BADGE_DURATION_MS);

        badgeTimers.set(tabId, timer);
    }

    function updateIconForTab(tabId, url) {
        if (!Number.isFinite(tabId)) {
            return;
        }

        const isYouTube = isYouTubeUrl(url);
        chrome.action.setIcon({
            tabId,
            path: isYouTube ? ACTIVE_ICON_PATHS : INACTIVE_ICON_PATHS
        });

        if (!isYouTube) {
            clearBadge(tabId);
        }
    }

    async function refreshAllTabIcons() {
        const tabs = await tabsQuery({});
        tabs.forEach((tab) => {
            if (typeof tab.id === "number") {
                updateIconForTab(tab.id, tab.url || "");
            }
        });
    }

    async function updateActiveTabIcon() {
        const tabs = await tabsQuery({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (activeTab && typeof activeTab.id === "number") {
            updateIconForTab(activeTab.id, activeTab.url || "");
        }
    }

    async function triggerCopyOnTab(tabId, source) {
        if (!Number.isFinite(tabId)) {
            return;
        }

        await tabsSendMessage(tabId, {
            type: "tubeplus_copy_clean_url",
            source
        });
    }

    function createContextMenu() {
        try {
            chrome.contextMenus.removeAll(() => {
                chrome.contextMenus.create({
                    id: COPY_CONTEXT_MENU_ID,
                    title: "Copy Clean URL",
                    contexts: ["page"],
                    documentUrlPatterns: ["*://*.youtube.com/*"]
                });
            });
        } catch (_error) {
            // no-op
        }
    }

    function attachEventListeners() {
        chrome.runtime.onInstalled.addListener(async () => {
            await ensureDefaultsInStorage();
            await resetSessionCount();
            createContextMenu();
            await refreshAllTabIcons();
        });

        if (chrome.runtime.onStartup) {
            chrome.runtime.onStartup.addListener(async () => {
                await ensureDefaultsInStorage();
                await resetSessionCount();
                await refreshAllTabIcons();
            });
        }

        chrome.contextMenus.onClicked.addListener(async (info, tab) => {
            if (info.menuItemId !== COPY_CONTEXT_MENU_ID || !tab || typeof tab.id !== "number") {
                return;
            }

            await triggerCopyOnTab(tab.id, "context-menu");
        });

        chrome.commands.onCommand.addListener(async (command) => {
            if (command !== "copy-clean-url") {
                return;
            }

            const tabs = await tabsQuery({ active: true, currentWindow: true });
            const activeTab = tabs[0];
            if (!activeTab || typeof activeTab.id !== "number") {
                return;
            }

            await triggerCopyOnTab(activeTab.id, "keyboard-shortcut");
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.url || changeInfo.status === "complete") {
                updateIconForTab(tabId, changeInfo.url || tab.url || "");
            }
        });

        chrome.tabs.onActivated.addListener(async ({ tabId }) => {
            const tab = await tabsGet(tabId);
            if (tab) {
                updateIconForTab(tabId, tab.url || "");
            }
        });

        chrome.tabs.onRemoved.addListener((tabId) => {
            if (badgeTimers.has(tabId)) {
                clearTimeout(badgeTimers.get(tabId));
                badgeTimers.delete(tabId);
            }

            lastActionByTab.delete(tabId);
        });

        if (chrome.windows && chrome.windows.onFocusChanged) {
            chrome.windows.onFocusChanged.addListener(() => {
                updateActiveTabIcon();
            });
        }

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request || typeof request !== "object") {
                return false;
            }

            const handleMessage = async () => {
                switch (request.type) {
                    case "tubeplus_get_popup_state": {
                        const popupState = await getPopupState(request.tabId);
                        sendResponse({ ok: true, ...popupState });
                        break;
                    }
                    case "tubeplus_update_settings": {
                        const updatedSettings = await updateSettings(request.patch || {});
                        sendResponse({ ok: true, settings: updatedSettings });
                        break;
                    }
                    case "tubeplus_add_allowlist": {
                        const allowlist = await addPlaylistToAllowlist(request.playlist || {});
                        sendResponse({ ok: true, allowlist });
                        break;
                    }
                    case "tubeplus_remove_allowlist": {
                        const allowlist = await removePlaylistFromAllowlist(request.playlistId);
                        sendResponse({ ok: true, allowlist });
                        break;
                    }
                    case "tubeplus_clear_history": {
                        await clearHistory();
                        sendResponse({ ok: true });
                        break;
                    }
                    case "tubeplus_url_cleaned": {
                        const payload = request.payload || {};
                        const tabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;

                        if (tabId !== null) {
                            lastActionByTab.set(tabId, {
                                actionType: payload.actionType || "param_cleanup",
                                occurredAt: payload.occurredAt || Date.now(),
                                cleanedUrl: payload.cleanedUrl || ""
                            });
                            showBadge(tabId);
                        }

                        await incrementSessionCleanCount();
                        await appendHistory({
                            originalUrl: payload.originalUrl,
                            cleanedUrl: payload.cleanedUrl,
                            title: payload.title || "",
                            videoId: payload.videoId || null,
                            playlistId: payload.playlistId || null,
                            actionType: payload.actionType || "param_cleanup",
                            occurredAt: payload.occurredAt || Date.now()
                        });

                        sendResponse({ ok: true });
                        break;
                    }
                    case "tubeplus_copy_performed": {
                        sendResponse({ ok: true });
                        break;
                    }
                    default:
                        sendResponse({ ok: false });
                        break;
                }
            };

            handleMessage().catch(() => {
                sendResponse({ ok: false });
            });
            return true;
        });
    }

    async function initialize() {
        await ensureDefaultsInStorage();
        createContextMenu();
        attachEventListeners();
        await refreshAllTabIcons();
    }

    initialize();
})();
