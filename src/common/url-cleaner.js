(function (global) {
    const PLAYLIST_PARAMS = ["list", "index", "pp", "start_radio"];
    const PRESERVED_EMPTY_PARAMS = new Set(["autoplay", "mute"]);

    const DEFAULT_SETTINGS = {
        enabled: true,
        cleanMixes: true,
        cleanPlaylists: true
    };

    // A "Mix"/radio playlist id starts with RD (mixes, radios) or UL (auto lists).
    function isMixOrRadioList(listId) {
        return /^(RD|UL)/.test(listId);
    }

    // Accepts current/legacy stored shapes and returns a normalized settings object.
    // Legacy (branch) shape used { enabled, mode: "all" | "mixes" }.
    function normalizeSettings(stored) {
        const source = stored || {};
        const settings = {
            enabled: source.enabled !== false,
            cleanMixes: source.cleanMixes !== false,
            cleanPlaylists: source.cleanPlaylists !== false
        };

        if (source.cleanMixes === undefined && source.cleanPlaylists === undefined && source.mode) {
            settings.cleanMixes = true;
            settings.cleanPlaylists = source.mode !== "mixes";
        }

        return settings;
    }

    function isYouTubeWatchURL(url) {
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) &&
            url.pathname === "/watch"
        );
    }

    function shouldCleanPlaylistContext(url, settings) {
        if (!settings.enabled) {
            return false;
        }

        const listId = url.searchParams.get("list");

        if (!listId) {
            // A radio can be requested via start_radio without a list id yet.
            return url.searchParams.has("start_radio") && settings.cleanMixes;
        }

        return isMixOrRadioList(listId) ? settings.cleanMixes : settings.cleanPlaylists;
    }

    function cleanYouTubeWatchURL(input, requestedSettings) {
        const settings = normalizeSettings(requestedSettings);
        const url = new URL(input);

        if (!isYouTubeWatchURL(url) || !url.searchParams.get("v")) {
            return { changed: false, url: url.toString() };
        }

        if (!shouldCleanPlaylistContext(url, settings)) {
            return { changed: false, url: url.toString() };
        }

        let changed = false;

        for (const param of PLAYLIST_PARAMS) {
            if (url.searchParams.has(param)) {
                url.searchParams.delete(param);
                changed = true;
            }
        }

        for (const [key, value] of Array.from(url.searchParams.entries())) {
            if (value === "" && !PRESERVED_EMPTY_PARAMS.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        }

        url.hash = "";

        return { changed, url: url.toString() };
    }

    const api = {
        DEFAULT_SETTINGS,
        PLAYLIST_PARAMS,
        cleanYouTubeWatchURL,
        isMixOrRadioList,
        isYouTubeWatchURL,
        normalizeSettings,
        shouldCleanPlaylistContext
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    global.TubePlusUrlCleaner = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
