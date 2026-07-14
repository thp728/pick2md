// Service worker: injects the picker content script into the active tab
// when the toolbar icon is clicked. No persistent state — picker mode is
// entirely torn down (overlay, listeners, preview panel) when dismissed.

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});
