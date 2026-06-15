const { DEFAULT_SETTINGS, normalizeSettings } = window.TubePlusUrlCleaner;

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

chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    settings = normalizeSettings(stored);
    render();
});

enabledToggle.addEventListener("change", () => update({ enabled: enabledToggle.checked }));
cleanMixesToggle.addEventListener("change", () => update({ cleanMixes: cleanMixesToggle.checked }));
cleanPlaylistsToggle.addEventListener("change", () => update({ cleanPlaylists: cleanPlaylistsToggle.checked }));
