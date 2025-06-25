const container = document.getElementById('content');
container.innerHTML = '';  // Clear placeholder text
let wordIndex = 0;  // Global counter across all sentences

function splitIntoSentences(text) {
    return text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
}

function generateSafeName(text) {
    return text
        .replace(/[^\w\s]|_/g, '')   // Remove punctuation
        .replace(/\s+/g, '')          // Remove all spaces
        .toLowerCase();               // Optional: make lowercase for consistency
}

chrome.storage.local.get(['exportedArticle'], (result) => {
    const articleText = result.exportedArticle || "No article found.";
    const sentences = splitIntoSentences(articleText);
    sentences.forEach(sentence => {
        const p = document.createElement('p');

        sentence.trim().split(/\s+/).forEach(word => {
            const wordDiv = document.createElement('div');
            wordDiv.classList.add('word');
            wordDiv.setAttribute('data-name', generateSafeName(word));
            wordDiv.setAttribute('data-index', wordIndex++);
            wordDiv.textContent = word;

            // Toggle highlight on click
            wordDiv.addEventListener('click', () => {
                wordDiv.classList.toggle('active');
            });

            p.appendChild(wordDiv);
            p.appendChild(document.createTextNode(' '));  // Space between words
        });

        container.appendChild(p);
    });
});

chrome.storage.local.remove(['exportedArticle']);

// DRAGGING LOGIC
let dragStartIndex = null;
let dragEndIndex = null;

let previousLowIndex = null;
let previousHighIndex = null;

let dragStartWord = null;
let dragEndWord = null;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
const dragThreshold = 5;  // Minimum pixel movement to count as drag

// container.addEventListener('mousedown', (e) => {
//     console.log('Mouse down:', e.target);
//     const wordDiv = e.target.closest('.word');
//     console.log('Closest wordDiv:', wordDiv);
//     if (wordDiv) {

//         isDragging = true;
//         // dragStartIndex = parseInt(wordDiv.getAttribute('data-index'));
//         // dragEndIndex = dragStartIndex;
//         dragStartWord = wordDiv;
//         console.log('Drag start word:', dragStartWord);
//         dragEndWord = wordDiv;
//         console.log('Drag end word:', dragEndWord);
//         highlightRange(dragStartWord, dragEndWord);

//         // highlightRange(dragStartIndex, dragEndIndex);

//     }
// });

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

// container.addEventListener('mousemove', (e) => {

//     if (isDragging) {
//         const wordDiv = e.target.closest('.word');
//         if (wordDiv) {
//             dragEndIndex = parseInt(wordDiv.getAttribute('data-index'));
//             highlightRange(dragStartIndex, dragEndIndex);
//         }
//     }
// });



// container.addEventListener('mousemove', (e) => {
//   if (isDragging) {
//     const wordDiv = e.target.closest('.word');
//     if (wordDiv && wordDiv !== dragEndWord) {
//       dragEndWord = wordDiv;
//       highlightRange(dragStartWord, dragEndWord);
//     }
//   }
// });

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

// function highlightRange(startWord, endWord) {
//     const startIndex = parseInt(startWord.getAttribute('data-index'));
//     console.log('Start index:', startIndex);
//     const endIndex = parseInt(endWord.getAttribute('data-index'));
//     console.log('End index:', endIndex);
//     const low = Math.min(startIndex, endIndex);
//     const high = Math.max(startIndex, endIndex);

//     container.querySelectorAll('.word').forEach(word => {
//         const index = parseInt(word.getAttribute('data-index'));
//         if (index >= low && index <= high) {
//             word.classList.add('active');
//         }
//     });
// }

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