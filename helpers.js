export function numberToWords(n) {
  if (n === 0) return 'zero';
  if (n > 999999) return n.toLocaleString(); // fallback for > 999,999

  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];

  const tens = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty',
    'sixty', 'seventy', 'eighty', 'ninety'
  ];

  const thousand = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
    if (n < 1000) {
      return ones[Math.floor(n / 100)] + ' hundred' +
        (n % 100 ? ' ' + thousand(n % 100) : '');
    }
  };

  let result = '';

  if (n >= 1000) {
    result += thousand(Math.floor(n / 1000)) + ' thousand';
    if (n % 1000) {
      result += ' ' + thousand(n % 1000);
    }
  } else {
    result = thousand(n);
  }

  return result.trim();
}

export const numberWords = {
    'zero': 0,
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,

    'ten': 10,
    'eleven': 11,
    'twelve': 12,
    'thirteen': 13,
    'fourteen': 14,
    'fifteen': 15,
    'sixteen': 16,
    'seventeen': 17,
    'eighteen': 18,
    'nineteen': 19,

    'twenty': 20,
    'thirty': 30,
    'forty': 40,
    'fifty': 50,
    'sixty': 60,
    'seventy': 70,
    'eighty': 80,
    'ninety': 90,

    'hundred': 100,
    'thousand': 1000,
    'million': 1000000,
    'billion': 1000000000,
    'trillion': 1000000000000,

    'infinity': Infinity,
    'infinite': Infinity,
    'half': 0.5,

    // plural forms
    'ones': 1,
    'twos': 2,
    'threes': 3,
    'fours': 4,
    'fives': 5,
    'sixes': 6,
    'sevens': 7,
    'eights': 8,
    'nines': 9,

    'tens': 10,
    'dozens': 12,
    'hundreds': 100,
    'thousands': 1000,
    'millions': 1000000,
    'billions': 1000000000,
    'trillions': 1000000000000
  };

export function markSpelledOutNumbers(adjacencyList) {

  for (let i = 0; i < adjacencyList.length; i++) {
    const sequence = [];
    let j = i;

    while (j < adjacencyList.length) {
      const word = adjacencyList[j].text.toLowerCase();

      if (numberWords.hasOwnProperty(word) ||isHyphenatedNumber(word)) {
        sequence.push(adjacencyList[j]);
        j++;
      } else {
        break;
      }
    }

    if (sequence.length > 0) {
      sequence.forEach(token => {
        token.element.classList.add('prominent-number');
      });
      i = j - 1; // skip past the sequence we just marked
    }
  }
}

// helper to check hyphenated numbers
export function isHyphenatedNumber(word, numberWords) {
  if (!word.includes('-')) return false;
  const [part1, part2] = word.split('-');
  return numberWords.hasOwnProperty(part1) && numberWords.hasOwnProperty(part2);
}

