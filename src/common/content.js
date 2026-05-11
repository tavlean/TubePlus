function cleanCurrentURL() {
    const result = TubePlusUrlCleaner.cleanYouTubeWatchURL(window.location.href);

    if (result.changed && window.location.href !== result.url) {
        window.history.replaceState(window.history.state, "", result.url);
        return true;
    }

    return false;
}

function handleURLChange() {
    return cleanCurrentURL();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkAndClean") {
        const cleaned = handleURLChange();
        sendResponse({ cleaned });
    }
});

handleURLChange();

document.addEventListener("yt-navigate-finish", handleURLChange);

let lastURL = window.location.href;
new MutationObserver(() => {
    const currentURL = window.location.href;
    if (currentURL !== lastURL) {
        lastURL = currentURL;
        handleURLChange();
    }
}).observe(document, { subtree: true, childList: true });
