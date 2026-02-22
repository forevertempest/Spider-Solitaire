import { useState, useCallback, useRef, useEffect } from 'react';
import {
  createGame,
  moveCards,
  dealFromStock,
  isGameWon,
  canMoveCards,
  isValidSequence,
  getSuitColor,
} from './gameLogic';
import { GameState, Difficulty, Card } from './types';

interface DragInfo {
  sourceColIdx: number;
  startIndex: number;
  cards: Card[];
  offsetX: number;
  offsetY: number;
}

const CARD_WIDTH = 80;
const CARD_HEIGHT = 112;
const FACE_UP_OFFSET = 28;
const FACE_DOWN_OFFSET = 10;

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [selectedCard, setSelectedCard] = useState<{ colIdx: number; cardIdx: number } | null>(null);
  const [showWin, setShowWin] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragInfoRef = useRef<DragInfo | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const wasDragRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  // Keep refs in sync
  useEffect(() => {
    dragInfoRef.current = dragInfo;
  }, [dragInfo]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const startNewGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setGameState(createGame(diff));
    setSelectedCard(null);
    setDragInfo(null);
    setIsDragging(false);
    setShowWin(false);
    setHint(null);
  }, []);

  useEffect(() => {
    if (gameState && isGameWon(gameState)) {
      setTimeout(() => setShowWin(true), 300);
    }
  }, [gameState]);

  // ---- Global pointer move/up handlers ----
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const di = dragInfoRef.current;
      if (!di) return;

      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        wasDragRef.current = true;
        setIsDragging(true);
      }

      setDragPos({
        x: e.clientX - di.offsetX,
        y: e.clientY - di.offsetY,
      });
      e.preventDefault();
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      const di = dragInfoRef.current;
      const gs = gameStateRef.current;
      if (!di || !gs) {
        setDragInfo(null);
        setIsDragging(false);
        return;
      }

      if (wasDragRef.current) {
        // Find which column the pointer is over
        let targetColIdx = -1;
        const px = e.clientX;
        const py = e.clientY;

        for (let i = 0; i < columnRefs.current.length; i++) {
          const ref = columnRefs.current[i];
          if (ref) {
            const rect = ref.getBoundingClientRect();
            // Generous hit area
            if (px >= rect.left - 5 && px <= rect.right + 5 && py >= rect.top - 30 && py <= rect.bottom + 50) {
              targetColIdx = i;
              break;
            }
          }
        }

        if (targetColIdx >= 0 && targetColIdx !== di.sourceColIdx) {
          const newState = moveCards(gs, di.sourceColIdx, di.startIndex, targetColIdx);
          if (newState !== gs) {
            setGameState(newState);
          }
        }
      }

      setDragInfo(null);
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, []);

  // ---- Pointer-based drag start ----
  const handleCardPointerDown = useCallback((
    e: React.PointerEvent,
    colIdx: number,
    cardIdx: number
  ) => {
    if (!gameState) return;
    const column = gameState.columns[colIdx];
    const card = column[cardIdx];
    if (!card.faceUp) return;
    if (!isValidSequence(column, cardIdx)) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const movingCards = column.slice(cardIdx);

    wasDragRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };

    setDragInfo({
      sourceColIdx: colIdx,
      startIndex: cardIdx,
      cards: movingCards,
      offsetX,
      offsetY,
    });
    setDragPos({ x: e.clientX - offsetX, y: e.clientY - offsetY });
    setHint(null);

    e.preventDefault();
    e.stopPropagation();
  }, [gameState]);

  // ---- Click-to-select-and-move ----
  const handleCardClick = useCallback((colIdx: number, cardIdx: number) => {
    // Don't handle click if we just finished dragging
    if (wasDragRef.current) return;
    if (!gameState) return;
    const column = gameState.columns[colIdx];
    const card = column[cardIdx];
    if (!card.faceUp) return;
    if (!isValidSequence(column, cardIdx)) return;

    if (selectedCard) {
      // Try to move selected cards to this column
      if (selectedCard.colIdx !== colIdx) {
        const newState = moveCards(gameState, selectedCard.colIdx, selectedCard.cardIdx, colIdx);
        if (newState !== gameState) {
          setGameState(newState);
          setSelectedCard(null);
          return;
        }
      }
      // Toggle or re-select
      if (selectedCard.colIdx === colIdx && selectedCard.cardIdx === cardIdx) {
        setSelectedCard(null);
      } else {
        setSelectedCard({ colIdx, cardIdx });
      }
    } else {
      setSelectedCard({ colIdx, cardIdx });
    }
    setHint(null);
  }, [gameState, selectedCard]);

  const handleEmptyColumnClick = useCallback((colIdx: number) => {
    if (!gameState || !selectedCard) return;
    const newState = moveCards(gameState, selectedCard.colIdx, selectedCard.cardIdx, colIdx);
    if (newState !== gameState) {
      setGameState(newState);
    }
    setSelectedCard(null);
  }, [gameState, selectedCard]);

  // ---- Deal from stock ----
  const handleDeal = useCallback(() => {
    if (!gameState) return;
    setSelectedCard(null);
    setHint(null);

    if (gameState.stock.length === 0) {
      setHint('No more cards to deal!');
      return;
    }

    const hasEmpty = gameState.columns.some(col => col.length === 0);
    if (hasEmpty) {
      setHint('Fill all empty columns before dealing!');
      return;
    }

    const result = dealFromStock(gameState);
    if (result) {
      setGameState(result);
    }
  }, [gameState]);

  // ---- Hint system ----
  const findHint = useCallback(() => {
    if (!gameState) return;
    setSelectedCard(null);

    // First try to find same-suit moves
    for (let srcCol = 0; srcCol < gameState.columns.length; srcCol++) {
      const col = gameState.columns[srcCol];
      for (let cardIdx = 0; cardIdx < col.length; cardIdx++) {
        if (!col[cardIdx].faceUp) continue;
        if (!isValidSequence(col, cardIdx)) continue;

        for (let tgtCol = 0; tgtCol < gameState.columns.length; tgtCol++) {
          if (tgtCol === srcCol) continue;
          if (gameState.columns[tgtCol].length === 0) continue;
          if (canMoveCards(col, cardIdx, gameState.columns[tgtCol])) {
            const tgtTop = gameState.columns[tgtCol][gameState.columns[tgtCol].length - 1];
            if (tgtTop.suit === col[cardIdx].suit) {
              setSelectedCard({ colIdx: srcCol, cardIdx });
              setHint(`Move from column ${srcCol + 1} to column ${tgtCol + 1} (same suit!)`);
              return;
            }
          }
        }
      }
    }

    // Then any move
    for (let srcCol = 0; srcCol < gameState.columns.length; srcCol++) {
      const col = gameState.columns[srcCol];
      for (let cardIdx = 0; cardIdx < col.length; cardIdx++) {
        if (!col[cardIdx].faceUp) continue;
        if (!isValidSequence(col, cardIdx)) continue;

        for (let tgtCol = 0; tgtCol < gameState.columns.length; tgtCol++) {
          if (tgtCol === srcCol) continue;
          if (canMoveCards(col, cardIdx, gameState.columns[tgtCol])) {
            if (gameState.columns[tgtCol].length > 0) {
              setSelectedCard({ colIdx: srcCol, cardIdx });
              setHint(`Try moving from column ${srcCol + 1} to column ${tgtCol + 1}`);
              return;
            }
          }
        }
      }
    }

    if (gameState.stock.length > 0) {
      setHint('No useful moves found. Try dealing from stock!');
    } else {
      setHint('No moves available!');
    }
  }, [gameState]);

  // ---- Render helpers ----

  const getColumnHeight = (column: Card[]) => {
    if (column.length === 0) return CARD_HEIGHT;
    let h = CARD_HEIGHT;
    for (let i = 0; i < column.length - 1; i++) {
      h += column[i].faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
    }
    return h;
  };

  // ---- Main Render ----

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-10 text-center shadow-2xl border border-white/20 max-w-md w-full mx-4">
          <div className="text-6xl mb-4">🕷️</div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Spider Solitaire</h1>
          <p className="text-green-200 mb-8 text-lg">Choose your difficulty</p>
          <div className="space-y-3">
            {([
              { diff: 1 as Difficulty, label: '1 Suit (Easy)', emoji: '♠' },
              { diff: 2 as Difficulty, label: '2 Suits (Medium)', emoji: '♠♥' },
              { diff: 4 as Difficulty, label: '4 Suits (Hard)', emoji: '♠♥♦♣' },
            ]).map(({ diff, label, emoji }) => (
              <button
                key={diff}
                onClick={() => startNewGame(diff)}
                className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-semibold text-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center justify-between group"
              >
                <span>{label}</span>
                <span className="text-2xl opacity-70 group-hover:opacity-100 transition-opacity">{emoji}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 select-none overflow-x-auto"
      style={{ touchAction: 'none' }}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/20 backdrop-blur-sm border-b border-white/10 text-white flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xl">🕷️</span>
          <h1 className="text-lg font-bold tracking-tight hidden sm:block">Spider Solitaire</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
            {difficulty === 1 ? '1 Suit' : difficulty === 2 ? '2 Suits' : '4 Suits'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-green-300">Score:</span>
            <span className="font-bold text-lg">{gameState.score}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-green-300">Moves:</span>
            <span className="font-bold">{gameState.moves}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-green-300">Runs:</span>
            <span className="font-bold">{gameState.completedRuns}/8</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={findHint}
            className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition-colors"
          >
            💡 Hint
          </button>
          <button
            onClick={() => startNewGame(difficulty)}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
          >
            🔄 Restart
          </button>
          <button
            onClick={() => setGameState(null)}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm font-medium transition-colors"
          >
            📋 Menu
          </button>
        </div>
      </div>

      {/* Hint bar */}
      {hint && (
        <div className="mx-4 mt-2 px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-200 text-sm text-center">
          {hint}
          <button onClick={() => setHint(null)} className="ml-3 text-yellow-400 hover:text-yellow-300">✕</button>
        </div>
      )}

      {/* Game Area */}
      <div className="p-4 pb-24 flex gap-1.5 sm:gap-2 min-w-[860px] justify-center max-w-[1100px] mx-auto">
        {gameState.columns.map((column, colIdx) => {
          const colHeight = getColumnHeight(column);
          return (
            <div
              key={colIdx}
              ref={el => { columnRefs.current[colIdx] = el; }}
              className="relative flex-1 max-w-[95px] min-w-[65px]"
              style={{ minHeight: colHeight + 40 }}
              onClick={() => column.length === 0 ? handleEmptyColumnClick(colIdx) : undefined}
            >
              {/* Empty column placeholder */}
              {column.length === 0 && (
                <div
                  className={`absolute inset-x-0 top-0 rounded-lg border-2 border-dashed transition-colors duration-200 cursor-pointer ${
                    selectedCard ? 'border-yellow-400/60 bg-yellow-500/10' : 'border-white/20 bg-white/5'
                  }`}
                  style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
                  onClick={(e) => { e.stopPropagation(); handleEmptyColumnClick(colIdx); }}
                />
              )}

              {/* Cards */}
              {column.map((card, cardIdx) => {
                let yOffset = 0;
                for (let i = 0; i < cardIdx; i++) {
                  yOffset += column[i].faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
                }

                const isBeingDragged = isDragging && dragInfo !== null &&
                  dragInfo.sourceColIdx === colIdx &&
                  cardIdx >= dragInfo.startIndex;

                const isCardSelected = selectedCard !== null &&
                  selectedCard.colIdx === colIdx &&
                  cardIdx >= selectedCard.cardIdx;

                const suitColor = getSuitColor(card.suit);
                const isClickTarget = card.faceUp && isValidSequence(gameState.columns[colIdx], cardIdx);

                if (isBeingDragged) {
                  return (
                    <div
                      key={card.id}
                      className="absolute left-0"
                      style={{
                        top: yOffset,
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        zIndex: cardIdx + 1,
                        opacity: 0.3,
                      }}
                    >
                      <div className="w-full h-full rounded-lg border-2 border-gray-400 bg-gray-200" />
                    </div>
                  );
                }

                return (
                  <div
                    key={card.id}
                    className="absolute left-0 select-none transition-[top] duration-200 ease-out"
                    style={{
                      top: yOffset,
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      zIndex: cardIdx + 1,
                    }}
                    onPointerDown={card.faceUp ? (e) => handleCardPointerDown(e, colIdx, cardIdx) : undefined}
                    onClick={card.faceUp ? (e) => { e.stopPropagation(); handleCardClick(colIdx, cardIdx); } : undefined}
                  >
                    {card.faceUp ? (
                      <div
                        className={`w-full h-full rounded-lg border-2 cursor-pointer
                          ${isCardSelected
                            ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)] bg-yellow-50 -translate-y-1'
                            : 'border-gray-300 bg-white hover:border-blue-400 hover:shadow-md'
                          }
                          ${isClickTarget ? '' : 'pointer-events-none opacity-80'}
                          transition-all duration-150`}
                      >
                        <div className={`text-xs font-bold p-1 ${suitColor} leading-none`}>
                          <div>{card.rank}</div>
                          <div className="text-sm leading-none">{card.suit}</div>
                        </div>
                        <div className={`absolute bottom-0.5 right-1 text-xs font-bold ${suitColor} rotate-180 leading-none`}>
                          <div>{card.rank}</div>
                          <div className="text-sm leading-none">{card.suit}</div>
                        </div>
                        <div className={`absolute inset-0 flex items-center justify-center text-2xl ${suitColor} pointer-events-none select-none`}>
                          {card.suit}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-lg border-2 border-blue-800 bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 shadow-sm">
                        <div className="w-full h-full rounded-md border border-blue-500/30 flex items-center justify-center">
                          <div className="w-10 h-14 rounded border border-blue-400/40 bg-blue-600/50 flex items-center justify-center">
                            <span className="text-blue-300/60 text-lg">🕸️</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Stock / Completed Runs Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm border-t border-white/10 px-4 py-3 z-40">
        <div className="flex items-center justify-between max-w-[1100px] mx-auto">
          {/* Completed runs */}
          <div className="flex items-center gap-1">
            <span className="text-green-300 text-xs mr-1 hidden sm:block">Done:</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`w-7 h-10 rounded border text-xs font-bold flex items-center justify-center transition-all duration-300 ${
                  i < gameState.completedRuns
                    ? 'border-green-400/60 bg-green-600/40 text-green-300 scale-100'
                    : 'border-white/10 bg-white/5 text-transparent'
                }`}
              >
                {i < gameState.completedRuns ? '✓' : '·'}
              </div>
            ))}
          </div>

          {/* Stock piles */}
          <div className="flex items-center gap-2">
            <span className="text-green-300 text-xs hidden sm:block">Stock:</span>
            <button
              className="relative cursor-pointer group flex items-center gap-2 px-3 py-1.5 bg-blue-700/50 hover:bg-blue-600/60 border border-blue-500/30 rounded-lg transition-colors"
              onClick={handleDeal}
              disabled={gameState.stock.length === 0}
            >
              {gameState.stock.length > 0 ? (
                <>
                  <div className="flex -space-x-2">
                    {gameState.stock.map((_, i) => (
                      <div
                        key={i}
                        className="w-5 h-7 rounded-sm border border-blue-500/50 bg-gradient-to-br from-blue-600 to-blue-800"
                      />
                    ))}
                  </div>
                  <span className="text-white text-sm font-bold">
                    Deal ({gameState.stock.length})
                  </span>
                </>
              ) : (
                <span className="text-white/40 text-sm">No stock</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dragging cards overlay */}
      {isDragging && dragInfo && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: dragPos.x,
            top: dragPos.y,
            zIndex: 10000,
          }}
        >
          {dragInfo.cards.map((card, i) => {
            const suitColor = getSuitColor(card.suit);
            return (
              <div
                key={card.id}
                className="absolute"
                style={{
                  top: i * FACE_UP_OFFSET,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  transform: 'rotate(2deg)',
                }}
              >
                <div className="w-full h-full rounded-lg border-2 border-blue-400 bg-white shadow-2xl shadow-black/50">
                  <div className={`text-xs font-bold p-1 ${suitColor} leading-none`}>
                    <div>{card.rank}</div>
                    <div className="text-sm leading-none">{card.suit}</div>
                  </div>
                  <div className={`absolute bottom-0.5 right-1 text-xs font-bold ${suitColor} rotate-180 leading-none`}>
                    <div>{card.rank}</div>
                    <div className="text-sm leading-none">{card.suit}</div>
                  </div>
                  <div className={`absolute inset-0 flex items-center justify-center text-2xl ${suitColor} pointer-events-none`}>
                    {card.suit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Win overlay */}
      {showWin && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-orange-500 rounded-3xl p-10 text-center shadow-2xl max-w-md mx-4 animate-[bounceIn_0.6s_ease-out]">
            <div className="text-7xl mb-4">🏆</div>
            <h2 className="text-4xl font-bold text-white mb-2">You Won!</h2>
            <p className="text-yellow-100 text-lg mb-2">
              Score: <span className="font-bold text-white">{gameState.score}</span>
            </p>
            <p className="text-yellow-100 mb-6">
              Moves: <span className="font-bold text-white">{gameState.moves}</span>
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => startNewGame(difficulty)}
                className="px-6 py-3 bg-white text-yellow-600 rounded-xl font-bold text-lg hover:bg-yellow-50 transition-colors shadow-lg"
              >
                Play Again
              </button>
              <button
                onClick={() => setGameState(null)}
                className="px-6 py-3 bg-yellow-600 text-white rounded-xl font-bold text-lg hover:bg-yellow-700 transition-colors shadow-lg"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
