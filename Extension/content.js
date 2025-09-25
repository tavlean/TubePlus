// Function to clean and reload the URL
function cleanAndReloadURL() {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("v");
    if (v && url.searchParams.has("list")) {
        const cleanURL = `https://www.youtube.com/watch?v=${v}`;
        if (window.location.href !== cleanURL) {
            window.location.href = cleanURL;
            return true; // URL was cleaned
        }
    }
    return false; // URL was already clean
}

// Function to handle URL changes
function handleURLChange() {
    if (window.location.href.includes("youtube.com/watch")) {
        return cleanAndReloadURL();
    }
    return false;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkAndClean") {
        const cleaned = handleURLChange();
        sendResponse({ cleaned: cleaned });
    }
});

// Run on initial page load
handleURLChange();

// Listen for YouTube's navigation events
document.addEventListener("yt-navigate-finish", handleURLChange);

// Fallback for direct URL changes
let lastURL = window.location.href;
new MutationObserver(() => {
    const currentURL = window.location.href;
    if (currentURL !== lastURL) {
        lastURL = currentURL;
        handleURLChange();
    }
}).observe(document, { subtree: true, childList: true });

console.log("YouTube URL Cleaner content script loaded");
