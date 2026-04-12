import { useState, useCallback } from "react";
import { Tutorial } from "./components/Tutorial";
import { GameBoard } from "./components/GameBoard";
import { ThankYouPage } from "./pages/ThankYouPage";
import type { GameState } from "./game/types";
import { createInitialGameState } from "./game/engine";

type AppPhase = "tutorial" | "playing" | "thank_you";

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("tutorial");
  const [gameState, setGameState] = useState<GameState | null>(null);

  const handleTutorialComplete = useCallback(() => {
    const initialState = createInitialGameState();
    setGameState(initialState);
    setPhase("playing");
  }, []);

  const handleGameUpdate = useCallback((newState: GameState) => {
    if (newState.status === "thank_you") {
      setPhase("thank_you");
    } else {
      setGameState(newState);
    }
  }, []);

  const handlePlayAgain = useCallback(() => {
    setPhase("tutorial");
    setGameState(null);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <header className="sticky top-0 z-[200] bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <h2 className="text-xl font-semibold text-blue-700">Star Harvest Demo</h2>
        <div className="flex items-center gap-4">
          {phase === "tutorial" && (
            <button
              onClick={handleTutorialComplete}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors shadow-sm"
            >
              Skip Tutorial
            </button>
          )}
          {phase === "playing" && gameState && (
            <span className="text-sm text-gray-500">Round {gameState.currentRound} / 3</span>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1">
        {phase === "tutorial" && <Tutorial onComplete={handleTutorialComplete} />}

        {phase === "playing" && gameState && (
          <GameBoard game={gameState} onGameUpdate={handleGameUpdate} />
        )}

        {phase === "thank_you" && <ThankYouPage onPlayAgain={handlePlayAgain} />}
      </div>
    </div>
  );
}
