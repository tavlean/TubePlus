function cleanCurrentURL() {
    const result = TubePlusUrlCleaner.cleanYouTubeWatchURL(window.location.href);

    if (result.changed && window.location.href !== result.url) {
        window.history.replaceState(window.history.state, "", result.url);
        return true;
    }

    return false;
}

function handleURLChange() {
    const cleaned = cleanCurrentURL();
    lastURL = window.location.href;
    return cleaned;
}

let lastURL = window.location.href;

function handlePossibleURLChange() {
    const currentURL = window.location.href;

    if (currentURL !== lastURL) {
        handleURLChange();
    }
}

handleURLChange();

document.addEventListener("yt-navigate-finish", handlePossibleURLChange);
window.addEventListener("popstate", handlePossibleURLChange);
window.addEventListener("pageshow", handlePossibleURLChange);
