let wordIndex = 0;  // Global counter across all sentences
let wordList = [];
let contractionSuffixes = [];
let hyphenatedWords = [];

const titleContainer = document.getElementById('titleContainer');
const contentContainer = document.getElementById('content');
const allContainers = [contentContainer, titleContainer];

const posMap = {
    a: "Article / Determiner",   // the, a, my, your, their, etc.
    v: "Verb",                   // be, do, have, go, get, say, make, etc.
    p: "Pronoun",                // I, you, he, she, it, we, they, etc.
    c: "Conjunction",            // and, but, or, if, etc.
    i: "Preposition",            // of, in, to, with, from, etc.
    d: "Demonstrative / Determiner",  // this, that, what, all, etc.
    t: "To-infinitive marker",   // to (when before verb, e.g., "to go")
    r: "Adverb / Adverbial",     // so
    n: "Noun",                   // dog, cat, house, etc.
    m: "Number / Order",       // one, two, first, second, etc.
    j: "Adjective",              // big, small, good, bad, etc.
    u: "Interjection",           // oh, ah, wow, yes, etc.
    x: "Negation / Other",       // n't, not
};

const posBadgeIcons = {
    a: "🔍",
    v: "💪",
    p: "👤",
    c: "🔗",
    i: "➡️",      // 🗺️ Or use a styled arrow icon later
    d: "📍",
    t: "♾️",
    r: "🚀",
    n: "🍎",
    m: "1️⃣",
    j: "🔥",
    u: "❗",
    x: "🚫"
};

// The main loader for words and rank
async function initReaderPage() {
    await loadWordList();
    console.log("Word list ready. Now rendering article...");
    loadAndRenderArticle();
}

initReaderPage();

function loadAndRenderArticle() {
    chrome.storage.local.get(['exportedArticle', 'exportedTitle'], (result) => {
        const articleText = result.exportedArticle || "No article found.";
        const articleTitle = result.exportedTitle || "Untitled Article";

        // ✅ Clear any previous content
        titleContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        // ✅ Render title with the same word highlighting logic
        renderTextBlock(articleTitle, titleContainer, 'h1');

        // ✅ Render article body
        renderTextBlock(articleText, contentContainer);
    });
    chrome.storage.local.remove(['exportedArticle', 'exportedTitle']);
}

async function loadWordList() {
    const url = chrome.runtime.getURL('top5000LexemesAsLemmas.json');
    console.log(url);
    const response = await fetch(url);
    const json = await response.json();
    wordList = json.wordForms;
    console.log("Loaded", wordList.length, "word forms.");

    contractionSuffixes = wordList
        .filter(entry => entry.word && entry.word?.startsWith("'"))
        .map(entry => entry.word?.toLowerCase());

    hyphenatedWords = wordList
        .filter(entry => entry.word && entry.word?.includes('-'))
        .map(entry => entry.word?.toLowerCase());

    console.log("Loaded", contractionSuffixes, "contraction suffixes.");
    console.log("Loaded", hyphenatedWords, "hyphenated words.");
}

function normalizeApostrophes(text) {
    return text.replace(/[’‘]/g, "'");  // Replace both curly apostrophe variants with straight '
}

function splitIntoSentences(text) {
    return text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
}

function generateSafeName(text) {
    return text
        .replace(/[^\w\s]|_/g, '')   // Remove punctuation
        .replace(/\s+/g, '')          // Remove all spaces
        .toLowerCase();               // Optional: make lowercase for consistency
}

function renderTextBlock(text, containerElement, wrapperTag = 'p') {

    const sentences = splitIntoSentences(text);
    sentences.forEach(sentence => {

        const block = document.createElement(wrapperTag);
        const p = document.createElement('p');
        sentence.trim().split(/\s+/).forEach(word => {

            const cleanedWord = cleanWordForMatching(word);
            const parts = getLemmaRankWithParts(cleanedWord);

            if (parts) {
                parts.forEach(part => {
                    const wordDiv = document.createElement('div');
                    wordDiv.classList.add('word');
                    wordDiv.setAttribute('data-name', generateSafeName(part.text));
                    wordDiv.setAttribute('data-index', wordIndex++);

                    if (part.rank !== 9999) {
                        wordDiv.classList.add('highlighted-word');
                        wordDiv.classList.add(getRankColorClass(part.rank));
                        const posFull = posMap[part.pos] || "Unknown POS";

                        wordDiv.addEventListener('mouseenter', () => {
                            const tooltip = document.createElement('div');
                            tooltip.className = 'custom-tooltip';
                            tooltip.innerHTML = `
                                <strong>Rank:</strong> ${part.rank} - <strong>Lemma:</strong> ${part.lemma}</br>
                                <strong>Part of Speech:</strong> ${posFull}`;
                            wordDiv.appendChild(tooltip);
                        });

                        wordDiv.addEventListener('mouseleave', () => {
                            const existingTooltip = wordDiv.querySelector('.custom-tooltip');
                            if (existingTooltip) existingTooltip.remove();
                        });

                        // wordDiv.setAttribute('data-tooltip', `Rank: ${part.rank}, Lemma: ${part.lemma}, Part of Speech: ${posFull}`);

                        wordDiv.textContent = part.text;

                        const posBadge = document.createElement('div');
                        posBadge.classList.add('pos-badge');
                        posBadge.textContent = posBadgeIcons[part.pos] || "?";;  // This will replace the single letter like "v", "n", etc.
                        console.log("Part of speech for word:", part.text, "is", part.pos, "with full name:", posFull);
                        wordDiv.appendChild(posBadge);
                    } else {
                        wordDiv.textContent = part.text;
                    }

                    // After appending wordDiv to the container:
                    setTimeout(() => {
                        const rect = wordDiv.getBoundingClientRect();
                        const tooltipWidth = 300;  // Approximate max width of tooltip (same as in CSS)
                        const viewportRight = window.innerWidth;

                        if (rect.right + tooltipWidth + 20 > viewportRight) {  // Add small buffer
                            wordDiv.classList.add('shift-left');
                        }
                    }, 0);

                    wordDiv.addEventListener('click', () => {
                        wordDiv.classList.toggle('active');
                    });

                    block.appendChild(wordDiv);
                    block.appendChild(document.createTextNode(' '));
                });
            } else {
                // Word totally not found → still render the original word as-is
                const wordDiv = document.createElement('div');
                wordDiv.classList.add('word');
                wordDiv.setAttribute('data-name', generateSafeName(word));
                wordDiv.setAttribute('data-index', wordIndex++);
                wordDiv.textContent = word;

                block.appendChild(wordDiv);
                block.appendChild(document.createTextNode(' '));
            }
        });
        containerElement.appendChild(block);
    });
    chrome.storage.local.remove(['exportedArticle', 'exportedTitle']);
}

function getRankColorClass(rank) {
    if (rank >= 1 && rank <= 1000) return 'rank-tier-1';
    if (rank >= 1001 && rank <= 2000) return 'rank-tier-2';
    if (rank >= 2001 && rank <= 3000) return 'rank-tier-3';
    if (rank >= 3001 && rank <= 4000) return 'rank-tier-4';
    if (rank >= 4001 && rank <= 5000) return 'rank-tier-5';
    return 'rank-tier-default';  // Optional: for anything outside 1–5000
}

function cleanWordForMatching(word) {
    return word.replace(/^[^a-zA-Z0-9'-]+/, '')   // Trim leading non-letter/number/hyphen/apostrophe
        .replace(/[^a-zA-Z0-9'-]+$/, '');  // Trim trailing non-letter/number/hyphen/apostrophe
}

let previousLowIndex = null;
let previousHighIndex = null;

let dragStartWord = null;
let dragEndWord = null;

let isDragging = false;

function clearAllHighlights() {
    allContainers.forEach(container => {
        container.querySelectorAll('.word.active').forEach(word => {
            word.classList.remove('active');
        });
    });
}

function getLemmaRankForWord(word) {
    if (!wordList || wordList.length === 0) return 9999;  // Defensive check in case wordList hasn't loaded yet
    const match = wordList.find(entry => entry.word?.trim().toLowerCase() === word.trim().toLowerCase());
    return match ? match.lemRank : 9999;
}

function getWordEntry(word) {
    return wordList.find(entry => entry.word && entry.word?.toLowerCase() === word.toLowerCase()) || null;
}

function getLemmaRankWithParts(word) {
    const cleanedWord = cleanWordForMatching(word);

    if (!cleanedWord) return null;

    const lowerWord = cleanedWord.toLowerCase();

    // 1. Direct match
    const directEntry = getWordEntry(cleanedWord);
    if (directEntry) {
        return [{
            text: word,
            rank: parseInt(directEntry.lemRank),
            lemma: directEntry.lemma,
            pos: directEntry.PoS
        }];
    }

    const normalizedWord = normalizeApostrophes(lowerWord);
    // Contraction fallback
    for (const suffix of contractionSuffixes) {

        const normalizedSuffix = normalizeApostrophes(suffix);
        const normalizedWord = normalizeApostrophes(word);

        if (normalizedWord.toLowerCase().endsWith(normalizedSuffix)) {
            const suffixStart = word.length - suffix.length;
            const base = word.slice(0, suffixStart);
            const suffixPart = word.slice(suffixStart);

            const baseEntry = getWordEntry(base);
            const suffixEntry = getWordEntry(suffix);

            if (baseEntry && suffixEntry) {
                console.log(`Contraction fallback: "${word}" → "${base}" + "${suffixPart}"`);
                return [
                    {
                        text: base,
                        rank: parseInt(baseEntry.lemRank),
                        lemma: baseEntry.lemma,
                        pos: baseEntry.PoS
                    },
                    {
                        text: suffixPart,
                        rank: parseInt(suffixEntry.lemRank),
                        lemma: suffixEntry.lemma,
                        pos: suffixEntry.PoS
                    }
                ];
            }
        }
    }

    // Hyphen fallback
    if (word.includes('-')) {
        const parts = word.split('-').filter(p => p);
        const partEntries = parts.map(part => getWordEntry(part));

        if (partEntries.every(e => e)) {
            console.log(`Hyphen fallback: "${word}" → Parts:`, parts);
            return parts.map((part, idx) => ({
                text: part,
                rank: parseInt(partEntries[idx].lemRank),
                lemma: partEntries[idx].lemma,
                pos: partEntries[idx].PoS
            }));
        }
    }
    return null;  // Total miss
}


[contentContainer, titleContainer].forEach(container => {
    container.addEventListener('mousedown', (e) => {
        const wordDiv = e.target.closest('.word');
        if (wordDiv) {
            isDragging = true;
            dragStartWord = wordDiv;
            previousLowIndex = null;
            previousHighIndex = null;
        }
    });

    container.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const wordDiv = e.target.closest('.word');
            if (wordDiv) {
                const newEndIndex = parseInt(wordDiv.getAttribute('data-index'));
                if (previousLowIndex !== null && previousHighIndex !== null) {
                    clearRange(container, previousLowIndex, previousHighIndex);
                }

                const startIndex = parseInt(dragStartWord.getAttribute('data-index'));
                const low = Math.min(startIndex, newEndIndex);
                const high = Math.max(startIndex, newEndIndex);

                console.log("high", high);

                highlightRange(container, low, high);

                previousLowIndex = low;
                previousHighIndex = high;
            }
        }
    });
});

function highlightRange(container, low, high) {
    allContainers.forEach(container => {
        container.querySelectorAll('.word').forEach(word => {
            const index = parseInt(word.getAttribute('data-index'));
            if (index >= low && index <= high) {
                word.classList.add('active');
            }
        });
    });
}

function clearRange(container, low, high) {
    allContainers.forEach(container => {
        container.querySelectorAll('.word').forEach(word => {
            const index = parseInt(word.getAttribute('data-index'));
            if (index >= low && index <= high) {
                word.classList.remove('active');
            }
        });
    });
}

document.addEventListener('mouseup', () => {
    isDragging = false;
    dragStartWord = null;
    dragEndWord = null;
});

// function highlightRange(start, end) {
//     const low = Math.min(start, end);
//     const high = Math.max(start, end);

//     container.querySelectorAll('.word').forEach(word => {
//         const index = parseInt(word.getAttribute('data-index'));
//         if (index >= low && index <= high) {
//             word.classList.add('active');
//         }
//     });
// }

function toggleWordActive(pElement) {
    if (!pElement.classList.contains('active')) {
        pElement.classList.add('active');
    }

}
[contentContainer, titleContainer].forEach(container => {
    container.addEventListener('dblclick', () => {
        console.log('Double-click detected in container. Clearing all active highlights...');
        document.querySelectorAll('.word.active').forEach(word => {
            word.classList.remove('active');
        });
    });
});

