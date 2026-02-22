import { Card, Suit, Rank, RANKS, RANK_VALUES, Difficulty, GameState } from './types';

function createDeck(suits: Suit[]): Card[] {
  const deck: Card[] = [];
  let idCounter = 0;
  for (const suit of suits) {
    for (const rank of RANKS) {
      deck.push({
        id: `card-${idCounter++}-${suit}-${rank}`,
        suit,
        rank,
        faceUp: false,
      });
    }
  }
  return deck;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createGame(difficulty: Difficulty): GameState {
  let suits: Suit[];
  if (difficulty === 1) {
    suits = ['♠'];
  } else if (difficulty === 2) {
    suits = ['♠', '♥'];
  } else {
    suits = ['♠', '♥', '♦', '♣'];
  }

  // Spider Solitaire uses 2 full decks = 104 cards
  // For 1 suit: 8 copies of spades deck (8*13=104)
  // For 2 suits: 4 copies of each suit deck (4*2*13=104)
  // For 4 suits: 2 copies of each suit deck (2*4*13=104)
  const repeats = Math.floor(8 / suits.length);
  let allCards: Card[] = [];
  for (let i = 0; i < repeats; i++) {
    allCards = allCards.concat(createDeck(suits).map((c, idx) => ({
      ...c,
      id: `card-${i}-${idx}-${c.suit}-${c.rank}`,
    })));
  }

  allCards = shuffle(allCards);

  // Deal: 10 columns, first 4 get 6 cards, last 6 get 5 cards = 54 cards
  // Remaining 50 cards go to stock (5 deals of 10)
  const columns: Card[][] = Array.from({ length: 10 }, () => []);
  let cardIdx = 0;

  for (let col = 0; col < 10; col++) {
    const numCards = col < 4 ? 6 : 5;
    for (let row = 0; row < numCards; row++) {
      const card = { ...allCards[cardIdx++] };
      // Last card in each column is face up
      if (row === numCards - 1) {
        card.faceUp = true;
      }
      columns[col].push(card);
    }
  }

  // Remaining cards go to stock piles (5 groups of 10)
  const stock: Card[][] = [];
  while (cardIdx < allCards.length) {
    const pile: Card[] = [];
    for (let i = 0; i < 10 && cardIdx < allCards.length; i++) {
      pile.push({ ...allCards[cardIdx++] });
    }
    stock.push(pile);
  }

  return {
    columns,
    stock,
    completedRuns: 0,
    score: 500,
    moves: 0,
    difficulty,
  };
}

export function getRankValue(rank: Rank): number {
  return RANK_VALUES[rank];
}

// Check if a sequence of cards from startIndex forms a valid run (descending, same suit)
export function isValidSequence(cards: Card[], startIndex: number): boolean {
  for (let i = startIndex; i < cards.length; i++) {
    if (!cards[i].faceUp) return false;
    if (i > startIndex) {
      if (cards[i].suit !== cards[i - 1].suit) return false;
      if (getRankValue(cards[i - 1].rank) - getRankValue(cards[i].rank) !== 1) return false;
    }
  }
  return true;
}

// Check if we can move cards[startIndex..] from source to target column
export function canMoveCards(
  sourceCol: Card[],
  startIndex: number,
  targetCol: Card[]
): boolean {
  if (startIndex < 0 || startIndex >= sourceCol.length) return false;
  
  // The sequence being moved must be valid (same suit, descending)
  if (!isValidSequence(sourceCol, startIndex)) return false;

  // Can always move to empty column
  if (targetCol.length === 0) return true;

  // Top card of target must be one rank higher than bottom card of sequence
  const targetTopCard = targetCol[targetCol.length - 1];
  const movingBottomCard = sourceCol[startIndex];

  if (!targetTopCard.faceUp) return false;

  return getRankValue(targetTopCard.rank) - getRankValue(movingBottomCard.rank) === 1;
}

// Check for a complete run (K to A, same suit) at the bottom of a column
export function checkCompleteRun(column: Card[]): { found: boolean; startIndex: number } {
  if (column.length < 13) return { found: false, startIndex: -1 };

  const startIndex = column.length - 13;
  const bottomCard = column[column.length - 1];

  if (getRankValue(bottomCard.rank) !== 1) return { found: false, startIndex: -1 };

  const topCard = column[startIndex];
  if (getRankValue(topCard.rank) !== 13) return { found: false, startIndex: -1 };

  // Check all 13 cards form a valid same-suit descending sequence
  if (!isValidSequence(column, startIndex)) return { found: false, startIndex: -1 };

  // All cards must be same suit
  const suit = bottomCard.suit;
  for (let i = startIndex; i < column.length; i++) {
    if (column[i].suit !== suit) return { found: false, startIndex: -1 };
  }

  return { found: true, startIndex };
}

export function moveCards(
  state: GameState,
  sourceColIdx: number,
  startIndex: number,
  targetColIdx: number
): GameState {
  if (sourceColIdx === targetColIdx) return state;
  if (!canMoveCards(state.columns[sourceColIdx], startIndex, state.columns[targetColIdx])) {
    return state;
  }

  const newColumns = state.columns.map(col => [...col]);
  const movingCards = newColumns[sourceColIdx].splice(startIndex);
  newColumns[targetColIdx] = [...newColumns[targetColIdx], ...movingCards];

  // Flip the new top card of source column
  if (newColumns[sourceColIdx].length > 0) {
    const topCard = newColumns[sourceColIdx][newColumns[sourceColIdx].length - 1];
    if (!topCard.faceUp) {
      newColumns[sourceColIdx][newColumns[sourceColIdx].length - 1] = { ...topCard, faceUp: true };
    }
  }

  let newState: GameState = {
    ...state,
    columns: newColumns,
    moves: state.moves + 1,
    score: state.score - 1,
  };

  // Check for complete runs
  newState = removeCompleteRuns(newState);

  return newState;
}

export function removeCompleteRuns(state: GameState): GameState {
  const newColumns = state.columns.map(col => [...col]);
  let completedRuns = state.completedRuns;
  let score = state.score;

  for (let colIdx = 0; colIdx < newColumns.length; colIdx++) {
    const result = checkCompleteRun(newColumns[colIdx]);
    if (result.found) {
      newColumns[colIdx].splice(result.startIndex);
      completedRuns++;
      score += 100;

      // Flip new top card
      if (newColumns[colIdx].length > 0) {
        const topCard = newColumns[colIdx][newColumns[colIdx].length - 1];
        if (!topCard.faceUp) {
          newColumns[colIdx][newColumns[colIdx].length - 1] = { ...topCard, faceUp: true };
        }
      }
    }
  }

  return {
    ...state,
    columns: newColumns,
    completedRuns,
    score,
  };
}

export function dealFromStock(state: GameState): GameState | null {
  if (state.stock.length === 0) return null;

  // Check all columns have at least one card
  const hasEmptyColumn = state.columns.some(col => col.length === 0);
  if (hasEmptyColumn) return null;

  const newStock = [...state.stock];
  const dealPile = newStock.pop()!;
  const newColumns = state.columns.map((col, idx) => {
    if (idx < dealPile.length) {
      return [...col, { ...dealPile[idx], faceUp: true }];
    }
    return [...col];
  });

  let newState: GameState = {
    ...state,
    columns: newColumns,
    stock: newStock,
    moves: state.moves + 1,
  };

  newState = removeCompleteRuns(newState);

  return newState;
}

export function isGameWon(state: GameState): boolean {
  return state.completedRuns === 8;
}

// Find the longest valid sequence starting from the bottom of the column
export function getMovableSequenceStart(column: Card[], fromIndex: number): boolean {
  if (fromIndex >= column.length) return false;
  if (!column[fromIndex].faceUp) return false;
  return isValidSequence(column, fromIndex);
}

export function getSuitColor(suit: Suit): string {
  return suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-gray-900';
}
