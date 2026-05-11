(function (global) {
    const PLAYLIST_PARAMS = new Set(["list", "index", "pp", "start_radio"]);
    const PRESERVED_EMPTY_PARAMS = new Set(["autoplay", "mute"]);
    const DEFAULT_OPTIONS = {
        mode: "all"
    };

    function isYouTubeWatchURL(url) {
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) &&
            url.pathname === "/watch"
        );
    }

    function isMixOrRadioList(listId) {
        return listId.startsWith("RD") || listId.startsWith("UL");
    }

    function shouldCleanPlaylistContext(url, options) {
        const listId = url.searchParams.get("list");

        if (url.searchParams.has("start_radio")) {
            return true;
        }

        if (!listId) {
            return false;
        }

        if (options.mode === "mixes") {
            return isMixOrRadioList(listId);
        }

        return true;
    }

    function cleanYouTubeWatchURL(input, requestedOptions) {
        const options = Object.assign({}, DEFAULT_OPTIONS, requestedOptions);
        const url = new URL(input);

        if (!isYouTubeWatchURL(url) || !url.searchParams.get("v")) {
            return {
                changed: false,
                url: url.toString()
            };
        }

        if (!shouldCleanPlaylistContext(url, options)) {
            return {
                changed: false,
                url: url.toString()
            };
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

        return {
            changed,
            url: url.toString()
        };
    }

    const api = {
        cleanYouTubeWatchURL,
        DEFAULT_OPTIONS,
        isMixOrRadioList,
        isYouTubeWatchURL
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    global.TubePlusUrlCleaner = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
