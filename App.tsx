import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Level, CardData, GameState } from './types';
import { SYMBOLS, LEVELS, MASTER_SYMBOLS } from './constants';
import { useSettings } from './context/SettingsContext';
import { soundManager } from './utils/sound';
import LevelSelector from './components/LevelSelector';
import GameBoard from './components/GameBoard';
import GameStatus from './components/GameStatus';
import Button from './components/Button';
import Settings from './components/Settings';
import Confetti from './components/Confetti';


// Add custom CSS for 3D transforms and animations
const style = document.createElement('style');
style.innerHTML = `
  .perspective { perspective: 1000px; }
  .transform-style-preserve-3d { transform-style: preserve-3d; }
  .rotate-y-180 { transform: rotateY(180deg); }
  .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  @keyframes shuffle-in {
    from { opacity: 0; transform: scale(0.5) rotateY(-180deg); }
    to { opacity: 1; transform: scale(1) rotateY(0deg); }
  }
  .shuffling-card {
    opacity: 0;
    transform: scale(0.5);
    animation: shuffle-in 0.5s ease-out forwards;
  }
`;
document.head.appendChild(style);


const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('selecting');
  const [level, setLevel] = useState<Level | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedSymbols, setMatchedSymbols] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [isBoardLocked, setIsBoardLocked] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const { soundEnabled, symbolSet } = useSettings();
  // Fix: Use `ReturnType<typeof setTimeout>` for browser compatibility instead of `NodeJS.Timeout`.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const setupGame = useCallback((selectedLevel: Level) => {
    clearTimer();
    const levelConfig = LEVELS[selectedLevel];
    
    let iconsForLevel;
    if (selectedLevel === 'master') {
      iconsForLevel = MASTER_SYMBOLS.slice(0, levelConfig.pairs);
    } else {
      iconsForLevel = SYMBOLS[symbolSet].slice(0, levelConfig.pairs);
    }
    
    const cardSymbols = [...iconsForLevel, ...iconsForLevel];

    // Fisher-Yates shuffle
    for (let i = cardSymbols.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardSymbols[i], cardSymbols[j]] = [cardSymbols[j], cardSymbols[i]];
    }

    setCards(cardSymbols.map((symbol, index) => ({ id: index, symbol })));
    setLevel(selectedLevel);
    setGameState('playing');
    setFlippedIndices([]);
    setMatchedSymbols([]);
    setMoves(0);
    setTimeLeft(levelConfig.timeLimit);
    setIsBoardLocked(true); // Lock board during shuffle
    setIsShuffling(true);
    
    // End shuffling animation and unlock board
    setTimeout(() => {
        setIsShuffling(false);
        setIsBoardLocked(false);
    }, cardSymbols.length * 30 + 500);

  }, [symbolSet]);

  const handleLevelSelect = (selectedLevel: Level) => {
    setupGame(selectedLevel);
  };

  const handleCardClick = (index: number) => {
    if (flippedIndices.length === 1 && flippedIndices[0] === index) return;
    if (soundEnabled) soundManager.playFlip();
    setFlippedIndices(prev => [...prev, index]);
  };

  const resetGame = () => {
    clearTimer();
    setGameState('selecting');
    setLevel(null);
  };

  const checkMatch = useCallback(() => {
    if (flippedIndices.length !== 2) return;

    setIsBoardLocked(true);
    const [firstIndex, secondIndex] = flippedIndices;
    const firstCard = cards[firstIndex];
    const secondCard = cards[secondIndex];

    setMoves(prev => prev + 1);

    if (firstCard.symbol === secondCard.symbol) {
      if (soundEnabled) setTimeout(() => soundManager.playMatch(), 200);
      setMatchedSymbols(prev => [...prev, firstCard.symbol]);
      setFlippedIndices([]);
      setIsBoardLocked(false);
    } else {
       if (soundEnabled) setTimeout(() => soundManager.playMismatch(), 400);
      setTimeout(() => {
        setFlippedIndices([]);
        setIsBoardLocked(false);
      }, 1000);
    }
  }, [flippedIndices, cards, soundEnabled]);

  // Game Timer Effect
  useEffect(() => {
    if (gameState === 'playing' && !isShuffling) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => t - 1);
      }, 1000);
    }
    return clearTimer;
  }, [gameState, isShuffling]);

  // Check for win/loss
  useEffect(() => {
    if (gameState !== 'playing') return;
    if (level && matchedSymbols.length === LEVELS[level].pairs) {
      if (soundEnabled) soundManager.playWin();
      clearTimer();
      setTimeout(() => setGameState('won'), 500);
    } else if (timeLeft <= 0) {
      if (soundEnabled) soundManager.playLose();
      clearTimer();
      setGameState('lost');
    }
  }, [matchedSymbols, level, timeLeft, gameState, soundEnabled]);
  
  // Check for matches
  useEffect(() => {
    if (flippedIndices.length === 2) {
      checkMatch();
    }
  }, [flippedIndices, checkMatch]);

  const renderModal = (title: string, message: string, titleColor: string) => (
    <div className="absolute inset-0 bg-[rgb(var(--color-bg))]/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-4 text-center">
        <h2 className={`text-5xl font-bold ${titleColor} mb-4 animate-pulse`}>{title}</h2>
        <p className="text-xl mb-6 text-[rgb(var(--color-text))]">{message}</p>
        <div className="flex gap-4">
          <Button onClick={() => setupGame(level!)} variant="primary">Zagraj ponownie</Button>
          <Button onClick={resetGame} variant="secondary">Zmień poziom</Button>
        </div>
    </div>
  );

  const renderContent = () => {
    switch (gameState) {
      case 'selecting':
        return <LevelSelector onSelectLevel={handleLevelSelect} />;
      case 'playing':
      case 'won':
      case 'lost':
        if (!level) return null;
        return (
          <div className="flex flex-col items-center w-full max-w-7xl mx-auto">
             {gameState === 'won' && <Confetti />}
             {gameState === 'won' && renderModal('Wygrana!', `Gratulacje! Ukończyłeś grę w ${moves} ruchach.`, 'text-green-400')}
             {gameState === 'lost' && renderModal('Przegrana!', `Niestety, czas się skończył. Spróbuj jeszcze raz!`, 'text-red-500')}

            <div className="w-full flex justify-between items-center mb-4 px-4">
                <Button onClick={resetGame} variant="secondary">Menu</Button>
                <div className="text-center">
                    <h2 className="text-2xl font-bold">{LEVELS[level].name}</h2>
                </div>
                <Settings/>
            </div>

            <GameStatus moves={moves} matches={matchedSymbols.length} totalPairs={LEVELS[level].pairs} timeLeft={timeLeft} />
            <GameBoard 
              cards={cards} 
              level={level}
              onCardClick={handleCardClick}
              flippedIndices={flippedIndices}
              matchedSymbols={matchedSymbols}
              isDisabled={isBoardLocked || gameState === 'won' || gameState === 'lost'}
              isShuffling={isShuffling}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      {renderContent()}
    </main>
  );
};

export default App;