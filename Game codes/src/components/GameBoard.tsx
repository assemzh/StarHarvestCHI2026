import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStar,
  faLock,
  faLockOpen,
  faRobot,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import type { GameState, Direction, GameAction } from "../game/types";
import { TOTAL_TURNS_PER_ROUND, PLAYER_IDS } from "../game/types";
import {
  executeMove,
  executeLock,
  executeUnlock,
  executeBotTurn,
  isCurrentPlayerBot,
  recordLockedTurn,
  recordTimeout,
  startNextRound,
} from "../game/engine";

interface GameBoardProps {
  game: GameState;
  onGameUpdate: (game: GameState) => void;
  isTutorial?: boolean;
}

const COUNTDOWN_NUMBERS = [3, 2, 1, "GO!"];

export function GameBoard({ game, onGameUpdate, isTutorial = false }: GameBoardProps) {
  const [actionMode, setActionMode] = useState<"move" | "lock" | "unlock">("move");
  const [activeBeam, setActiveBeam] = useState<{
    fromX: number;
    fromY: number;
    direction: Direction;
    type: "lock" | "unlock";
    targetPlayer?: number;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [showUnlockedMessage, setShowUnlockedMessage] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [targetedPlayer, setTargetedPlayer] = useState<number | null>(null);
  const prevLockedState = useRef<boolean | undefined>(undefined);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState<string | number>(3);
  const [finishedGameTimer, setFinishedGameTimer] = useState(10);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCurrentPlayer = game.currentPlayer === 0; // Human is player 0
  const playerIndex = 0;
  const [restingTimeLeft, setRestingTimeLeft] = useState(10);

  // Sound helper
  const playSound = useCallback((src: string, volume = 0.5) => {
    if (isTutorial) return;
    try {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch {}
  }, [isTutorial]);

  // Timer effect
  useEffect(() => {
    if (!game.turnStartTime || showCountdown || (game.status !== "active" && game.status !== "overtime")) {
      setTimeLeft(10);
      return;
    }

    const updateTimer = () => {
      const elapsed = (Date.now() - game.turnStartTime!) / 1000;
      const remaining = Math.max(0, 10 - elapsed);
      setTimeLeft(Math.ceil(remaining));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [game.turnStartTime, game.currentPlayer, game.status, showCountdown]);

  // Sound: bell when it's your turn (GO!)
  useEffect(() => {
    if (isCurrentPlayer && !game.playerLocks?.[0]?.isLocked && timeLeft === 10 && !isTutorial && (game.status === "active" || game.status === "overtime")) {
      playSound("/bell.mp3", 0.5);
    }
  }, [timeLeft, isCurrentPlayer, game.playerLocks, game.status, isTutorial, playSound]);

  // Sound: countdown beep at 3 seconds left
  useEffect(() => {
    if (isCurrentPlayer && !game.playerLocks?.[0]?.isLocked && timeLeft === 3 && !isTutorial && (game.status === "active" || game.status === "overtime")) {
      playSound("/countdown.mp3", 0.4);
    }
  }, [timeLeft, isCurrentPlayer, game.playerLocks, game.status, isTutorial, playSound]);

  // Resting phase countdown timer
  useEffect(() => {
    if (game.status !== "resting" || !game.restingPhaseEndTime) {
      setRestingTimeLeft(10);
      return;
    }

    const updateRestingTimer = () => {
      const remaining = Math.max(0, Math.ceil((game.restingPhaseEndTime! - Date.now()) / 1000));
      setRestingTimeLeft(remaining);
    };

    updateRestingTimer();
    const interval = setInterval(updateRestingTimer, 1000);

    // Play countdown sound at 3 seconds before end
    const timeUntilEnd = game.restingPhaseEndTime - Date.now();
    const countdownSoundDelay = timeUntilEnd - 3000;
    let countdownTimeout: ReturnType<typeof setTimeout> | null = null;
    if (countdownSoundDelay > 0) {
      countdownTimeout = setTimeout(() => {
        playSound("/countdown.mp3", 0.4);
      }, countdownSoundDelay);
    }

    return () => {
      clearInterval(interval);
      if (countdownTimeout) clearTimeout(countdownTimeout);
    };
  }, [game.status, game.restingPhaseEndTime, playSound]);

  // Bot move scheduling
  useEffect(() => {
    if (isTutorial) return;
    if (game.status !== "active" && game.status !== "overtime") return;
    if (!isCurrentPlayerBot(game)) return;

    // If current player (bot) is locked, handle it immediately
    if (game.playerLocks[game.currentPlayer]?.isLocked) {
      botTimerRef.current = setTimeout(() => {
        const newState = recordLockedTurn(game, game.currentPlayer);
        onGameUpdate(newState);
      }, 500);
      return () => {
        if (botTimerRef.current) clearTimeout(botTimerRef.current);
      };
    }

    // Schedule bot move with a delay
    botTimerRef.current = setTimeout(() => {
      const newState = executeBotTurn(game);
      onGameUpdate(newState);
    }, 1000);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [game.currentPlayer, game.currentTurn, game.status]);

  // Human turn timeout
  useEffect(() => {
    if (isTutorial) return;
    if (game.status !== "active" && game.status !== "overtime") return;
    if (isCurrentPlayerBot(game)) return;

    // If human is locked, skip immediately
    if (game.playerLocks[0]?.isLocked) {
      turnTimeoutRef.current = setTimeout(() => {
        const newState = recordLockedTurn(game, 0);
        onGameUpdate(newState);
      }, 500);
      return () => {
        if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
      };
    }

    // 10 second timeout for human
    turnTimeoutRef.current = setTimeout(() => {
      const newState = recordTimeout(game, 0);
      onGameUpdate(newState);
    }, 10000);

    return () => {
      if (turnTimeoutRef.current) clearTimeout(turnTimeoutRef.current);
    };
  }, [game.currentPlayer, game.currentTurn, game.status]);

  // Resting phase handler
  useEffect(() => {
    if (isTutorial) return;
    if (game.status !== "resting") return;

    const restTimeout = setTimeout(() => {
      const newState = startNextRound(game);
      onGameUpdate(newState);
    }, 10000);

    return () => clearTimeout(restTimeout);
  }, [game.status, game.currentRound]);

  // Track unlock state changes
  useEffect(() => {
    const isCurrentlyLocked = game.playerLocks?.[0]?.isLocked;
    if (prevLockedState.current === true && isCurrentlyLocked === false) {
      setShowUnlockedMessage(true);
      const timer = setTimeout(() => setShowUnlockedMessage(false), 2000);
      return () => clearTimeout(timer);
    }
    prevLockedState.current = isCurrentlyLocked;
  }, [game.playerLocks?.[0]?.isLocked]);

  // Detect bot lock/unlock actions for beam visualization
  useEffect(() => {
    if (game.gameActions.length === 0) return;
    const latestAction = game.gameActions[game.gameActions.length - 1];

    if (
      (latestAction.action === "lock" || latestAction.action === "unlock") &&
      latestAction.direction &&
      latestAction.playerId !== PLAYER_IDS[0]
    ) {
      setActiveBeam({
        fromX: latestAction.fromX,
        fromY: latestAction.fromY,
        direction: latestAction.direction,
        type: latestAction.action,
        targetPlayer: latestAction.targetPlayer,
      });

      if (
        (latestAction.result === "locked" || latestAction.result === "unlocked") &&
        latestAction.targetPlayer !== undefined
      ) {
        setTargetedPlayer(latestAction.targetPlayer);
      }
    }
  }, [game.gameActions.length]);

  // Clear beam
  useEffect(() => {
    if (activeBeam !== null || targetedPlayer !== null) {
      const timer = setTimeout(() => {
        setActiveBeam(null);
        setTargetedPlayer(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeBeam, targetedPlayer]);

  // Finished game timer
  useEffect(() => {
    if (game.status === "game_finished" && finishedGameTimer > 0) {
      const timerId = setInterval(() => {
        setFinishedGameTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timerId);
    } else if (game.status === "game_finished" && finishedGameTimer === 0) {
      onGameUpdate({ ...game, status: "thank_you" });
    }
  }, [game.status, finishedGameTimer]);

  useEffect(() => {
    if (game.status === "game_finished") {
      setFinishedGameTimer(10);
    }
  }, [game.status]);

  const handleMove = async (direction: Direction) => {
    if (!isCurrentPlayer || isActionInProgress) return;
    if (game.playerLocks?.[0]?.isLocked) return;

    setIsActionInProgress(true);

    try {
      const playerPos = game.playerPositions[0];
      let newX = playerPos.x;
      let newY = playerPos.y;

      switch (direction) {
        case "up": newY--; break;
        case "down": newY++; break;
        case "left": newX--; break;
        case "right": newX++; break;
      }

      // Show beam for lock/unlock
      if (actionMode === "lock" || actionMode === "unlock") {
        let targetPlayerIdx: number | undefined = undefined;
        let closestDistance = Infinity;

        for (let i = 0; i < 4; i++) {
          if (i === 0) continue;
          const targetPos = game.playerPositions[i];
          let isInBeamPath = false;
          let distance = 0;

          switch (direction) {
            case "up":
              isInBeamPath = targetPos.x === playerPos.x && targetPos.y < playerPos.y;
              distance = playerPos.y - targetPos.y;
              break;
            case "down":
              isInBeamPath = targetPos.x === playerPos.x && targetPos.y > playerPos.y;
              distance = targetPos.y - playerPos.y;
              break;
            case "left":
              isInBeamPath = targetPos.y === playerPos.y && targetPos.x < playerPos.x;
              distance = playerPos.x - targetPos.x;
              break;
            case "right":
              isInBeamPath = targetPos.y === playerPos.y && targetPos.x > playerPos.x;
              distance = targetPos.x - playerPos.x;
              break;
          }

          if (isInBeamPath && distance < closestDistance) {
            targetPlayerIdx = i;
            closestDistance = distance;
          }
        }

        setActiveBeam({
          fromX: playerPos.x,
          fromY: playerPos.y,
          direction,
          type: actionMode,
          targetPlayer: targetPlayerIdx,
        });

        if (targetPlayerIdx !== undefined) {
          setTargetedPlayer(targetPlayerIdx);
        }
      }

      // Validate move
      if (actionMode === "move") {
        if (newX < 0 || newX >= 10 || newY < 0 || newY >= 10) {
          setWarningMessage("Cannot move outside the game board!");
          setTimeout(() => setWarningMessage(null), 3000);
          return;
        }

        const occupiedByPlayer = game.playerPositions.findIndex(
          (pos, index) => index !== 0 && pos.x === newX && pos.y === newY
        );

        if (occupiedByPlayer !== -1) {
          setWarningMessage("Cell is occupied!");
          setTimeout(() => setWarningMessage(null), 3000);
          return;
        }
      }

      let newState: GameState;
      if (actionMode === "move") {
        newState = executeMove(game, 0, direction);
      } else if (actionMode === "lock") {
        newState = executeLock(game, 0, direction);
        setActionMode("move");
      } else {
        newState = executeUnlock(game, 0, direction);
        setActionMode("move");
      }

      onGameUpdate(newState);
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      )
        return;

      if (!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress) return;

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }

      let direction: Direction | null = null;
      switch (event.code) {
        case "ArrowUp":
        case "KeyW":
          direction = "up";
          break;
        case "ArrowDown":
        case "KeyS":
          direction = "down";
          break;
        case "ArrowLeft":
        case "KeyA":
          direction = "left";
          break;
        case "ArrowRight":
        case "KeyD":
          direction = "right";
          break;
      }

      if (direction) handleMove(direction);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCurrentPlayer, game.playerLocks, actionMode, isActionInProgress, game]);

  const getPlayerColor = (pIdx: number) => {
    const isTeam1 = pIdx === 0 || pIdx === 1;
    return isTeam1
      ? "bg-white border-4 border-purple-500 rounded-full"
      : "bg-white border-4 border-orange-500";
  };

  const getPlayerIcon = (pIdx: number) => {
    // Player 0 = human, Player 1 = bot, Player 2 = displayed as human, Player 3 = bot
    const isBot = pIdx === 1 || pIdx === 3;
    const isTeam1 = pIdx === 0 || pIdx === 1;
    return {
      icon: isBot ? faRobot : faUser,
      color: isTeam1 ? "text-purple-500" : "text-orange-500",
    };
  };

  const getPlayerSymbol = (pIdx: number, isLocked: boolean = false) => {
    const { icon, color } = getPlayerIcon(pIdx);
    const isTeam1 = pIdx === 0 || pIdx === 1;
    const borderColor = isTeam1 ? "border-purple-500" : "border-orange-500";

    const containerClasses = `w-8 h-8 md:w-12 md:h-12 bg-white border-4 ${
      isLocked ? "locked-player" : borderColor
    } ${isTeam1 ? "rounded-full" : ""} flex items-center justify-center shadow-sm`;

    return (
      <div className={containerClasses}>
        <div className="w-full h-full flex items-center justify-center">
          <FontAwesomeIcon icon={icon} className={`text-base ${color}`} />
        </div>
      </div>
    );
  };

  const getPlayerLabel = (pIdx: number) => {
    if (pIdx === 0) return "You";
    if (pIdx === 2) return "Opponent"; // Displayed as human
    return "Bot";
  };

  const getPlayerActionCounts = useCallback(
    (pIdx: number) => {
      const playerId = PLAYER_IDS[pIdx];
      const playerActions = game.gameActions.filter(
        (a) => a.playerId === playerId && a.round === game.currentRound
      );

      const stars = playerActions.filter(
        (a) => a.action === "move" && (a.result === "harvested" || a.result === "harvested_overtime_win")
      ).length;
      const locks = playerActions.filter((a) => a.action === "lock" && a.result === "locked").length;
      const unlocks = playerActions.filter((a) => a.action === "unlock" && a.result === "unlocked").length;

      return { stars, locks, unlocks };
    },
    [game.gameActions, game.currentRound]
  );

  const getCurrentPlayerTurnsRemaining = useCallback(() => {
    const playerId = PLAYER_IDS[0];
    const playerActions = game.gameActions.filter(
      (a) =>
        a.playerId === playerId &&
        a.round === game.currentRound &&
        (a.action === "move" || a.action === "lock" || a.action === "unlock" || a.action === "locked" || a.action === "timeout")
    );
    return Math.max(0, TOTAL_TURNS_PER_ROUND - playerActions.length);
  }, [game.gameActions, game.currentRound]);

  const getTotalScore = useCallback((g: GameState) => {
    const roundScores = g.roundScores || [];
    let total1 = 0;
    let total2 = 0;

    if (g.status === "game_finished") {
      for (const rs of roundScores) {
        total1 += rs.team1 || 0;
        total2 += rs.team2 || 0;
      }
    } else {
      for (const rs of roundScores) {
        total1 += rs.team1 || 0;
        total2 += rs.team2 || 0;
      }
      if (g.currentRound > roundScores.length) {
        total1 += g.team1Score || 0;
        total2 += g.team2Score || 0;
      }
    }
    return { team1: total1, team2: total2 };
  }, []);

  const getBeamCells = useCallback(() => {
    if (!activeBeam) return [];
    const cells = [];
    let x = activeBeam.fromX;
    let y = activeBeam.fromY;

    while (true) {
      switch (activeBeam.direction) {
        case "up": y--; break;
        case "down": y++; break;
        case "left": x--; break;
        case "right": x++; break;
      }
      if (x < 0 || x >= 10 || y < 0 || y >= 10) break;
      cells.push({ x, y });
      if (game.playerPositions.some((pos) => pos.x === x && pos.y === y)) break;
    }
    return cells;
  }, [activeBeam, game.playerPositions]);

  const beamCells = useMemo(() => getBeamCells(), [getBeamCells]);
  const totalScores = useMemo(() => getTotalScore(game), [getTotalScore, game]);
  const playerActionCounts = useMemo(() => {
    const counts: Record<number, { stars: number; locks: number; unlocks: number }> = {};
    for (let i = 0; i < 4; i++) counts[i] = getPlayerActionCounts(i);
    return counts;
  }, [getPlayerActionCounts]);
  const currentPlayerTurnsRemaining = useMemo(() => getCurrentPlayerTurnsRemaining(), [getCurrentPlayerTurnsRemaining]);

  const gridData = useMemo(() => {
    return game.grid.map((row, y) =>
      row.map((cell, x) => {
        const playerHere = game.playerPositions.findIndex((pos) => pos.x === x && pos.y === y);
        const star = game.stars?.find((s) => s.x === x && s.y === y);
        const isStarOld = star && star.turnsAlive >= 14;
        const isBeamCell = beamCells.some((beam) => beam.x === x && beam.y === y);
        return {
          x, y, cell, playerHere, star, isStarOld, isBeamCell,
          actionCounts: playerHere !== -1 ? playerActionCounts[playerHere] : null,
        };
      })
    );
  }, [game.grid, game.playerPositions, game.stars, beamCells, playerActionCounts]);

  const isTimerRedCondition = !isCurrentPlayer || game.playerLocks?.[0]?.isLocked === true;

  // Render helpers for round results
  const renderPlayerWithBadgesForRound = (pIdx: number, round: number) => {
    const playerId = PLAYER_IDS[pIdx];
    const actionsThisRound = game.gameActions.filter((a) => a.playerId === playerId && a.round === round);
    const stars = actionsThisRound.filter((a) => a.action === "move" && (a.result === "harvested" || a.result === "harvested_overtime_win")).length;
    const locks = actionsThisRound.filter((a) => a.action === "lock" && a.result === "locked").length;
    const unlocks = actionsThisRound.filter((a) => a.action === "unlock" && a.result === "unlocked").length;

    return (
      <div className="flex flex-col items-center mx-auto relative" style={{ minWidth: 48, minHeight: 48, maxHeight: 48 }}>
        <div className="relative inline-block">
          {getPlayerSymbol(pIdx, false)}
          {pIdx === 0 && (
            <div className="text-red-500 text-lg font-bold animate-bounce">&#9650;</div>
          )}
          {(stars > 0 || locks > 0 || unlocks > 0) && (
            <div className="absolute top-0 left-0 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-0.5 shadow-sm border border-gray-200 z-10">
              <div className="flex flex-row -space-x-2">
                {stars > 0 && (
                  <div className="relative bg-yellow-500 text-black text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                    <span className="pr-1">{stars}</span>
                    <FontAwesomeIcon icon={faStar} className="absolute bottom-4 right-0.5 text-[13px] text-yellow-800" />
                  </div>
                )}
                {locks > 0 && (
                  <div className="relative bg-red-500 text-white text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                    <span className="pr-1">{locks}</span>
                    <FontAwesomeIcon icon={faLock} className="absolute bottom-4 right-0.5 text-[13px] text-red-700" />
                  </div>
                )}
                {unlocks > 0 && (
                  <div className="relative bg-green-500 text-white text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                    <span className="pr-1">{unlocks}</span>
                    <FontAwesomeIcon icon={faLockOpen} className="absolute bottom-4 right-0.5 text-[13px] text-green-800" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // GAME FINISHED SCREEN
  if (game.status === "game_finished") {
    const winner = totalScores.team1 > totalScores.team2 ? "Team 1" : totalScores.team2 > totalScores.team1 ? "Team 2" : "Tie";
    const playerWon = winner === "Team 1";
    const totalStarsForPoints = totalScores.team1 + totalScores.team2;
    const team1Points = totalStarsForPoints === 0 ? 50 : Math.ceil((totalScores.team1 / totalStarsForPoints) * 100);
    const team2Points = totalStarsForPoints === 0 ? 50 : Math.max(0, 100 - team1Points);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 z-50 fixed inset-0">
        <div className="text-center">
          <h2 className="text-5xl font-bold mb-2 mt-8">Game Over!</h2>
          <p className="text-3xl mb-4">
            {winner === "Tie" ? "It's a tie!" : playerWon ? "You won!" : "You lost!"}
          </p>
          <div className="flex flex-row gap-8 justify-center mb-8">
            {/* Team 1 */}
            <div className={`bg-white rounded-xl shadow-lg p-8 min-w-[380px] ${winner === "Team 1" ? "ring-4 ring-blue-400" : ""}`}>
              <div className="text-2xl font-bold mb-4 text-gray-800">
                {winner === "Team 1" ? "Winner Team" : "Loser Team"}
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((roundNum) => (
                  <div key={roundNum} className="flex flex-row items-center justify-between py-2 border-b last:border-b-0">
                    <div className="w-24 text-left font-semibold">Round {roundNum}:</div>
                    <div className="flex flex-row gap-2">
                      {[0, 1].map((pi) => (
                        <div key={pi}>{renderPlayerWithBadgesForRound(pi, roundNum)}</div>
                      ))}
                    </div>
                    <div className="w-24 text-right font-semibold text-gray-700">
                      {game.roundScores[roundNum - 1]?.team1 || 0} stars
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-blue-50 rounded-lg p-3 flex flex-row items-center justify-between">
                <span className="font-bold text-blue-800">Total:</span>
                <span className="font-bold text-blue-800">{totalScores.team1} stars</span>
                <span className="text-blue-700">({team1Points} pts)</span>
              </div>
            </div>
            {/* Team 2 */}
            <div className={`bg-white rounded-xl shadow-lg p-8 min-w-[380px] ${winner === "Team 2" ? "ring-4 ring-blue-400" : ""}`}>
              <div className="text-2xl font-bold mb-4 text-gray-800">
                {winner === "Team 2" ? "Winner Team" : "Loser Team"}
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((roundNum) => (
                  <div key={roundNum} className="flex flex-row items-center justify-between py-2 border-b last:border-b-0">
                    <div className="w-24 text-left font-semibold">Round {roundNum}:</div>
                    <div className="flex flex-row gap-2">
                      {[2, 3].map((pi) => (
                        <div key={pi}>{renderPlayerWithBadgesForRound(pi, roundNum)}</div>
                      ))}
                    </div>
                    <div className="w-24 text-right font-semibold text-gray-700">
                      {game.roundScores[roundNum - 1]?.team2 || 0} stars
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-blue-50 rounded-lg p-3 flex flex-row items-center justify-between">
                <span className="font-bold text-blue-800">Total:</span>
                <span className="font-bold text-blue-800">{totalScores.team2} stars</span>
                <span className="text-blue-700">({team2Points} pts)</span>
              </div>
            </div>
          </div>
          <div className="text-center mt-6">
            <p className="text-2xl mb-6">Proceeding automatically in</p>
            <p className="text-5xl font-bold text-blue-500 mb-6 mt-2">
              00:{finishedGameTimer < 10 ? `0${finishedGameTimer}` : finishedGameTimer}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // RESTING SCREEN
  if (game.status === "resting") {
    const lastRound = game.roundScores[game.currentRound - 1] || { team1: 0, team2: 0 };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 z-50 fixed inset-0">
        <div className="text-center">
          <h2 className="text-5xl font-bold mb-2 mt-8">Round {game.currentRound} is over!</h2>
          <p className="text-2xl mb-6">Be ready for the next round in</p>
          <p className="text-5xl font-bold text-orange-500 mb-6 mt-2">
            00:{restingTimeLeft < 10 ? `0${restingTimeLeft}` : restingTimeLeft}
          </p>
          <div className="flex flex-row gap-8 justify-center mb-8">
            <div className="bg-white rounded-xl shadow-lg p-8 min-w-[320px]">
              <div className="text-2xl font-bold mb-2 text-purple-700">Team 1</div>
              <div className="flex flex-row gap-4 justify-center mb-2">
                {renderPlayerWithBadgesForRound(0, game.currentRound)}
                {renderPlayerWithBadgesForRound(1, game.currentRound)}
              </div>
              <div className="text-lg font-bold mt-2">Harvested stars: {lastRound.team1}</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-8 min-w-[320px]">
              <div className="text-2xl font-bold mb-2 text-orange-700">Team 2</div>
              <div className="flex flex-row gap-4 justify-center mb-2">
                {renderPlayerWithBadgesForRound(2, game.currentRound)}
                {renderPlayerWithBadgesForRound(3, game.currentRound)}
              </div>
              <div className="text-lg font-bold mt-2">Harvested stars: {lastRound.team2}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN GAME BOARD
  return (
    <>
      <style>{`
        @keyframes twinkle { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.1); } }
        .twinkle { animation: twinkle 1.5s ease-in-out infinite; }
        @keyframes beam-pulse { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
        .beam-effect { animation: beam-pulse 0.5s ease-in-out infinite; box-shadow: 0 0 10px currentColor; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .bounce-indicator { animation: bounce 1s ease-in-out infinite; }
        @keyframes target-flash { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0.8); } 50% { box-shadow: 0 0 0 6px rgba(255,0,0,0.5); } }
        .target-highlight { animation: target-flash 0.4s ease-in-out 2; border: 3px solid #ff0000 !important; z-index: 20; }
        .locked-player { background: repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 3px, #f3f4f6 3px, #f3f4f6 6px); border-color: #9ca3af !important; }
      `}</style>
      <div className="bg-white w-full h-full grid grid-cols-12 overflow-x-auto min-w-[1200px]">
        {/* Left Sidebar */}
        <div className="col-span-3 bg-gray-50 p-6 flex flex-col flex-shrink-0 overflow-y-auto min-w-[280px]">
          {/* Player Identity */}
          <div className="player-identity-section mb-8 bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
            <div className="flex flex-row items-center gap-4 justify-center">
              <div className="text-lg font-bold text-gray-700">YOU ARE</div>
              <div className="relative flex flex-col items-center">
                <div className="flex items-center justify-center">{getPlayerSymbol(0, false)}</div>
                <div className="current-player-indicator absolute z-10 text-red-500 text-lg font-bold bounce-indicator" style={{ top: "30px" }}>
                  &#9650;
                </div>
              </div>
            </div>
          </div>

          {/* Round Info */}
          <div className="round-info-section mb-8 bg-white rounded-lg shadow-lg p-4 w-full min-w-[240px]">
            <div className="text-center">
              <div className="text-sm font-bold text-gray-700 mb-1">ROUND</div>
              <div className="text-3xl font-bold text-gray-800">{game.currentRound}</div>
              <div className="text-xs text-gray-500">OF 3</div>
            </div>
          </div>

          {/* Team Scores */}
          <div className="team-scores-section space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
              <div className="border-l-4 border-purple-500 pl-4">
                <div className="text-lg font-bold text-purple-600">PURPLE TEAM</div>
                <div className="flex items-center justify-center mt-2">
                  <div className="text-4xl font-bold">{game.team1Score}</div>
                  <div className="text-yellow-500 text-2xl ml-2">
                    <FontAwesomeIcon icon={faStar} className="twinkle" />
                  </div>
                </div>
                <div className="text-sm text-gray-500 mt-1 text-center">STARS COLLECTED</div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
              <div className="border-l-4 border-orange-500 pl-4">
                <div className="text-lg font-bold text-orange-600">ORANGE TEAM</div>
                <div className="flex items-center justify-center mt-2">
                  <div className="text-4xl font-bold">{game.team2Score}</div>
                  <div className="text-yellow-500 text-2xl ml-2">
                    <FontAwesomeIcon icon={faStar} className="twinkle" />
                  </div>
                </div>
                <div className="text-sm text-gray-500 mt-1 text-center">STARS COLLECTED</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Game Grid */}
        <div className="col-span-6 flex flex-col items-center justify-start bg-gray-50 pt-6">
          <div className="game-grid-section flex items-center justify-center w-full">
            <div className="inline-grid grid-cols-10 gap-1 bg-gray-200 p-3 rounded-xl shadow-lg max-w-full max-h-full aspect-square">
              {gridData.flat().map((cellData) => {
                const { x, y, cell, playerHere, star, isStarOld, isBeamCell, actionCounts } = cellData;
                const beamType = activeBeam?.type;
                const isTargetedPlayer = targetedPlayer !== null && playerHere === targetedPlayer;

                return (
                  <div
                    key={`${x}-${y}`}
                    className={`w-8 h-8 md:w-12 md:h-12 flex items-center justify-center text-sm font-bold rounded relative ${
                      playerHere !== -1
                        ? `${isTargetedPlayer ? "target-highlight" : ""} ${
                            game.playerLocks?.[playerHere]?.isLocked ? "locked-player" : ""
                          }`
                        : isBeamCell
                        ? beamType === "lock"
                          ? "bg-red-200 animate-pulse border-red-400"
                          : "bg-green-200 animate-pulse border-green-400"
                        : cell === "star"
                        ? "bg-white stars-on-grid"
                        : "bg-white"
                    } border border-gray-300 shadow-sm`}
                  >
                    {playerHere !== -1 ? (
                      <div className="relative flex flex-col w-full h-full items-center justify-center">
                        <div className="flex items-center justify-center w-full h-full">
                          {getPlayerSymbol(playerHere, game.playerLocks?.[playerHere]?.isLocked)}
                        </div>
                        {playerHere === 0 && (
                          <div className="current-player-indicator absolute z-10 text-red-500 text-lg font-bold bounce-indicator" style={{ top: "calc(0% + 30px)" }}>
                            &#9650;
                          </div>
                        )}
                        {actionCounts && (actionCounts.stars > 0 || actionCounts.locks > 0 || actionCounts.unlocks > 0) && (
                          <div className="absolute top-0 left-0 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-0.5 shadow-sm border border-gray-200 z-10">
                            <div className="flex flex-row -space-x-2">
                              {actionCounts.stars > 0 && (
                                <div className="relative bg-yellow-500 text-black text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                                  <span className="pr-1">{actionCounts.stars}</span>
                                  <FontAwesomeIcon icon={faStar} className="absolute bottom-4 right-0.5 text-[13px] text-yellow-800" />
                                </div>
                              )}
                              {actionCounts.locks > 0 && (
                                <div className="relative bg-red-500 text-white text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                                  <span className="pr-1">{actionCounts.locks}</span>
                                  <FontAwesomeIcon icon={faLock} className="absolute bottom-4 right-0.5 text-[13px] text-red-700" />
                                </div>
                              )}
                              {actionCounts.unlocks > 0 && (
                                <div className="relative bg-green-500 text-white text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                                  <span className="pr-1">{actionCounts.unlocks}</span>
                                  <FontAwesomeIcon icon={faLockOpen} className="absolute bottom-4 right-0.5 text-[13px] text-green-800" />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isBeamCell ? (
                      <div className="text-base"></div>
                    ) : cell === "star" ? (
                      <div className="relative stars-on-grid">
                        <div className="text-xl md:text-2xl">
                          <FontAwesomeIcon icon={faStar} className="text-yellow-500 twinkle" />
                        </div>
                      </div>
                    ) : (
                      ""
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Game Info below grid */}
          <div className="mt-6 flex flex-col items-center w-full">
            <div className="text-center p-4 bg-white rounded-lg shadow-md border border-gray-300" style={{ width: "calc(10 * (2rem + 0.25rem) + 1.5rem + 0.25rem)" }}>
              {warningMessage ? (
                <div className="text-red-700 font-bold text-xl animate-pulse">{warningMessage}</div>
              ) : isCurrentPlayer && !game.playerLocks?.[0]?.isLocked ? (
                <div className="text-green-600 font-bold text-xl">Your turn!</div>
              ) : isCurrentPlayer && game.playerLocks?.[0]?.isLocked ? (
                <div className="text-red-600 font-bold text-xl">You are locked!</div>
              ) : game.playerLocks?.[game.currentPlayer]?.isLocked ? (
                <div className="text-gray-700 text-xl">Skipping locked player...</div>
              ) : (
                <div className="text-gray-700 text-xl flex items-center justify-center gap-3">
                  <span>{getPlayerLabel(game.currentPlayer)}'s turn</span>
                  {getPlayerSymbol(game.currentPlayer, false)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="col-span-3 bg-gray-50 p-6 flex flex-col items-center flex-shrink-0 overflow-y-auto min-w-[280px]">
          {/* Timer */}
          <div className="timer-section mb-8 bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg mx-auto ${
              isCurrentPlayer && !game.playerLocks?.[0]?.isLocked
                ? timeLeft <= 3 ? "bg-green-600 animate-pulse" : "bg-green-500"
                : "bg-red-500"
            }`}>
              {isCurrentPlayer && !game.playerLocks?.[0]?.isLocked ? (
                <div className="text-center">
                  {timeLeft === 10 ? (
                    <div className="text-4xl font-bold">GO!</div>
                  ) : timeLeft > 0 ? (
                    <>
                      <div className="text-4xl font-bold">{timeLeft}</div>
                      <div className="text-xs">SEC</div>
                    </>
                  ) : (
                    <div className="text-4xl font-bold">STOP!</div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl font-bold">STOP!</div>
                </div>
              )}
            </div>
          </div>

          {/* Turns Left */}
          <div className="turns-remaining-section text-center mb-8 bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
            {game.status === "overtime" ? (
              <>
                <div className="text-4xl font-bold text-orange-500 animate-pulse">OVERTIME!</div>
                <div className="text-sm text-orange-600 font-semibold">FIRST STAR WINS!</div>
              </>
            ) : showUnlockedMessage ? (
              <>
                <div className="text-4xl font-bold text-green-600">
                  <FontAwesomeIcon icon={faLockOpen} />
                </div>
                <div className="text-sm text-green-600 font-semibold">YOU ARE UNLOCKED</div>
              </>
            ) : game.playerLocks?.[0]?.isLocked ? (
              <>
                <div className="text-4xl font-bold text-red-600">
                  <FontAwesomeIcon icon={faLock} />
                </div>
                <div className="text-sm text-red-600 font-semibold">YOU ARE LOCKED</div>
              </>
            ) : (
              <>
                <div className={`text-4xl font-bold ${currentPlayerTurnsRemaining <= 3 ? "text-red-600 animate-pulse" : "text-gray-800"}`}>
                  {currentPlayerTurnsRemaining}
                </div>
                <div className={`text-sm font-semibold ${currentPlayerTurnsRemaining <= 3 ? "text-red-600" : "text-gray-600"}`}>YOUR TURNS LEFT</div>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-lg py-6 px-2 mb-6 w-full min-w-[260px]">
            <div className="space-y-6">
              <div className="movement-controls flex flex-col items-center space-y-3">
                <button
                  onClick={() => handleMove("up")}
                  disabled={!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress}
                  className={`w-20 py-2 ${
                    actionMode === "lock" ? "bg-red-500 hover:bg-red-600" : actionMode === "unlock" ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"
                  } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                >
                  &#9650;
                </button>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => handleMove("left")}
                    disabled={!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress}
                    className={`w-20 py-2 ${
                      actionMode === "lock" ? "bg-red-500 hover:bg-red-600" : actionMode === "unlock" ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"
                    } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                  >
                    &#9664;
                  </button>
                  <button
                    onClick={() => handleMove("down")}
                    disabled={!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress}
                    className={`w-20 py-2 ${
                      actionMode === "lock" ? "bg-red-500 hover:bg-red-600" : actionMode === "unlock" ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"
                    } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                  >
                    &#9660;
                  </button>
                  <button
                    onClick={() => handleMove("right")}
                    disabled={!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress}
                    className={`w-20 py-2 ${
                      actionMode === "lock" ? "bg-red-500 hover:bg-red-600" : actionMode === "unlock" ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"
                    } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                  >
                    &#9654;
                  </button>
                </div>
              </div>

              <div className="action-buttons flex w-full justify-between">
                <button
                  onClick={() => setActionMode(actionMode === "lock" ? "move" : "lock")}
                  disabled={!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress}
                  className={`w-[120px] px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap ${
                    actionMode === "lock" ? "bg-red-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
                  }`}
                >
                  <FontAwesomeIcon icon={faLock} className="mr-2" />
                  LOCK
                </button>
                <button
                  onClick={() => setActionMode(actionMode === "unlock" ? "move" : "unlock")}
                  disabled={!isCurrentPlayer || game.playerLocks?.[0]?.isLocked || isActionInProgress}
                  className={`w-[120px] px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap ${
                    actionMode === "unlock" ? "bg-green-600 text-white" : "bg-green-500 hover:bg-green-600 text-white"
                  }`}
                >
                  <FontAwesomeIcon icon={faLockOpen} className="mr-2" />
                  UNLOCK
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
