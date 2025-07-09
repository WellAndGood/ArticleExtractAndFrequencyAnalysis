let wordIndex = 0;  // Global counter across all sentences
let wordList = [];
let contractionSuffixes = [];
let hyphenatedWords = [];
let currentlySelectedLemma = null;
let low = 0;
let high = 0;
const selectedIndexes = new Set();
let isDragAdding = true; // true = drag-to-select, false = drag-to-deselect
let justDragged = false; // to prevent continuous dragging after mouse release
let isDragging = false;
let dragStartWord = null;

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

    // console.log("Loaded", contractionSuffixes, "contraction suffixes.");
    // console.log("Loaded", hyphenatedWords, "hyphenated words.");
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
                    wordDiv.setAttribute('data-lemma', part.lemma);

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
                        wordDiv.textContent = part.text;

                        const posBadge = document.createElement('div');
                        posBadge.classList.add('pos-badge');
                        posBadge.textContent = posBadgeIcons[part.pos] || "?";;  // This will replace the single letter like "v", "n", etc.
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

    if (wrapperTag === 'p') {
        buildTop15WordList(text);
    }

    chrome.storage.local.remove(['exportedArticle', 'exportedTitle']);
}

function buildTop15WordList(articleText) {
    const wordFrequency = {};

    const words = articleText.split(/\s+/).map(w => cleanWordForMatching(w?.toLowerCase()));

    words.forEach(word => {
        const entry = wordList.find(e => e.word?.toLowerCase() === word);
        if (entry) {
            const lemma = entry.lemma;
            if (!wordFrequency[lemma]) {
                wordFrequency[lemma] = {
                    lemma: lemma,
                    lemRank: parseInt(entry.lemRank),
                    count: 0,
                    word: entry.word
                };
            }
            wordFrequency[lemma].count++;
        }
    });

    // Sort by lemma rank ascending (high priority first), then by count descending
    const sorted = Object.values(wordFrequency)
        .sort((a, b) => a.lemRank - b.lemRank || b.count - a.count)
        .slice(0, 15);

    const tableBody = document.getElementById('topWordsList');
    tableBody.innerHTML = '';

    sorted.forEach(item => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${item.word}</td>
            <td>${item.lemRank}</td>
            <td>${item.count}</td>
            <td>${item.lemma}</td>
        `;

        tableBody.appendChild(row);

        row.addEventListener('click', () => handleRowClick(item.lemma, row));
    });
}

function handleRowClick(lemma, clickedRow) {
    const allRows = document.querySelectorAll('#topWordsTable tr');
    const allWords = document.querySelectorAll('.word');

    const isAlreadySelected = clickedRow.classList.contains('selected');

    if (isAlreadySelected) {
        // ✅ Deselect this row and its words
        clickedRow.classList.remove('selected');
        allWords.forEach(wordDiv => {
            if (wordDiv.getAttribute('data-lemma') === lemma) {
                wordDiv.classList.remove('highlighted-from-table');
            }
        });
    } else {
        // ✅ Select this row and highlight words
        clickedRow.classList.add('selected');
        allWords.forEach(wordDiv => {
            if (wordDiv.getAttribute('data-lemma') === lemma) {
                wordDiv.classList.add('highlighted-from-table');
            }
        });
    }
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


let dragEndWord = null;

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
                // console.log(`Contraction fallback: "${word}" → "${base}" + "${suffixPart}"`);
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
            // console.log(`Hyphen fallback: "${word}" → Parts:`, parts);
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
        if (!wordDiv) return;

        isDragging = true;
        dragStartWord = wordDiv;
        justDragged = false;

        const index = wordDiv.getAttribute('data-index');
        const isAlreadySelected = selectedIndexes.has(index);

        // Toggle if it's just a click & release
        wordDiv.dataset._toggleOnMouseUp = isAlreadySelected ? 'deselect' : 'select';

        e.preventDefault(); // prevent browser text selection
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragStartWord) return;

        justDragged = true;

        const wordDiv = e.target.closest('.word');
        if (!wordDiv) return;

        const startIndex = parseInt(dragStartWord.getAttribute('data-index'));
        const currentIndex = parseInt(wordDiv.getAttribute('data-index'));

        const low = Math.min(startIndex, currentIndex);
        const high = Math.max(startIndex, currentIndex);

        for (let i = low; i <= high; i++) {
            const word = container.querySelector(`.word[data-index="${i}"]`);
            if (word) {
                selectedIndexes.add(word.getAttribute('data-index'));
            }
        }

        highlightSelectedWords(container);
    });

    container.addEventListener('click', (e) => {
        const wordDiv = e.target.closest('.word');
        if (!wordDiv) return;

        if (justDragged) {
            justDragged = false;
            return; // skip single click if it was a drag
        }

        const index = wordDiv.getAttribute('data-index');
        const action = wordDiv.dataset._toggleOnMouseUp;

        if (action === 'select') {
            selectedIndexes.add(index);
        } else if (action === 'deselect') {
            selectedIndexes.delete(index);
        }

        highlightSelectedWords(container);
    });
});

// Mouse up — end drag
document.addEventListener('mouseup', () => {
    isDragging = false;
    dragStartWord = null;
    const allSelected = getAllSelectedWords(contentContainer, titleContainer);
    console.log(allSelected.join(' '));
});

// Double-click — clear all
document.addEventListener('dblclick', () => {
    selectedIndexes.clear();
    [contentContainer, titleContainer].forEach(highlightSelectedWords);
});

// Highlight function
function highlightSelectedWords(container) {
    container.querySelectorAll('.word').forEach(word => {
        const index = word.getAttribute('data-index');
        if (selectedIndexes.has(index)) {
            word.classList.add('active');
        } else {
            word.classList.remove('active');
        }
    });
}

function getAllSelectedWords(...containers) {
    
    const allIndexes = [];

    containers.forEach(container => {
        container.querySelectorAll('.word').forEach(word => {
            const index = parseInt(word.getAttribute('data-index'));
            if (selectedIndexes.has(word.getAttribute('data-index'))) {
                allIndexes.push({ index, name: word.getAttribute('data-name') });
            }
        });
    });

    allIndexes.sort((a, b) => a.index - b.index);

    return allIndexes.map(w => w.name);
}


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
        selectedIndexes.clear();
    });
});

const sidePanel = document.getElementById('sidePanel');
const togglePanelBtn = document.getElementById('togglePanelBtn');

togglePanelBtn.addEventListener('click', () => {
    sidePanel.classList.toggle('open');
    togglePanelBtn.textContent = sidePanel.classList.contains('open') ? "Hide Panel" : "Show Panel";
});