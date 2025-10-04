chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && tab.url.includes("youtube.com/watch")) {
        chrome.tabs.sendMessage(tabId, { action: "checkAndClean" }, (response) => {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError.message);
            } else if (response) {
                console.log("Response from content script:", response);
            }
        });
    }
});
