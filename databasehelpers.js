export async function openAgentsDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("AgentsDB", 1);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("agents")) {
                db.createObjectStore("agents", { keyPath: "id", autoIncrement: true });
            }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export function openLemmaDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("LemmaSpacedRepDB", 3);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            if (!db.objectStoreNames.contains("lemmas")) {
                db.createObjectStore("lemmas", { keyPath: "key" });
            }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function searchAgentsByName(query) {
    const db = await openAgentsDB();
    const tx = db.transaction("agents", "readonly");
    const store = tx.objectStore("agents");

    return new Promise((resolve) => {
        const results = [];
        const request = store.openCursor();

        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const { name, type } = cursor.value;
                if (
                    type !== 'alias' &&
                    name.toLowerCase().includes(query.toLowerCase())
                ) {
                    results.push(cursor.value);
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
    });
}

export async function countExactAgent(name, type) {
    const db = await openAgentsDB();
    const tx = db.transaction("agents", "readonly");
    const store = tx.objectStore("agents");

    return new Promise((resolve) => {
        let count = 0;
        const request = store.openCursor();

        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const agent = cursor.value;
                if (
                    agent.name.trim().toLowerCase() === name.trim().toLowerCase() &&
                    agent.type === type
                ) {
                    count++;
                }
                cursor.continue();
            } else {
                resolve(count);
            }
        };
    });
}

export async function getAllAgents() {
    const db = await openAgentsDB();
    const tx = db.transaction("agents", "readonly");
    const store = tx.objectStore("agents");

    return new Promise((resolve, reject) => {
        const agents = [];
        const req = store.openCursor();
        req.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                agents.push(cursor.value);
                cursor.continue();
            } else {
                resolve(agents);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

const srMapping = [0, 1, 3, 7, 14, 30, 45, 60, 75, 90, 120, 180, 365]; // Spaced repetition intervals in days

export async function initializeLemmas(wordList) {
    const isInitialized = await new Promise(res => {
        chrome.storage.local.get(['initialized'], result => res(result.initialized));
    });

    const debug = false; // Set to true for debugging, which will update Spaced-Reptition intervals despite counter-indications

    if (isInitialized && !debug) {
        console.log("Already initialized");
        return;
    }

    const db = await openLemmaDB();
    const tx = db.transaction("lemmas", "readwrite");
    const store = tx.objectStore("lemmas");

    wordList.forEach(item => {
        const key = `${item.word}_${item.PoS}`; // ✅ new unique key

        const record = {
            key,                             // primary key
            word: item.word,                // surface word
            lemma: item.lemma,              // base lemma
            lemRank: item.lemRank,          // rank of the lemma
            partOfSpeech: item.PoS,         // POS
            lastUpdated: null,             // date of last practice
            reps: 0,                       // repetition count
            srIndex: 0,                    // spaced-rep stage
            srDay: srMapping[0],           // next interval in days
            nextReview: null               // when to review next
        };

        store.put(record);
    });

    tx.oncomplete = () => {
        chrome.storage.local.set({ initialized: true });
        console.log("Lemmas initialized!");
    };

    tx.onerror = () => {
        console.error("Error initializing lemmas", tx.error);
    };
}

export async function practiceWord(word, pos) {
    const key = `${word}_${pos}`;
    const db = await openLemmaDB();
    const tx = db.transaction("lemmas", "readwrite");
    const store = tx.objectStore("lemmas");

    const record = await new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    if (!record) {
        console.warn(`Word "${word}" with POS "${pos}" not found`);
        return;
    }

    record.reps += 1;

    const now = new Date();
    const today = now.toISOString().split("T")[0]; // yyyy-mm-dd
    record.lastUpdated = now.toISOString();

    // 📋 Only advance SR if due
    if (!record.nextReview || today >= nextReviewDate) {
        if (record.srIndex < srMapping.length - 1) {
            record.srIndex += 1;
        }

        record.srDay = srMapping[record.srIndex];

        const nextReview = new Date(now);
        nextReview.setDate(now.getDate() + record.srDay);
        record.nextReview = nextReview.toISOString();

        console.log(`📈 SR advanced → index: ${record.srIndex}, nextReview: ${record.nextReview}`);
    } else {
        console.log(`🕒 Not due yet → keeping current SR index: ${record.srIndex}, nextReview: ${record.nextReview}`);
    }

    await new Promise((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });

    console.log(`✅ Practiced "${word}" (${pos}) → reps: ${record.reps}, next review: ${record.nextReview}`);
}




// // // SHORTCUT --> WIPE THE LEMMA DATABASE CLEAN
// // indexedDB.deleteDatabase("LemmaSpacedRepDB");