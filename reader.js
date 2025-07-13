import { openAgentsDB, openLemmaDB, practiceWord, initializeLemmas, searchAgentsByName, countExactAgent, getAllAgents } from './databasehelpers.js';
import { numberToWords, markSpelledOutNumbers, numberWords, isHyphenatedNumber } from './helpers.js';

let wordIndex = 0;  // Global counter across all sentences
let wordList = [];
let contractionSuffixes = [];
let hyphenatedWords = [];

const selectedIndexes = new Set();
let justDragged = false; // to prevent continuous dragging after mouse release
let isDragging = false;
let dragStartWord = null;

// For Adjacency List and top 5000 words
const adjacencyList = [];
const lemmaSet = new Set();
let top5000Lemmas;

// For Text-To-Speech
let availableVoices = [];
let selectedVoice = null;

// for A+A keyboard shortcut
let lastAKeyTime = 0;

// For V+V keyboard shortcut
let lastVKeyTime = 0;

// For T+T keyboard shortcut
let tastTKeyTime = 0;


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

async function loadAndRenderArticle() {
    chrome.storage.local.get(['exportedArticle', 'exportedTitle'], async (result) => {
        const articleText = result.exportedArticle || "No article found.";
        const articleTitle = result.exportedTitle || "Untitled Article";

        const isInitialized = await new Promise(res => {
            chrome.storage.local.get(['initialized'], result => res(result.initialized));
        });

        const debug = false; // Set to true to debugging; will reinitialize the personalized Lemma database for the User

        console.log("isInitialized:", isInitialized);
        console.log("debug: ", debug);

        if (!isInitialized || debug) {
            await initializeLemmas(wordList);
        }

        // ✅ Clear any previous content
        titleContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        // ✅ Render title with the same word highlighting logic
        renderTextBlock(articleTitle, titleContainer, 'h1');

        // ✅ Render article body
        renderTextBlock(articleText, contentContainer, 'p');

        await markAgentsInAdjacencyList(adjacencyList);
        markProminentNumbers(adjacencyList);  // digit check and mark with .prominent-digit
        attachNumberTooltips(adjacencyList);  // affix a tooltip to .prominent-digit

        markSpelledOutNumbers(adjacencyList); // digit check and mark with .prominent-number
        attachNumberHover(adjacencyList);     // affix a tooltip to .prominent-number

        console.log(adjacencyList);
        console.log(adjacencyList.length, "words rendered in total.");
    });
    chrome.storage.local.remove(['exportedArticle', 'exportedTitle']);
}

async function loadWordList() {
    const url = chrome.runtime.getURL('top5000LexemesAsLemmas.json');
    console.log(url);
    const response = await fetch(url);
    const json = await response.json();
    wordList = json.wordForms;
    const wordForms = json.wordForms;

    console.log("Loaded", wordList.length, "word forms.");

    wordForms.forEach(entry => {
        if (entry.lemma) {
            lemmaSet.add(entry.lemma.toLowerCase());
        }
    });

    contractionSuffixes = wordList
        .filter(entry => entry.word && entry.word?.startsWith("'"))
        .map(entry => entry.word?.toLowerCase());

    hyphenatedWords = wordList
        .filter(entry => entry.word && entry.word?.includes('-'))
        .map(entry => entry.word?.toLowerCase());


    top5000Lemmas = lemmaSet;
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
        block.classList.add('sentence-block');

        // 🎤 Create speaker button
        const speakerBtn = document.createElement('button');
        speakerBtn.classList.add('sentence-speak-btn');
        speakerBtn.textContent = '🔊';
        block.appendChild(speakerBtn);

        const sentenceIndexes = [];

        const p = document.createElement('p');
        sentence.trim().split(/\s+/).forEach(word => {

            const cleanedWord = cleanWordForMatching(word);
            const parts = getLemmaRankWithParts(cleanedWord);

            if (parts) {
                parts.forEach(part => {
                    const wordDiv = document.createElement('div');
                    wordDiv.classList.add('word');

                    const safeWord = generateSafeName(part.text);
                    const currentIndex = wordIndex++;
                    wordDiv.setAttribute('data-name', safeWord);
                    wordDiv.setAttribute('data-index', currentIndex);
                    wordDiv.setAttribute('data-lemma', part.lemma);

                    // Create child container for the text
                    const wordTextSpan = document.createElement('span');
                    wordTextSpan.classList.add('word-text');
                    wordTextSpan.textContent = part.text;
                    wordDiv.appendChild(wordTextSpan);

                    // If ranked, highlight & attach tooltip logic
                    if (part.rank !== 9999) {
                        wordDiv.classList.add('highlighted-word');
                        wordDiv.classList.add(getRankColorClass(part.rank));
                        const posFull = posMap[part.pos] || "Unknown POS";

                        wordDiv.addEventListener('mouseenter', () => {
                            const tooltip = document.createElement('div');
                            tooltip.className = 'custom-tooltip';
                            tooltip.innerHTML = `
                                <strong>Rank:</strong> ${part.rank} - <strong>Lemma:</strong> ${part.lemma}<br/>
                                <strong>Part of Speech:</strong> ${posFull}`;
                            wordDiv.appendChild(tooltip);
                        });

                        wordDiv.addEventListener('mouseleave', () => {
                            const existingTooltip = wordDiv.querySelector('.custom-tooltip');
                            if (existingTooltip) existingTooltip.remove();
                        });

                        // Add pos-badge as separate child
                        const posBadge = document.createElement('div');
                        posBadge.classList.add('pos-badge');
                        posBadge.textContent = posBadgeIcons[part.pos] || "?";
                        wordDiv.appendChild(posBadge);
                    }

                    // Save to adjacency list
                    adjacencyList.push({
                        index: currentIndex,
                        text: safeWord,
                        element: wordDiv
                    });

                    // Ensure tooltip doesn’t overflow viewport
                    setTimeout(() => {
                        const rect = wordDiv.getBoundingClientRect();
                        const tooltipWidth = 300;
                        const viewportRight = window.innerWidth;
                        if (rect.right + tooltipWidth + 20 > viewportRight) {
                            wordDiv.classList.add('shift-left');
                        }
                    }, 0);

                    wordDiv.addEventListener('click', () => {
                        wordDiv.classList.toggle('active');
                    });

                    block.appendChild(wordDiv);
                    block.appendChild(document.createTextNode(' '));

                    sentenceIndexes.push(currentIndex);
                });
            } else {
                // fallback for words without `parts`
                const wordDiv = document.createElement('div');
                wordDiv.classList.add('word');

                const safeWord = generateSafeName(word);
                const currentIndex = wordIndex++;
                wordDiv.setAttribute('data-name', safeWord);
                wordDiv.setAttribute('data-index', currentIndex);

                // create child for plain text
                const wordTextSpan = document.createElement('span');
                wordTextSpan.classList.add('word-text');
                wordTextSpan.textContent = word;
                wordDiv.appendChild(wordTextSpan);

                adjacencyList.push({
                    index: currentIndex,
                    text: safeWord,
                    element: wordDiv
                });

                block.appendChild(wordDiv);
                block.appendChild(document.createTextNode(' '));

                sentenceIndexes.push(currentIndex);
            }
        });

        // 🎤 Attach click to speaker button
        speakerBtn.addEventListener('click', () => {
            // clear previous
            selectedIndexes.clear();

            // select sentence words
            sentenceIndexes.forEach(idx => selectedIndexes.add(String(idx)));

            highlightSelectedWords(containerElement); // updates UI

            speakSelectedWords(); // speaks them
        });

        containerElement.appendChild(block);
    });

    if (wrapperTag === 'p') {
        buildTop15WordList(text);
    }

    chrome.storage.local.remove(['exportedArticle', 'exportedTitle']);
}

async function markAgentsInAdjacencyList(adjacencyList) {
    const agents = await getAllAgents();

    const agentsById = new Map(agents.map(a => [a.id, a]));

    const agentsByWords = agents.map(agent => ({
        ...agent,
        words: agent.name.toLowerCase().split(/\s+/)
    }));

    for (const agent of agentsByWords) {
        const agentLen = agent.words.length;

        // Skip single-word company if needed
        if (agentLen === 1 && agent.type === 'company') {
            if (top5000Lemmas.has(agent.words[0])) {
                continue
            }
        }

        for (let i = 0; i <= adjacencyList.length - agentLen; i++) {
            const slice = adjacencyList.slice(i, i + agentLen);

            const match = slice.every((token, idx) => {
                return token.text.toLowerCase() === agent.words[idx];
            });

            if (match) {
                slice.forEach(token => {
                    token.element.classList.add('prominent-agent');
                    token.element.dataset.agentId = agent.id;
                });
                // optionally skip ahead to avoid overlapping matches:
                i += agentLen - 1;
            }
        }
    }
    attachAgentTooltips(adjacencyList, agentsById);
}

function attachAgentTooltips(adjacencyList, agentsById) {
    const tooltip = document.createElement('div');
    tooltip.className = 'agent-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.background = '#222';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '2px 6px';
    tooltip.style.fontSize = '0.8em';
    tooltip.style.borderRadius = '4px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '9999';
    document.body.appendChild(tooltip);

    adjacencyList.forEach(token => {
        if (!token.element.classList.contains('prominent-agent')) return;

        token.element.addEventListener('mouseenter', () => {
            const agentId = parseInt(token.element.dataset.agentId, 10);
            const agent = agentsById.get(agentId);

            let nameToShow = agent.name;

            if (agent.type === 'alias' && agent.aliasOf) {
                const original = agentsById.get(agent.aliasOf);
                if (original) {
                    nameToShow = `${agent.name} → ${original.name}`;
                }
            }

            tooltip.textContent = nameToShow;

            const rect = token.element.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 24}px`;
            tooltip.style.display = 'block';
        });

        token.element.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

function markProminentNumbers(adjacencyList) {
    for (let i = 0; i < adjacencyList.length; i++) {
        const numberParts = [];
        let j = i;

        while (j < adjacencyList.length) {
            const current = adjacencyList[j];

            // Check if it looks like a number
            if (/^\d+$/.test(current.text)) {
                numberParts.push(current);
                j++;
            } else {
                break; // stop as soon as non-number found
            }
        }

        if (numberParts.length > 0) {
            numberParts.forEach(part => {
                part.element.classList.add('prominent-digit');
            });
            i = j - 1; // skip ahead to end of sequence
        }
    }
}

function attachNumberTooltips(adjacencyList) {
    const tooltip = document.createElement('div');
    tooltip.className = 'number-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    adjacencyList.forEach((token, i) => {
        if (!token.element.classList.contains('prominent-digit')) return;

        token.element.addEventListener('mouseenter', () => {
            const sequence = [];
            let left = i;

            // move left
            while (left >= 0 && adjacencyList[left].element.classList.contains('prominent-digit')) {
                left--;
            }
            left++; // step back to first

            // move right
            let right = i;
            while (right < adjacencyList.length && adjacencyList[right].element.classList.contains('prominent-digit')) {
                right++;
            }
            right--; // last one in sequence

            // build full number
            for (let j = left; j <= right; j++) {
                sequence.push(adjacencyList[j].text.replace(/[,]/g, ''));
            }

            const fullNumber = sequence.join('');
            tooltip.textContent = fullNumber + ' (' + numberToWords(parseInt(fullNumber)) + ')';


            const rect = token.element.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 24}px`;
            tooltip.style.display = 'block';
        });

        token.element.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

function attachNumberHover(adjacencyList) {
    const tooltip = document.createElement('div');
    tooltip.className = 'number-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    adjacencyList.forEach((token, i) => {
        if (!token.element.classList.contains('prominent-number')) return;

        token.element.addEventListener('mouseenter', () => {
            const sequence = [];
            let left = i;

            // move left
            while (left >= 0 && adjacencyList[left].element.classList.contains('prominent-number')) {
                left--;
            }
            left++;

            // move right
            let right = i;
            while (right < adjacencyList.length && adjacencyList[right].element.classList.contains('prominent-number')) {
                right++;
            }
            right--;

            for (let j = left; j <= right; j++) {
                sequence.push(adjacencyList[j]);
            }

            const textParts = sequence.map(t => t.text).join(' ');

            const numericParts = sequence.map(t => {
                const word = t.text.toLowerCase();
                if (numberWords[word]) return numberWords[word];
                if (isHyphenatedNumber(word)) {
                    const [p1, p2] = word.split('-');
                    return numberWords[p1] + '-' + numberWords[p2];
                }
                return word;
            }).join(' ');

            tooltip.textContent = `${textParts} → ${numericParts}`;

            const rect = token.element.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 24}px`;
            tooltip.style.display = 'block';
        });

        token.element.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}


function markAgentProminent(element) {
    element.classList.add('prominent-agent');
}

function populateVoiceSelect() {
    const voiceSelect = document.getElementById('voiceSelect');
    voiceSelect.innerHTML = ''; // clear any previous options

    availableVoices = speechSynthesis.getVoices()
        .filter(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.default));

    availableVoices.forEach((voice, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    selectedVoice = availableVoices[0] || null;
}

speechSynthesis.onvoiceschanged = populateVoiceSelect;

document.getElementById('voiceSelect').addEventListener('change', (e) => {
    const idx = e.target.value;
    selectedVoice = availableVoices[idx];
});

async function buildTop15WordList(articleText) {
    const wordFrequency = {};
    const today = new Date().toISOString().split("T")[0];

    const words = articleText.split(/\s+/).map(w => cleanWordForMatching(w?.toLowerCase()));

    // Collect all candidate lemmas from article
    words.forEach(word => {
        const entry = wordList.find(e => e.word?.toLowerCase() === word);
        if (entry) {
            const lemma = entry.lemma;
            if (!wordFrequency[lemma]) {
                wordFrequency[lemma] = {
                    lemma,
                    lemRank: parseInt(entry.lemRank),
                    partOfSpeech: entry.PoS,
                    count: 0,
                    word: entry.word
                };
            }
            wordFrequency[lemma].count++;
        }
    });

    const db = await openLemmaDB();
    const tx = db.transaction("lemmas", "readonly");
    const store = tx.objectStore("lemmas");

    const allLemmasInArticle = Object.values(wordFrequency);

    const filtered = [];

    // Check each lemma in the DB
    for (const item of allLemmasInArticle) {
        const key = `${item.word}_${item.partOfSpeech}`;
        const record = await new Promise((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        let due = false;

        if (!record || !record.nextReview) {
            due = true;
        } else {
            const nextReviewDate = record.nextReview.split("T")[0];
            if (nextReviewDate <= today) due = true;
        }

        if (due) {
            filtered.push(item);
        }
    }

    // Sort: by lemRank ascending (high priority) then count descending
    const sorted = filtered
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
            <td><button class="speak-btn" data-word="${item.word}" data-part="${item.partOfSpeech}">🔊</button></td>
            <td><button class="practice-btn" data-word="${item.word}" data-part="${item.partOfSpeech}">✅</button></td>
        `;

        tableBody.appendChild(row);

        row.addEventListener('click', () => handleRowClick(item.lemma, row));
    });

    document.querySelectorAll('.speak-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const word = btn.dataset.word;
            speakWord(word);
        });
    });
}


function speakWord(word = "") {

    let text;
    if (!word) {
        text = document.getElementById('speechText').textContent;
    } else {
        text = word;
    }

    const rate = parseFloat(document.getElementById('speechRate').value);
    const pitch = parseFloat(document.getElementById('speechPitch').value);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    speechSynthesis.speak(utterance);
}

function handleRowClick(lemma, clickedRow) {
    const allRows = document.querySelectorAll('#topWordsTable tr');
    const allWords = document.querySelectorAll('.word');

    if (event.target.closest('.speak-btn') || event.target.closest('.practice-btn')) {
        return; // don’t change selection if clicking on the speaker or practice button
    }

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

// DRAG AND SELECT LOGIC FOR TEXT HIGHLIGHTING
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

    const indices = Array.from(selectedIndexes).map(Number).sort((a, b) => a - b);
    const selectedWords = indices.map(index => {
        const wordDiv = document.querySelector(`.word[data-index="${index}"]`);
        const textSpan = wordDiv?.querySelector('.word-text');
        return textSpan ? textSpan.textContent.trim() : '';
    }).join(' ');

    document.getElementById('speechText').textContent = selectedWords;
});

// Double-click — clear all
document.addEventListener('dblclick', () => {
    selectedIndexes.clear();
    [contentContainer, titleContainer].forEach(highlightSelectedWords);
});

// HANDLE DOUBLE T+T KEY TO OPEN TOP WORDS PANEL
document.addEventListener('keydown', (e) => {
    const now = Date.now();

    if (e.key.toLowerCase() === 't') {
        if (now - tastTKeyTime < 500) {
            // two t's pressed quickly
            openTopWordsPanel()
            tastTKeyTime = 0; // reset
        } else {
            tastTKeyTime = now;
        }
    }
});

function openTopWordsPanel() {
    document.getElementById('sidePanel').classList.add('open');
    const sidePanel = document.getElementById('sidePanel');
    const mainContent =  document.getElementById('mainContent');
    mainContent.style.marginRight = '250px';
    
    document.getElementById('closeSidePanel').onclick = () => {
        sidePanel.style.display = 'none';
        mainContent.style.marginRight = '0x';
    };
}


// HANDLE DOUBLE A+A KEY TO OPEN AGENT PANEL
document.addEventListener('keydown', (e) => {
    const now = Date.now();

    if (e.key.toLowerCase() === 'a') {
        if (now - lastAKeyTime < 500) {
            openAgentPanel();
        } else {
            lastAKeyTime = now;
        }
    }
});

function openAgentPanel() {
    document.getElementById('agentPanel').classList.add('open');

    const agentInput = document.getElementById('agentInput');
    const selectedWords = getAllSelectedWords(contentContainer, titleContainer);
    const properName = toTitleCase(selectedWords.join(' '));

    agentInput.value = properName;
    mainContent.style.marginRight = '250px';
}

// HANDLE DOUBLE V+V KEY TO SPEAK SELECTED WORDS
document.addEventListener('keydown', (e) => {
    const now = Date.now();

    if (e.key.toLowerCase() === 'v') {
        if (now - lastVKeyTime < 500) {
            // two v's pressed quickly
            speakSelectedWords();
            showSpeechPanel();
            lastVKeyTime = 0; // reset
        } else {
            lastVKeyTime = now;
        }
    }
});

function showSpeechPanel() {
    const panel = document.getElementById('speechPanel');
    panel.style.display = 'block';
    panel.style.marginRight = '250px';
    const mainContent =  document.getElementById('mainContent');
    mainContent.style.marginRight = '250px';

    console.log(panel);

    const indices = Array.from(selectedIndexes).map(Number).sort((a, b) => a - b);
    const selectedWords = indices.map(index => {
        const wordDiv = document.querySelector(`.word[data-index="${index}"]`);
        const textSpan = wordDiv?.querySelector('.word-text');
        return textSpan ? textSpan.textContent.trim() : '';
    }).join(' ');

    console.log(selectedWords);

    document.getElementById('speechText').textContent = selectedWords;

    document.getElementById('closeSpeechPanel').onclick = () => {
        panel.style.display = 'none';
        panel.style.marginRight = '0px';
        mainContent.style.marginRight = '0px';
    };
}

// HANDLE PLAY BUTTON FOR SPEECH
document.getElementById('playSpeech').onclick = () => speakWord();

// HANDLE CLOSING OF SPEECH PANEL
document.getElementById('closeSpeechPanel').onclick = () => {
    document.getElementById('speechPanel').style.display = 'none';
    document.getElementById('mainContent').style.marginRight = '0px';
};

function speakSelectedWords() {
    if (selectedIndexes.size === 0) return;

    // get the indices as numbers & sort
    const indices = Array.from(selectedIndexes).map(Number).sort((a, b) => a - b);

    console.log(indices);

    const selectedWords = indices.map(index => {
        const wordDiv = document.querySelector(`.word[data-index="${index}"]`);
        const textSpan = wordDiv?.querySelector('.word-text');
        return textSpan ? textSpan.textContent.trim() : '';
    }).join(' ');

    console.log("Speaking:", selectedWords);
    speakWord(selectedWords);
}

// HANDLE CLICK ON PRACTICE BUTTONS
document.addEventListener('click', e => {
    const btn = e.target.closest('.practice-btn');
    if (!btn) return;

    console.log("Practice button clicked:", btn);

    const word = btn.dataset.word;
    const pos = btn.dataset.part;

    console.log("Practice button clicked for word:", word, "with pos:", pos);

    if (!word || !pos) {
        console.warn("No word or pos found");
        return;
    }

    practiceWord(word, pos).then(() => {
        btn.textContent = "✔️ Done";
        btn.disabled = true;
    });
});

// HANDLING CLOSING OF SHORTCUTS PANEL
document.getElementById('closeShortcutsPanel').addEventListener('click', () => {
    document.getElementById('shortcutsPanel').style.display = 'none';
});

// HANDLING CLOSING OF AGENT PANEL
document.getElementById('closeAgentPanel').addEventListener('click', () => {
    document.getElementById('agentPanel').classList.remove('open');
    if (document.getElementById('sidePanel').classList.contains('open')) {
        mainContent.style.marginRight = '250px';
        mainContent.style.display = 'block';
    } else {
        mainContent.style.marginRight = '0';
        mainContent.style.display = 'none';
    }
});

// HANDLING SECONDARY CLOSING OF PANELS WITH ESCAPE KEY
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const panels = [
            '#agentPanel',
            '#shortcutsPanel',
            '#sidePanel',
            '#speechPanel'
        ];

        for (const selector of panels) {
            const mainContent =  document.getElementById('mainContent');
            const panel = document.querySelector(selector);
            if (panel && panel.classList.contains('open')) {
                panel.classList.remove('open');

                if (selector === '#sidePanel' || selector === '#agentPanel' || selector === '#speechPanel') {
                    mainContent.style.marginRight = '0px';
                }

                break; // stop after closing the first open one
            } else if (panel && selector == '#shortcutsPanel' && panel.style.display === 'block') {
                panel.style.display = 'none';
                mainContent.style.marginRight = '0px';
            } else if (panel && selector == '#speechPanel' && panel.style.display === 'block') {
                panel.style.display = 'none';
                mainContent.style.marginRight = '0px';
            }
        }
    }
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

function toTitleCase(str) {
    return str
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
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

// HANDLE SIDE PANEL TOGGLE 
const sidePanel = document.getElementById('sidePanel');
const togglePanelBtn = document.getElementById('togglePanelBtn');

togglePanelBtn.addEventListener('click', () => {
    sidePanel.classList.toggle('open');
    const main = document.getElementById('mainContent');
    togglePanelBtn.textContent = sidePanel.classList.contains('open') ? "Hide Panel" : "Show Panel";

    main.style.marginRight = sidePanel.classList.contains('open') ? '250px' : '0'; // dev

    if (main.style.marginRight === '250px') {
        document.getElementById('agentPanel').classList.remove('open');
    }
});

// HANDLE SHORTCUTS PANEL TOGGLE
const shortcutsBtn = document.getElementById('shortcutsBtn');
const shortcutsPanel = document.getElementById('shortcutsPanel');

shortcutsBtn.addEventListener('click', () => {
    shortcutsPanel.style.display =
        shortcutsPanel.style.display === 'block' ? 'none' : 'block';
});

const aliasForContainer = document.getElementById('aliasForContainer');
const aliasForInput = document.getElementById('aliasForInput');
const suggestions = document.getElementById('suggestions');
let aliasOfId = null;

// CLICK OF AGENT REGISTRATION BUTTON
document.getElementById('registerAgentBtn').addEventListener('click', async () => {
    const name = document.getElementById('agentInput').value.trim();
    const type = document.querySelector('input[name="agentType"]:checked')?.value;

    // The ID of the alias being created
    aliasOfId = null;
    if (type === 'alias') {
        aliasOfId = parseInt(document.getElementById('aliasForInput').dataset.aliasOfId, 10);
        if (!aliasOfId || isNaN(aliasOfId)) {
            alert("Please select a valid target for alias.");
            return;
        }
    }

    if (!name || !type) {
        alert("Please enter a name.");
        return;
    }

    if (type === 'alias' && (!aliasOfId || isNaN(aliasOfId))) {
        alert("Please select a valid target for alias.");
        return;
    }

    const agent = {
        name,
        type,
        aliasOf: type === 'alias' ? aliasOfId : null
    };

    await saveAgent(agent);

    alert("Agent saved!");
    document.getElementById('agentInput').value = '';
    document.getElementById('matchStatus').value = '';
    aliasForInput.value = '';
    aliasForInput.dataset.aliasOfId = '';
    aliasOfId = null;
    suggestions.innerHTML = '';
    aliasForContainer.style.display = 'none';
    document.querySelectorAll('input[name="agentType"]').forEach(r => r.checked = false);
});

// Show/hide alias input
document.querySelectorAll('input[name="agentType"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (radio.value === 'alias' && radio.checked) {
            aliasForContainer.style.display = 'block';
        } else if (radio.checked) {
            aliasForContainer.style.display = 'none';
            aliasForInput.value = '';
            aliasForInput.dataset.aliasOfId = '';
            aliasOfId = null;
            suggestions.innerHTML = '';
        }
    });
});

async function saveAgent(agent) {
    const db = await openAgentsDB();
    const tx = db.transaction("agents", "readwrite");
    const store = tx.objectStore("agents");

    store.add(agent);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

document.getElementById('aliasForInput').addEventListener('keyup', async (e) => {
    const query = e.target.value.trim();
    if (!query) return;

    const results = await searchAgentsByName(query);

    const suggestions = document.getElementById('suggestions');
    suggestions.innerHTML = '';
    results.forEach(agent => {
        const li = document.createElement('li');
        li.textContent = `${agent.name} (${agent.type})`;
        li.addEventListener('click', () => {
            e.target.value = agent.name;
            suggestions.innerHTML = '';
            e.target.dataset.aliasOfId = agent.id; // store the id for saving later
        });
        suggestions.appendChild(li);
    });
});

const nameInput = document.getElementById('agentInput');
const typeRadios = document.querySelectorAll('input[name="agentType"]');
const matchStatus = document.getElementById('matchStatus'); // a small div or span to show the count

// WHILE TYPING IN AGENT REGISTRATION INPUT - MATCH COUNT TO PREVENT DUPLICATES
async function checkForExactMatch() {
    const name = nameInput.value.trim();
    const type = document.querySelector('input[name="agentType"]:checked')?.value;

    if (!name || !type) {
        matchStatus.textContent = '';
        return;
    }

    const count = await countExactAgent(name, type);
    if (count === 0) {
        matchStatus.textContent = '✅ No existing agents with this name and type.';
    } else {
        matchStatus.textContent = `⚠️ ${count} existing agent(s) already match this name and type.`;
    }
}

// check when typing the name
nameInput.addEventListener('keyup', checkForExactMatch);

// check when changing type
typeRadios.forEach(radio => {
    radio.addEventListener('change', checkForExactMatch);
});

document.addEventListener('DOMContentLoaded', () => {
    const rateSlider = document.getElementById('speechRate');
    const pitchSlider = document.getElementById('speechPitch');
    const rateValue = document.getElementById('rateValue');
    const pitchValue = document.getElementById('pitchValue');

    // Initialize display
    rateValue.textContent = rateSlider.value;
    pitchValue.textContent = pitchSlider.value;

    rateSlider.addEventListener('input', () => {
        rateValue.textContent = rateSlider.value;
    });

    pitchSlider.addEventListener('input', () => {
        pitchValue.textContent = pitchSlider.value;
    });
});