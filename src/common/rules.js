(function (global) {
    // Stable ids so we can replace the whole set on every settings change.
    const RULE_IDS = [1, 2];

    const REMOVE_PARAMS = ["list", "index", "pp", "start_radio"];

    // Matches a youtube /watch URL that carries a `list=` parameter (first or later).
    const ANY_LIST = "/watch\\?(.*&)?list=";
    // Same, but only when the list id is a Mix/radio (RD…) or auto list (UL…).
    const MIX_LIST = "/watch\\?(.*&)?list=(RD|UL)";

    function redirectRule(id, regexFilter, priority) {
        return {
            id,
            priority,
            action: {
                type: "redirect",
                redirect: {
                    transform: {
                        queryTransform: { removeParams: REMOVE_PARAMS }
                    }
                }
            },
            condition: {
                regexFilter,
                resourceTypes: ["main_frame"],
                requestDomains: ["youtube.com"]
            }
        };
    }

    function allowRule(id, regexFilter, priority) {
        return {
            id,
            priority,
            action: { type: "allow" },
            condition: {
                regexFilter,
                resourceTypes: ["main_frame"],
                requestDomains: ["youtube.com"]
            }
        };
    }

    // Builds the declarativeNetRequest dynamic rules for a normalized settings object.
    function buildDynamicRules(settings) {
        if (!settings || !settings.enabled) {
            return [];
        }

        const { cleanMixes, cleanPlaylists } = settings;

        if (cleanMixes && cleanPlaylists) {
            return [redirectRule(1, ANY_LIST, 1)];
        }

        if (cleanMixes && !cleanPlaylists) {
            return [redirectRule(1, MIX_LIST, 1)];
        }

        if (!cleanMixes && cleanPlaylists) {
            // Higher-priority allow on mixes wins, so only non-mix playlists are redirected.
            return [allowRule(2, MIX_LIST, 2), redirectRule(1, ANY_LIST, 1)];
        }

        return [];
    }

    const api = { RULE_IDS, REMOVE_PARAMS, buildDynamicRules };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    global.TubePlusRules = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
