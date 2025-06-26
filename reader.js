const container = document.getElementById('content');
container.innerHTML = '';  // Clear placeholder text
let wordIndex = 0;  // Global counter across all sentences
let wordList = [];
let contractionSuffixes = [];
let hyphenatedWords = [];

// The main loader for words and rank
async function initReaderPage() {
    await loadWordList();  // Wait for JSON to fully load
    console.log("Word list ready. Now rendering article...");
    renderArticleText();   // render word/sentence DOM
}

initReaderPage()

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

function renderArticleText() {
    chrome.storage.local.get(['exportedArticle'], (result) => {
        const articleText = result.exportedArticle || "No article found.";
        const sentences = splitIntoSentences(articleText);
        sentences.forEach(sentence => {
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
                            wordDiv.setAttribute('title', `Rank: ${part.rank}`);
                        }

                        wordDiv.textContent = part.text;

                        wordDiv.addEventListener('click', () => {
                            wordDiv.classList.toggle('active');
                        });

                        p.appendChild(wordDiv);
                        p.appendChild(document.createTextNode(' '));
                    });
                } else {
                    // Word totally not found → still render the original word as-is
                    const wordDiv = document.createElement('div');
                    wordDiv.classList.add('word');
                    wordDiv.setAttribute('data-name', generateSafeName(word));
                    wordDiv.setAttribute('data-index', wordIndex++);
                    wordDiv.textContent = word;

                    p.appendChild(wordDiv);
                    p.appendChild(document.createTextNode(' '));
                }



                // const wordDiv = document.createElement('div');
                // wordDiv.classList.add('word');
                // wordDiv.setAttribute('data-name', generateSafeName(word));
                // wordDiv.setAttribute('data-index', wordIndex++);

                // const rank = getLemmaRankForWordWithFallbacks(cleanedWord);

                // if (rank !== 9999) {
                //     // console.log(`Word: ${cleanedWord}, Rank: ${rank}`);
                //     wordDiv.classList.add('highlighted-word');
                //     wordDiv.classList.add(getRankColorClass(rank));
                //     wordDiv.setAttribute('title', `Rank: ${rank}`);
                // } else {
                //     // console.log(`Word: ${cleanedWord} not found in word list.`);
                // }

                // wordDiv.textContent = word;

                // // Toggle highlight on click
                // wordDiv.addEventListener('click', () => {
                //     wordDiv.classList.toggle('active');
                // });

                // p.appendChild(wordDiv);
                // p.appendChild(document.createTextNode(' '));  // Space between words
            });

            container.appendChild(p);
        });
    });
    chrome.storage.local.remove(['exportedArticle']);
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

container.addEventListener('mousedown', (e) => {
    const wordDiv = e.target.closest('.word');
    if (wordDiv) {
        isDragging = true;
        dragStartWord = wordDiv;
        previousLowIndex = null;
        previousHighIndex = null;
    }
});

function clearAllHighlights() {
    container.querySelectorAll('.word.active').forEach(word => {
        word.classList.remove('active');
    });
}

function getLemmaRankForWord(word) {
    if (!wordList || wordList.length === 0) return 9999;  // Defensive check in case wordList hasn't loaded yet
    const match = wordList.find(entry => entry.word?.trim().toLowerCase() === word.trim().toLowerCase());
    return match ? match.lemRank : 9999;
}

function getLemmaRankWithParts(word) {
    const cleanedWord = cleanWordForMatching(word);

    if (!cleanedWord) return null;

    const lowerWord = cleanedWord.toLowerCase();

    // 1. Direct match
    const directRank = getLemmaRankForWord(cleanedWord);
    if (directRank !== 9999) {
        return [{ text: word, rank: directRank }];
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

            const baseRank = getLemmaRankForWord(normalizeApostrophes(base.toLowerCase()));
            const suffixRank = getLemmaRankForWord(normalizeApostrophes(suffixPart.toLowerCase()));
            if (baseRank !== 9999 && suffixRank !== 9999) {
                console.log(`Contraction fallback: "${word}" → "${base}" + "${suffix}"`);
                return [
                    { text: base, rank: baseRank },
                    { text: suffixPart, rank: suffixRank }
                ];
            }
        }
    }

    // Hyphen fallback
    if (word.includes('-')) {
        const parts = word.split('-').filter(p => p);
        const partRanks = parts.map(part => getLemmaRankForWord(part));
        if (partRanks.every(r => r !== 9999)) {
            console.log(`Hyphen fallback: "${word}" → Parts:`, parts);
            return parts.map((part, idx) => ({ text: part, rank: partRanks[idx] }));
        }
    }

    return null;  // Total miss
}

container.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const wordDiv = e.target.closest('.word');
        if (wordDiv) {
            const newEndIndex = parseInt(wordDiv.getAttribute('data-index'));

            // ✅ Clear previous range
            if (previousLowIndex !== null && previousHighIndex !== null) {
                clearRange(previousLowIndex, previousHighIndex);
            }

            // ✅ Apply new range
            const startIndex = parseInt(dragStartWord.getAttribute('data-index'));
            const low = Math.min(startIndex, newEndIndex);
            const high = Math.max(startIndex, newEndIndex);

            highlightRange(low, high);

            // ✅ Track this new range for next move
            previousLowIndex = low;
            previousHighIndex = high;
        }
    }
});

function highlightRange(low, high) {
    container.querySelectorAll('.word').forEach(word => {
        const index = parseInt(word.getAttribute('data-index'));
        if (index >= low && index <= high) {
            word.classList.add('active');
        }
    });
}

function clearRange(low, high) {
    container.querySelectorAll('.word').forEach(word => {
        const index = parseInt(word.getAttribute('data-index'));
        if (index >= low && index <= high) {
            word.classList.remove('active');
        }
    });
}

document.addEventListener('mouseup', () => {
    isDragging = false;
    dragStartWord = null;
    dragEndWord = null;
});

function highlightRange(start, end) {
    const low = Math.min(start, end);
    const high = Math.max(start, end);

    container.querySelectorAll('.word').forEach(word => {
        const index = parseInt(word.getAttribute('data-index'));
        if (index >= low && index <= high) {
            word.classList.add('active');
        }
    });
}

function toggleWordActive(pElement) {
    if (!pElement.classList.contains('active')) {
        pElement.classList.add('active');
    }

}
container.addEventListener('dblclick', () => {
    console.log('Double-click detected. Clearing all active highlights...');
    container.querySelectorAll('.word.active').forEach(word => {
        word.classList.remove('active');
    });
});