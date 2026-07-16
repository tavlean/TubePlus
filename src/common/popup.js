const { DEFAULT_SETTINGS, normalizeSettings } = globalThis.TubePlusUrlCleaner;

// Firefox MV3 treats host permissions as user-granted and never grants new ones on
// update, so the extension can end up installed but blind to youtube.com. The card
// stays hidden wherever access is already granted (always, on Chrome).
const HOST_ORIGINS = { origins: ["*://*.youtube.com/*"] };

const accessCard = document.getElementById("accessCard");
const grantAccessButton = document.getElementById("grantAccessButton");
const enabledToggle = document.getElementById("enabledToggle");
const cleanMixesToggle = document.getElementById("cleanMixesToggle");
const cleanPlaylistsToggle = document.getElementById("cleanPlaylistsToggle");
const statusText = document.getElementById("statusText");

let settings = Object.assign({}, DEFAULT_SETTINGS);

function statusFor(s) {
    if (!s.enabled) {
        return "Paused";
    }

    if (s.cleanMixes && s.cleanPlaylists) {
        return "Cleaning mixes & playlists";
    }

    if (s.cleanMixes) {
        return "Cleaning mixes & radio";
    }

    if (s.cleanPlaylists) {
        return "Cleaning playlists";
    }

    return "Nothing selected";
}

function render() {
    enabledToggle.checked = settings.enabled;
    cleanMixesToggle.checked = settings.cleanMixes;
    cleanPlaylistsToggle.checked = settings.cleanPlaylists;

    cleanMixesToggle.disabled = !settings.enabled;
    cleanPlaylistsToggle.disabled = !settings.enabled;

    document.body.classList.toggle("is-paused", !settings.enabled);
    statusText.textContent = statusFor(settings);
}

function update(change) {
    settings = Object.assign({}, settings, change);
    chrome.storage.local.set(change);
    render();
}

function refreshHostAccess() {
    chrome.permissions.contains(HOST_ORIGINS, (granted) => {
        if (!chrome.runtime.lastError) {
            accessCard.hidden = granted;
        }
    });
}

grantAccessButton.addEventListener("click", () => {
    chrome.permissions.request(HOST_ORIGINS, () => {
        void chrome.runtime.lastError;
        refreshHostAccess();
    });
});

chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    settings = normalizeSettings(stored);
    render();
});

refreshHostAccess();

enabledToggle.addEventListener("change", () => update({ enabled: enabledToggle.checked }));
cleanMixesToggle.addEventListener("change", () => update({ cleanMixes: cleanMixesToggle.checked }));
cleanPlaylistsToggle.addEventListener("change", () => update({ cleanPlaylists: cleanPlaylistsToggle.checked }));
