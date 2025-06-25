
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup loaded...');

    const button = document.getElementById("openReader");
    const output = document.getElementById("output");
    const exportButton = document.getElementById("exportButton");

    let lastExtractedArticle = "";  // Store the extracted text globally in the popup scope

    if (!button) {
        console.error("Button with ID 'openReader' not found in popup.html.");
        return;
    }

    button.addEventListener("click", async () => {
        console.log("Button clicked...");

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log("Active tab found:", tab);

        // Step 1: Inject Readability and DOMParser
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["JSDOMParser.js", "Readability.js"]
        });
        console.log("Readability and DOMParser injected.");

        // Step 2: Run Readability on the active page
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runReadabilitySafely
        }, (results) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                output.textContent = "Error: " + chrome.runtime.lastError.message;
                return;
            }

            let articleText = results[0]?.result;
            articleText = cleanSpacing(articleText);
            articleText = addNewlinesAfterSentences(articleText);
            articleText = improveSpacing(articleText);

            output.textContent = articleText;
            lastExtractedArticle = articleText;

            // ✅ Make export button visible
            exportButton.style.display = "block";

        });
    });

    if (!exportButton) {
        console.error("Export button with ID 'exportButton' not found in popup.html.");
    } else {
        exportButton.addEventListener("click", () => {
            console.log("Export button clicked...");
            if (!lastExtractedArticle) {
                console.warn("No article text available for export.");
                return;
            }

            chrome.storage.local.set({ exportedArticle: lastExtractedArticle }, () => {
                console.log("Article text saved to chrome.storage. Opening new tab...");
                chrome.tabs.create({
                    url: chrome.runtime.getURL("reader.html")
                });
            });
        });
    }
});

function runReadabilitySafely() {
    try {
        const docClone = document.cloneNode(true); // Deep clone
        const article = new Readability(docClone).parse();
        return article ? article.textContent : "No readable article found.";
    } catch (error) {
        return "Error running Readability: " + error.message;
    }
}

function cleanSpacing(text) {
    return text.replace(/([.!?,;:])([^\s])/g, '$1 $2');
}

function addNewlinesAfterSentences(text) {
    return text.replace(/([.!?])(\s|$)/g, '$1\n');
}

function improveSpacing(text) {
    return text
        // Add space after sentence-ending punctuation if followed by a capital letter or number (to fix things like "...time.Simon")
        .replace(/([.!?])([A-Z0-9])/g, '$1 $2')

        // Add space after lowercase-letter-to-uppercase-letter transitions without spacing (to fix things like "...amDeath")
        .replace(/([a-z])([A-Z])/g, '$1 $2')

        // Add space after typical heading dash patterns (like "Executive EditorI...")
        .replace(/([a-z])(-\s[A-Z])/g, '$1 $2')

        // Optional: fix extra spaces inside times (fix "10: 00" back to "10:00")
        .replace(/(\d):\s+(\d)/g, '$1:$2')

        // Normalize excessive line breaks
        .replace(/\n{3,}/g, '\n\n');
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "openReader") {
        document.getElementById("content").innerText = message.content;
    }
});