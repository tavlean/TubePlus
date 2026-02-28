(() => {
    "use strict";

    const SHORTS_INDICATOR_WINDOW_MS = 180000;

    const PARAM_OPTIONS = [
        { key: "list", label: "Strip list" },
        { key: "si", label: "Strip si" },
        { key: "feature", label: "Strip feature" },
        { key: "pp", label: "Strip pp" },
        { key: "index", label: "Strip index" },
        { key: "ab_channel", label: "Strip ab_channel" },
        { key: "utm_*", label: "Strip utm_*" }
    ];

    const state = {
        tabId: null,
        tabUrl: "",
        settings: null,
        allowlist: [],
        history: [],
        sessionCleanCount: 0,
        lastAction: null,
        pageContext: null
    };

    const refs = {
        toggleEnabled: document.getElementById("toggle-enabled"),
        sessionCount: document.getElementById("session-count"),
        currentVideoId: document.getElementById("current-video-id"),
        copyButton: document.getElementById("copy-clean-url"),
        shortsIndicator: document.getElementById("shorts-indicator"),
        currentPlaylist: document.getElementById("current-playlist"),
        allowPlaylistButton: document.getElementById("allow-playlist-btn"),
        allowlistList: document.getElementById("allowlist-list"),
        stripParamsList: document.getElementById("strip-params-list"),
        toggleYoutube: document.getElementById("toggle-youtube"),
        toggleYoutubeMusic: document.getElementById("toggle-youtube-music"),
        toggleShortsToWatch: document.getElementById("toggle-shorts-to-watch"),
        togglePreservePlayback: document.getElementById("toggle-preserve-playback"),
        toggleAutoShareClean: document.getElementById("toggle-auto-share-clean"),
        historyList: document.getElementById("history-list"),
        clearHistoryButton: document.getElementById("clear-history-btn"),
        notice: document.getElementById("notice")
    };

    function runtimeMessage(message) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    resolve(response || null);
                });
            } catch (_error) {
                resolve(null);
            }
        });
    }

    function tabMessage(tabId, message) {
        return new Promise((resolve) => {
            if (!Number.isFinite(tabId)) {
                resolve(null);
                return;
            }

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

    function queryActiveTab() {
        return new Promise((resolve) => {
            try {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    resolve((tabs && tabs[0]) || null);
                });
            } catch (_error) {
                resolve(null);
            }
        });
    }

    async function copyText(value) {
        if (!value) {
            return false;
        }

        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch (_error) {
            return false;
        }
    }

    function showNotice(message) {
        if (!message) {
            return;
        }

        refs.notice.textContent = message;
        refs.notice.hidden = false;
        window.clearTimeout(showNotice.timer);
        showNotice.timer = window.setTimeout(() => {
            refs.notice.hidden = true;
        }, 1400);
    }

    function formatTimestamp(timestamp) {
        if (!timestamp || typeof timestamp !== "number") {
            return "";
        }

        try {
            return new Date(timestamp).toLocaleString();
        } catch (_error) {
            return "";
        }
    }

    function shorten(value, maxLength = 46) {
        if (!value || value.length <= maxLength) {
            return value;
        }

        return `${value.slice(0, maxLength - 1)}…`;
    }

    async function refreshState() {
        const popupResponse = await runtimeMessage({
            type: "tubeplus_get_popup_state",
            tabId: state.tabId
        });

        if (popupResponse && popupResponse.ok) {
            state.settings = popupResponse.settings;
            state.allowlist = popupResponse.allowlist || [];
            state.history = popupResponse.history || [];
            state.sessionCleanCount = popupResponse.sessionCleanCount || 0;
            state.lastAction = popupResponse.lastAction || null;
        }

        state.pageContext = await tabMessage(state.tabId, {
            type: "tubeplus_get_page_context"
        });

        render();
    }

    async function updateSettingsPatch(patch) {
        await runtimeMessage({
            type: "tubeplus_update_settings",
            patch
        });
        await refreshState();
    }

    function renderAllowlist() {
        refs.allowlistList.innerHTML = "";

        if (!state.allowlist.length) {
            const empty = document.createElement("li");
            empty.className = "empty-state";
            empty.textContent = "No allowlisted playlists.";
            refs.allowlistList.appendChild(empty);
            return;
        }

        state.allowlist.forEach((entry) => {
            const item = document.createElement("li");
            item.className = "list-item";

            const text = document.createElement("div");
            text.className = "list-text";

            const title = document.createElement("span");
            title.className = "list-title";
            title.textContent = entry.name || "Allowlisted Playlist";

            const subtitle = document.createElement("span");
            subtitle.className = "list-subtitle";
            subtitle.textContent = entry.id;

            text.appendChild(title);
            text.appendChild(subtitle);

            const removeButton = document.createElement("button");
            removeButton.className = "danger";
            removeButton.textContent = "Remove";
            removeButton.dataset.playlistId = entry.id;

            item.appendChild(text);
            item.appendChild(removeButton);
            refs.allowlistList.appendChild(item);
        });
    }

    function renderHistory() {
        refs.historyList.innerHTML = "";

        if (!state.history.length) {
            const empty = document.createElement("li");
            empty.className = "empty-state";
            empty.textContent = "No cleanings yet.";
            refs.historyList.appendChild(empty);
            return;
        }

        state.history.forEach((entry) => {
            const item = document.createElement("li");
            item.className = "history-item";

            const text = document.createElement("div");
            text.className = "list-text";

            const title = document.createElement("span");
            title.className = "list-title";
            title.textContent = entry.title || shorten(entry.cleanedUrl, 42);

            const subtitle = document.createElement("span");
            subtitle.className = "list-subtitle";
            subtitle.textContent = shorten(entry.cleanedUrl, 38);

            const meta = document.createElement("span");
            meta.className = "history-meta";
            meta.textContent = formatTimestamp(entry.occurredAt);

            text.appendChild(title);
            text.appendChild(subtitle);
            text.appendChild(meta);

            const copyButton = document.createElement("button");
            copyButton.className = "history-copy";
            copyButton.textContent = "Copy";
            copyButton.dataset.copyUrl = entry.cleanedUrl;

            item.appendChild(text);
            item.appendChild(copyButton);
            refs.historyList.appendChild(item);
        });
    }

    function renderStripParamOptions() {
        refs.stripParamsList.innerHTML = "";

        PARAM_OPTIONS.forEach((option) => {
            const label = document.createElement("label");
            label.className = "checkbox-item";

            const input = document.createElement("input");
            input.type = "checkbox";
            input.dataset.paramKey = option.key;
            input.checked = Boolean(
                state.settings && state.settings.stripParams && state.settings.stripParams[option.key]
            );

            label.appendChild(input);
            label.append(document.createTextNode(` ${option.label}`));
            refs.stripParamsList.appendChild(label);
        });
    }

    function render() {
        if (!state.settings) {
            return;
        }

        refs.toggleEnabled.checked = Boolean(state.settings.enabled);
        refs.toggleYoutube.checked = Boolean(state.settings.youtubeEnabled);
        refs.toggleYoutubeMusic.checked = Boolean(state.settings.youtubeMusicEnabled);
        refs.toggleShortsToWatch.checked = Boolean(state.settings.shortsToWatch);
        refs.togglePreservePlayback.checked = Boolean(state.settings.preservePlaybackPosition);
        refs.toggleAutoShareClean.checked = Boolean(state.settings.autoCleanShareUrls);

        refs.sessionCount.textContent = String(state.sessionCleanCount || 0);

        const videoId = state.pageContext && state.pageContext.videoId ? state.pageContext.videoId : "-";
        refs.currentVideoId.textContent = videoId;

        const playlistId = state.pageContext && state.pageContext.playlistId ? state.pageContext.playlistId : null;
        if (playlistId) {
            refs.currentPlaylist.textContent = `Current playlist: ${playlistId}`;
            refs.allowPlaylistButton.disabled = false;
        } else {
            refs.currentPlaylist.textContent = "No playlist detected on this page.";
            refs.allowPlaylistButton.disabled = true;
        }

        const isShortsEventRecent = Boolean(
            state.lastAction &&
                state.lastAction.actionType === "shorts_redirect" &&
                Date.now() - (state.lastAction.occurredAt || 0) < SHORTS_INDICATOR_WINDOW_MS
        );
        refs.shortsIndicator.hidden = !isShortsEventRecent;

        refs.copyButton.disabled = !Number.isFinite(state.tabId) || !state.pageContext;

        renderAllowlist();
        renderHistory();
        renderStripParamOptions();
    }

    function bindEvents() {
        refs.toggleEnabled.addEventListener("change", async (event) => {
            await updateSettingsPatch({ enabled: event.target.checked });
        });

        refs.toggleYoutube.addEventListener("change", async (event) => {
            await updateSettingsPatch({ youtubeEnabled: event.target.checked });
        });

        refs.toggleYoutubeMusic.addEventListener("change", async (event) => {
            await updateSettingsPatch({ youtubeMusicEnabled: event.target.checked });
        });

        refs.toggleShortsToWatch.addEventListener("change", async (event) => {
            await updateSettingsPatch({ shortsToWatch: event.target.checked });
        });

        refs.togglePreservePlayback.addEventListener("change", async (event) => {
            await updateSettingsPatch({ preservePlaybackPosition: event.target.checked });
        });

        refs.toggleAutoShareClean.addEventListener("change", async (event) => {
            await updateSettingsPatch({ autoCleanShareUrls: event.target.checked });
        });

        refs.stripParamsList.addEventListener("change", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || !target.dataset.paramKey) {
                return;
            }

            await updateSettingsPatch({
                stripParams: {
                    [target.dataset.paramKey]: target.checked
                }
            });
        });

        refs.copyButton.addEventListener("click", async () => {
            const response = await tabMessage(state.tabId, {
                type: "tubeplus_copy_clean_url",
                source: "popup"
            });

            if (response && response.ok) {
                showNotice("Clean URL copied");
                return;
            }

            const fallbackUrl = state.pageContext && state.pageContext.cleanUrlPreview ? state.pageContext.cleanUrlPreview : state.tabUrl;
            const copied = await copyText(fallbackUrl);
            showNotice(copied ? "Clean URL copied" : "Copy failed");
        });

        refs.allowPlaylistButton.addEventListener("click", async () => {
            if (!state.pageContext || !state.pageContext.playlistId) {
                return;
            }

            await runtimeMessage({
                type: "tubeplus_add_allowlist",
                playlist: {
                    id: state.pageContext.playlistId,
                    name: state.pageContext.playlistName || state.pageContext.title || state.pageContext.playlistId
                }
            });

            showNotice("Playlist allowlisted");
            await refreshState();
        });

        refs.allowlistList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.dataset.playlistId) {
                return;
            }

            await runtimeMessage({
                type: "tubeplus_remove_allowlist",
                playlistId: target.dataset.playlistId
            });

            showNotice("Playlist removed");
            await refreshState();
        });

        refs.historyList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.dataset.copyUrl) {
                return;
            }

            const copied = await copyText(target.dataset.copyUrl);
            showNotice(copied ? "Copied clean URL" : "Copy failed");
        });

        refs.clearHistoryButton.addEventListener("click", async () => {
            await runtimeMessage({ type: "tubeplus_clear_history" });
            showNotice("History cleared");
            await refreshState();
        });
    }

    async function initialize() {
        bindEvents();

        const activeTab = await queryActiveTab();
        if (activeTab) {
            state.tabId = typeof activeTab.id === "number" ? activeTab.id : null;
            state.tabUrl = activeTab.url || "";
        }

        await refreshState();
    }

    initialize();
})();
