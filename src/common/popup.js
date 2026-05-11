const DEFAULT_SETTINGS = {
    enabled: true,
    mode: "all"
};

const enabledToggle = document.getElementById("enabledToggle");
const statusText = document.getElementById("statusText");
const modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));

function setStatus(settings) {
    if (!settings.enabled) {
        statusText.textContent = "Paused";
        return;
    }

    statusText.textContent = settings.mode === "mixes" ? "Cleaning mixes and radio" : "Cleaning playlist URLs";
}

function render(settings) {
    enabledToggle.checked = settings.enabled;

    for (const input of modeInputs) {
        input.checked = input.value === settings.mode;
        input.disabled = !settings.enabled;
    }

    setStatus(settings);
}

function saveSettings(changes) {
    chrome.storage.local.set(changes);
}

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    render(settings);

    enabledToggle.addEventListener("change", () => {
        const enabled = enabledToggle.checked;
        saveSettings({ enabled });
        render(Object.assign({}, settings, { enabled }));
        settings.enabled = enabled;
    });

    for (const input of modeInputs) {
        input.addEventListener("change", () => {
            if (!input.checked) {
                return;
            }

            const mode = input.value;
            saveSettings({ mode });
            render(Object.assign({}, settings, { mode }));
            settings.mode = mode;
        });
    }
});
