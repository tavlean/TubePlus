(function (global) {
    const PLAYLIST_PARAMS = new Set(["list", "index", "pp", "start_radio"]);
    const PRESERVED_EMPTY_PARAMS = new Set(["autoplay", "mute"]);

    function isYouTubeWatchURL(url) {
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) &&
            url.pathname === "/watch"
        );
    }

    function cleanYouTubeWatchURL(input) {
        const url = new URL(input);

        if (!isYouTubeWatchURL(url) || !url.searchParams.get("v")) {
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
        isYouTubeWatchURL
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    global.TubePlusUrlCleaner = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
