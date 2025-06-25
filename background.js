chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openReader") {
    console.log("Received content:", message.content);

    // Optional: Open a new tab with the content
    chrome.tabs.create({
      url: chrome.runtime.getURL("reader.html")
    }, (tab) => {
      // Optional: Save content somewhere or use sessionStorage/localStorage
    });
  }
});