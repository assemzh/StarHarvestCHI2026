import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TOTAL_TURNS_PER_ROUND } from "../../convex/game";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faLock, faLockOpen, faRobot, faUser, } from '@fortawesome/free-solid-svg-icons';
import { useAuthToken } from "@convex-dev/auth/react";
import React from "react";
import { useNavigate } from "react-router";
import { truncate } from "node:fs/promises";

// Game configuration constants
// const RESTING_TIME_SECONDS = 5; // Server now controls resting time
interface GameBoardProps {
  game: any;
  onLeaveGame: () => void;
}

interface CellData {
  x: number;
  y: number;
  cell: string;
  playerHere: number;
  star: any;
  isStarOld: boolean;
  isBeamCell: boolean;
  actionCounts: { stars: number; locks: number; unlocks: number } | null;
}

// Add at the top, after imports
const COUNTDOWN_NUMBERS = [3, 2, 1, "GO!"];

export function GameBoard({ game, onLeaveGame }: GameBoardProps) {
  const makeMove = useMutation(api.game.makeMove);
  const lockPlayer = useMutation(api.game.lockPlayer);
  const unlockPlayer = useMutation(api.game.unlockPlayer);
  const updateActivity = useMutation(api.game.updatePlayerActivity);

  // Detect tutorial mode and skip Convex calls for mock data
  const isTutorialMode = game?._id === "tutorial_game";
  const gameActions = useQuery(
    api.game.getGameActions,
    (game?._id && !isTutorialMode) ? { gameId: game._id } : "skip"
  );

  const gameStatus = useQuery(
    api.game.getGameStatus,
    (game?._id && !isTutorialMode) ? { gameId: game._id } : "skip"
  );

  const botInfo = useQuery(
    api.game.getBotInfo,
    (game?._id && !isTutorialMode) ? { gameId: game._id } : "skip"
  );

  const userProfile = useQuery(api.auth.getUserProfile);

  const updateGameStatusMutation = useMutation(api.game.updateGameStatus);

  const [actionMode, setActionMode] = useState<"move" | "lock" | "unlock">("move");
  const [activeBeam, setActiveBeam] = useState<{
    fromX: number;
    fromY: number;
    direction: "up" | "down" | "left" | "right";
    type: "lock" | "unlock";
    targetPlayer?: number;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [showUnlockedMessage, setShowUnlockedMessage] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [wasReplaced, setWasReplaced] = useState(false);
  const [targetedPlayer, setTargetedPlayer] = useState<number | null>(null);
  const prevLockedState = useRef<boolean | undefined>(undefined);
  // const [showResting, setShowResting] = useState(false); // Server now controls this via game.isResting
  const prevRoundRef = useRef<number | null>(null);
  // const [restingTimeLeft, setRestingTimeLeft] = useState(RESTING_TIME_SECONDS); // Derived from game.restingPhaseEndTime
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState<string | number>(3);
  const countdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [finishedGameTimer, setFinishedGameTimer] = useState(10);

  const navigate = useNavigate();

  // Timer effect - Reduced frequency from 100ms to 1000ms
  useEffect(() => {
    // Only run timer if turnStartTime is set and countdown is not showing
    if (!game || !game.turnStartTime || showCountdown) {
      setTimeLeft(10);
      return;
    }

    const updateTimer = () => {
      if (game.turnStartTime) {
        const elapsed = (Date.now() - game.turnStartTime) / 1000;
        const remaining = Math.max(0, 10 - elapsed);
        setTimeLeft(Math.ceil(remaining));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000); // Changed from 100ms to 1000ms

    return () => clearInterval(interval);
  }, [game?.turnStartTime, game?.currentPlayer, game?.status, showCountdown]);

  // Bell sound effect for "GO!"
  useEffect(() => {
    if (game?.isCurrentPlayer && timeLeft === 10) {
      // Play bell.mp3 from public folder
      const playBell = () => {
        try {
          const audio = new Audio('/bell.mp3');
          audio.volume = 0.5; // Set volume to 50%
          audio.play().catch(error => {
            console.log("Could not play bell sound:", error);
          });
        } catch (error) {
          console.log("Could not create audio element:", error);
        }
      };

      playBell();
    }
  }, [timeLeft, game?.isCurrentPlayer]);

  // Activity tracking effect - Increased interval to 30 seconds
  useEffect(() => {
    if (!game || game.status !== "active" || !game._id || isTutorialMode) return;

    const activityInterval = setInterval(() => {
      updateActivity({ gameId: game._id }).catch(console.error);
    }, 30000); // Changed from 15000ms to 30000ms

    updateActivity({ gameId: game._id }).catch(console.error);

    return () => clearInterval(activityInterval);
  }, [game?._id, game?.status, updateActivity, isTutorialMode]);

  // Track unlock state changes
  useEffect(() => {
    const isCurrentlyLocked = game.playerLocks?.[game.playerIndex]?.isLocked;

    // If we have a previous state and player was locked but now isn't, show unlock message
    if (prevLockedState.current === true && isCurrentlyLocked === false) {
      setShowUnlockedMessage(true);
      const timer = setTimeout(() => {
        setShowUnlockedMessage(false);
      }, 2000); // Show for 2 seconds

      // Store cleanup function
      return () => clearTimeout(timer);
    }

    // Update previous state
    prevLockedState.current = isCurrentlyLocked;
  }, [game.playerLocks?.[game.playerIndex]?.isLocked]);

  // Reset unlock message when player gets locked again
  useEffect(() => {
    if (game.playerLocks?.[game.playerIndex]?.isLocked) {
      setShowUnlockedMessage(false);
    }
  }, [game.playerLocks?.[game.playerIndex]?.isLocked]);

  // Effect 1: Only handle lock/unlock actions from gameActions (bot actions)
  useEffect(() => {
    if (!gameActions || gameActions.length === 0 || isTutorialMode) return;

    const latestAction = gameActions[gameActions.length - 1];

    // Only show beams for BOT lock/unlock actions (not human actions)
    if ((latestAction.action === "lock" || latestAction.action === "unlock") &&
      latestAction.direction) {

      // Check if this was a bot action (not the current player)
      const allPlayers = [...game.team1, ...game.team2];
      const actionPlayerIndex = allPlayers.findIndex(p => p === latestAction.playerId);

      if (actionPlayerIndex !== game.playerIndex) {
        // This was a bot action, show the beam
        setActiveBeam({
          fromX: latestAction.fromX,
          fromY: latestAction.fromY,
          direction: latestAction.direction,
          type: latestAction.action,
          targetPlayer: latestAction.targetPlayer
        });

        // Set targeted player only if action was successful
        if ((latestAction.result === "locked" || latestAction.result === "unlocked") &&
          latestAction.targetPlayer !== undefined && latestAction.targetPlayer !== null) {
          setTargetedPlayer(latestAction.targetPlayer);
        }
      }
    }
  }, [gameActions, isTutorialMode, game.playerIndex, game.team1, game.team2]);

  // Effect 2: Only handle clearing beam and targeted player
  useEffect(() => {
    if (activeBeam !== null || targetedPlayer !== null) {
      const timer = setTimeout(() => {
        setActiveBeam(null);
        setTargetedPlayer(null);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [activeBeam, targetedPlayer]); // Only runs when these change

  // Clear beam when round changes
  useEffect(() => {
    if (game?.currentRound) {
      setActiveBeam(null);
      setTargetedPlayer(null);
    }
  }, [game?.currentRound]);

  // Clear stale targeting if no one is actually locked (safety measure)
  useEffect(() => {
    if (targetedPlayer !== null) {
      const isTargetActuallyLocked = game.playerLocks?.[targetedPlayer]?.isLocked;
      if (!isTargetActuallyLocked) {
        setTargetedPlayer(null);
      }
    }
  }, [game.playerLocks, targetedPlayer]);

  // Check if current player was replaced by a bot
  useEffect(() => {
    if (!game || wasReplaced) return;

    // Simple check: if the user has a playerIndex but is not in the current teams, they were replaced
    const allPlayers = [...game.team1, ...game.team2];
    const currentUserId = game.playerIndex !== -1 && game.playerIndex < allPlayers.length ? allPlayers[game.playerIndex] : null;

    const userWasReplaced = currentUserId && (
      currentUserId.startsWith("bot_replacement_") ||
      currentUserId === "bot1" ||
      currentUserId === "bot2" ||
      currentUserId === "bot3"
    );

    if (userWasReplaced) {
      setWasReplaced(true);

      // Show disconnection message and redirect to thank-you page instead of home
      setTimeout(() => {
        alert("Sorry, you were disconnected and replaced by a bot due to missing 5 consecutive turns.");
        navigate("/thank-you");
      }, 1000);
    }
  }, [game?.team1, game?.team2, game?.playerIndex, wasReplaced, navigate]);


  // Countdown overlay effect
  useEffect(() => {
    // Show countdown overlay for any round if countdownStartTime is present and turnStartTime is not set
    if (
      game &&
      !game.isResting &&
      game.countdownStartTime &&
      game.countdownDuration &&
      !game.turnStartTime &&
      Date.now() - game.countdownStartTime < game.countdownDuration + 500 // 500ms buffer
    ) {
      setShowCountdown(true);
      // Calculate the countdown value based on server time
      const updateCountdown = () => {
        const elapsed = Date.now() - game.countdownStartTime;
        const duration = game.countdownDuration;
        const step = Math.floor((elapsed / duration) * 4); // 4 steps: 3,2,1,GO!
        if (step < 3) {
          setCountdownValue(COUNTDOWN_NUMBERS[step]);
        } else if (step === 3) {
          setCountdownValue("GO!");
        } else {
          setShowCountdown(false);
        }
      };
      updateCountdown();
      const interval = setInterval(updateCountdown, 100);
      countdownTimeoutRef.current = interval as any;
      return () => clearInterval(interval);
    } else {
      setShowCountdown(false);
    }
  }, [game?.countdownStartTime, game?.countdownDuration, game?.isResting, game?.turnStartTime]);

  // Timer for finished game screen - auto proceed after 10 seconds
  useEffect(() => {
    if (game.status === "game_finished" && finishedGameTimer > 0) {
      const timerId = setInterval(() => {
        setFinishedGameTimer((prevTime) => prevTime - 1);
      }, 1000);
      return () => clearInterval(timerId);
    } else if (game.status === "game_finished" && finishedGameTimer === 0) {
      // Auto proceed when timer reaches 0
      updateGameStatusMutation({ gameId: game._id, status: "awaiting_form_submission" });
    }
  }, [game.status, finishedGameTimer, updateGameStatusMutation, game._id]);

  // Reset finished game timer when game status changes to finished
  useEffect(() => {
    if (game.status === "game_finished") {
      setFinishedGameTimer(10);
    }
  }, [game.status]);

  const handleMove = async (direction: "up" | "down" | "left" | "right") => {
    if (!game.isCurrentPlayer || !game._id || isActionInProgress) return;

    // Disable controls immediately
    setIsActionInProgress(true);

    try {
      // Get current player position
      const playerPos = game.playerPositions[game.playerIndex];
      let newX = playerPos.x;
      let newY = playerPos.y;

      // Calculate new position based on direction
      switch (direction) {
        case "up": newY--; break;
        case "down": newY++; break;
        case "left": newX--; break;
        case "right": newX++; break;
      }

      // Show beam animation IMMEDIATELY for lock/unlock actions (human player)
      if (actionMode === "lock" || actionMode === "unlock") {
        // Find target player immediately (client-side calculation)
        let targetPlayer: number | undefined = undefined;
        let closestDistance = Infinity;

        for (let i = 0; i < 4; i++) {
          if (i === game.playerIndex) continue;

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
            targetPlayer = i;
            closestDistance = distance;
          }
        }

        // Show beam animation immediately
        setActiveBeam({
          fromX: playerPos.x,
          fromY: playerPos.y,
          direction,
          type: actionMode,
          targetPlayer
        });

        // Set targeted player for highlighting (will be validated by effects)
        if (targetPlayer !== undefined) {
          setTargetedPlayer(targetPlayer);
        }
      }

      // For move actions, validate the move before attempting
      if (actionMode === "move") {
        // Check if hitting a wall (out of bounds)
        if (newX < 0 || newX >= 10 || newY < 0 || newY >= 10) {
          setWarningMessage("Cannot move outside the game board!");
          setTimeout(() => setWarningMessage(null), 3000);
          return;
        }

        // Check if cell is occupied by another player
        const occupiedByPlayer = game.playerPositions.findIndex(
          (pos: any, index: number) => index !== game.playerIndex && pos.x === newX && pos.y === newY
        );

        if (occupiedByPlayer !== -1) {
          setWarningMessage("Cell is occupied!");
          setTimeout(() => setWarningMessage(null), 3000);
          return;
        }
      }

      // Skip actual API calls in tutorial mode
      if (isTutorialMode) {
        // Just show visual feedback for tutorial
        if (actionMode === "move") {
          console.log(`Tutorial: Moving ${direction} to (${newX}, ${newY})`);
        } else if (actionMode === "lock") {
          console.log(`Tutorial: Sending LOCK beam ${direction}`);
        } else if (actionMode === "unlock") {
          console.log(`Tutorial: Sending UNLOCK beam ${direction}`);
        }
        return;
      }

      // Perform the actual action (this will now be instant on server)
      if (actionMode === "move") {
        await makeMove({ gameId: game._id, direction });
      } else if (actionMode === "lock") {
        await lockPlayer({ gameId: game._id, direction });
        setActionMode("move");
      } else if (actionMode === "unlock") {
        await unlockPlayer({ gameId: game._id, direction });
        setActionMode("move");
      }
    } catch (error) {
      console.error("Failed to perform action:", error);
    } finally {
      // Re-enable controls after action completes
      setIsActionInProgress(false);
    }
  };

  // Keyboard controls effect
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the user is typing in an input field or textarea
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('input') !== null ||
        target.closest('textarea') !== null;

      // If user is typing in a form field, ignore the keyboard event
      if (isTyping) {
        return;
      }

      // Only handle keyboard input if it's the player's turn, they're not locked, and no action is in progress
      if (!game?.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress) return;

      // Prevent default behavior for arrow keys to avoid page scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }

      // Map keys to directions
      let direction: "up" | "down" | "left" | "right" | null = null;

      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          direction = 'up';
          break;
        case 'ArrowDown':
        case 'KeyS':
          direction = 'down';
          break;
        case 'ArrowLeft':
        case 'KeyA':
          direction = 'left';
          break;
        case 'ArrowRight':
        case 'KeyD':
          direction = 'right';
          break;
      }

      if (direction) {
        // Log the action for clarity
        if (actionMode === "lock") {
          console.log(`🔒 Sending LOCK beam ${direction} via keyboard`);
        } else if (actionMode === "unlock") {
          console.log(`🔓 Sending UNLOCK beam ${direction} via keyboard`);
        } else {
          console.log(`🚶 Moving ${direction} via keyboard`);
        }

        handleMove(direction);
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [game?.isCurrentPlayer, game?.playerLocks, game?.playerIndex, actionMode, isActionInProgress]);

  const getPlayerColor = (playerIndex: number, isLocked: boolean = false) => {
    if (isLocked) {
      return "locked-player";
    }

    // For tutorial game, use blue and red
    if (game._id === "tutorial_game") {
      // Team 1 (players 0,1): blue with white circle
      // Team 2 (players 2,3): red with white square
      if (playerIndex === 0 || playerIndex === 1) {
        return "bg-white border-4 border-indigo-500 rounded-full";
      } else {
        return "bg-white border-4 border-red-500";
      }
    } else {
      // For real game, use purple and orange
      // Team 1 (players 0,1): purple with white circle
      // Team 2 (players 2,3): orange with white square
      if (playerIndex === 0 || playerIndex === 1) {
        return "bg-white border-4 border-purple-500 rounded-full";
      } else {
        return "bg-white border-4 border-orange-500";
      }
    }
  };

  const getPlayerIcon = (playerIndex: number) => {
    // Players 0 and 2 are users, players 1 and 3 are bots
    const isBot = playerIndex === 1 || playerIndex === 3;
    const isTeam1 = playerIndex === 0 || playerIndex === 1;

    // For tutorial game, use blue and red
    if (game._id === "tutorial_game") {
      return {
        icon: isBot ? faRobot : faUser,
        color: isTeam1 ? "text-indigo-500" : "text-red-500"
      };
    } else {
      // For real game, use purple and orange
      return {
        icon: isBot ? faRobot : faUser,
        color: isTeam1 ? "text-purple-500" : "text-orange-500"
      };
    }
  };

  const getPlayerSymbol = (playerIndex: number, isLocked: boolean = false) => {
    // Check if bots should be displayed with card suits instead of user/robot icons
    const { icon, color } = getPlayerIcon(playerIndex);

    // For tutorial mode, use userProfile.botCondition, or default to "aware"
    // For real games, use botInfo from the query
    const botCondition = userProfile?.botCondition;
    const shouldUseSuitSymbols = botCondition === "unaware";

    // Determine if player is in team 1 (0,1) or team 2 (2,3)
    const isTeam1 = playerIndex === 0 || playerIndex === 1;

    // Get border color based on game type and team
    const borderColor = game._id === "tutorial_game"
      ? (isTeam1 ? "border-indigo-500" : "border-red-500")
      : (isTeam1 ? "border-purple-500" : "border-orange-500");

    // Base classes for the container
    const containerClasses = `w-8 h-8 md:w-12 md:h-12 bg-white border-4 ${isLocked ? "locked-player" : borderColor} ${isTeam1 ? "rounded-full" : ""
      } flex items-center justify-center shadow-sm`;

    if (shouldUseSuitSymbols) {
      // Use card suits for unaware condition
      const suitSymbols = ["♠", "♥", "♣", "♦"];
      const iconClass = `text-2xl md:text-3xl ${color}`;
      return (
        <div className={isLocked ? "locked-player" : containerClasses}>
          <div className="w-full h-full flex items-center justify-center">
            <span className={iconClass}>{suitSymbols[playerIndex]}</span>
          </div>
        </div>
      );
    } else {
      // Use original user/robot icons for aware condition
      const iconClass = `text-base ${color}`;
      return (
        <div className={isLocked ? "locked-player" : containerClasses}>
          <div className="w-full h-full flex items-center justify-center">
            <FontAwesomeIcon icon={icon as any} className={iconClass} />
          </div>
        </div>
      );
    }
  };

  const getPlayerLabel = (playerIndex: number) => {
    // Check if bots should be displayed as normal players
    const shouldHideBotIdentity = botInfo?.condition === "unaware";

    // If this is a bot (players 1 and 3 are bots)
    if (playerIndex === 1 || playerIndex === 3) {
      if (shouldHideBotIdentity) {
        // Display bot as "Opponent" when condition is bot_unaware
        return "Opponent";
      } else {
        // Display as "Bot" when condition is bot_aware
        return "Bot";
      }
    }

    // If this is the other human player (either player 0 or 2, but not the current player)
    if (playerIndex === 0 || playerIndex === 2) {
      return "Opponent";
    }

    // Fallback (shouldn't happen)
    return "Player " + playerIndex;
  };

  const getPlayerActionCounts = useCallback((playerIndex: number) => {
    if (!gameActions || !game || isTutorialMode) return { stars: 0, locks: 0, unlocks: 0 };

    const allPlayers = [...game.team1, ...game.team2];
    const currentPlayerId = allPlayers[playerIndex];

    // Check if this player was replaced
    const replacedPlayer = game.replacedPlayers?.find((rp: any) => rp.playerIndex === playerIndex);
    const originalPlayerId = replacedPlayer?.originalPlayerId;

    // Filter actions by both current and original player ID
    const playerActions = gameActions.filter(action => {
      const isCurrentPlayerAction = action.playerId === currentPlayerId;
      const isOriginalPlayerAction = originalPlayerId && action.playerId === originalPlayerId;
      return (isCurrentPlayerAction || isOriginalPlayerAction) && action.round === game.currentRound;
    });

    const stars = playerActions.filter(action =>
      action.action === "move" && (action.result === "harvested" || action.result === "harvested_overtime_win")
    ).length;

    const locks = playerActions.filter(action =>
      action.action === "lock" && action.result === "locked"
    ).length;

    const unlocks = playerActions.filter(action =>
      action.action === "unlock" && action.result === "unlocked"
    ).length;

    return { stars, locks, unlocks };
  }, [gameActions, game, isTutorialMode]);

  // Calculate how many turns the current player has taken and remaining
  const getCurrentPlayerTurnsRemaining = useCallback(() => {
    if (!gameActions || !game || isTutorialMode) return TOTAL_TURNS_PER_ROUND;

    const allPlayers = [...game.team1, ...game.team2];
    const currentPlayerId = allPlayers[game.playerIndex];

    // Check if this player was replaced
    const replacedPlayer = game.replacedPlayers?.find((rp: any) => rp.playerIndex === game.playerIndex);
    const originalPlayerId = replacedPlayer?.originalPlayerId;

    // Filter actions by both current and original player ID for current round
    const playerActions = gameActions.filter(action => {
      const isCurrentPlayer = action.playerId === currentPlayerId;
      const isOriginalPlayer = originalPlayerId && action.playerId === originalPlayerId;
      return (isCurrentPlayer || isOriginalPlayer) &&
        action.round === game.currentRound &&
        (action.action === "move" || action.action === "lock" || action.action === "unlock" || action.action === "locked" || action.action === "timeout");
    });

    const turnsTaken = playerActions.length;
    return Math.max(0, TOTAL_TURNS_PER_ROUND - turnsTaken);
  }, [gameActions, game, isTutorialMode]);

  const getTotalScore = useCallback((gameDoc: any) => {
    if (!gameDoc) return { team1: 0, team2: 0 };
    const roundScores = gameDoc.roundScores || [];
    let total1 = 0;
    let total2 = 0;

    if (gameDoc.status === "game_finished") {
      // For a finished game, roundScores is the definitive source for totals.
      // The backend now ensures roundScores[-1] is updated in overtime wins.
      for (const rs of roundScores) {
        total1 += rs.team1 || 0;
        total2 += rs.team2 || 0;
      }
    } else {
      // For an in-progress game, sum completed rounds and add current scores from game doc.
      // This is mostly for the live score display, not the "Game Over" screen.
      const numberOfFullRoundsCompleted = roundScores.length;
      for (let i = 0; i < numberOfFullRoundsCompleted; i++) {
        total1 += roundScores[i].team1 || 0;
        total2 += roundScores[i].team2 || 0;
      }
      // Add current, potentially incomplete round scores if not yet in roundScores
      // This logic ensures we add game.teamXScore only if it represents a round not yet in roundScores.
      if (gameDoc.currentRound > numberOfFullRoundsCompleted) {
        total1 += gameDoc.team1Score || 0;
        total2 += gameDoc.team2Score || 0;
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

      if (game.playerPositions.some((pos: any) => pos.x === x && pos.y === y)) break;
    }

    return cells;
  }, [activeBeam, game?.playerPositions]);

  // Memoize expensive calculations
  const beamCells = useMemo(() => getBeamCells(), [getBeamCells]);
  const totalScores = useMemo(() => getTotalScore(game), [getTotalScore, game]);

  // Memoize action counts for all players
  const playerActionCounts = useMemo(() => {
    if (!game) return {};
    const counts: Record<number, { stars: number; locks: number; unlocks: number }> = {};
    for (let i = 0; i < 4; i++) {
      counts[i] = getPlayerActionCounts(i);
    }
    return counts;
  }, [game, getPlayerActionCounts]);

  // Memoize current player turns remaining
  const currentPlayerTurnsRemaining = useMemo(() => getCurrentPlayerTurnsRemaining(), [getCurrentPlayerTurnsRemaining]);

  // Memoize grid rendering data
  const gridData = useMemo(() => {
    if (!game) return [];

    return game.grid.map((row: any[], y: number) =>
      row.map((cell: string, x: number) => {
        const playerHere = game.playerPositions.findIndex(
          (pos: any) => pos.x === x && pos.y === y
        );

        const star = game.stars?.find((s: any) => s.x === x && s.y === y);
        const isStarOld = star && star.turnsAlive >= 14;

        const isBeamCell = beamCells.some(beam => beam.x === x && beam.y === y);

        return {
          x,
          y,
          cell,
          playerHere,
          star,
          isStarOld,
          isBeamCell,
          actionCounts: playerHere !== -1 ? playerActionCounts[playerHere] : null
        } as CellData;
      })
    );
  }, [game?.grid, game?.playerPositions, game?.stars, beamCells, playerActionCounts]);

  const isTimerRedCondition = !game.isCurrentPlayer || (game.playerLocks?.[game.playerIndex]?.isLocked === true);

  // Helper to render player icon and badges for a specific round
  const renderPlayerWithBadgesForRound = (playerIndex: number, round: number) => {
    let stars = 0, locks = 0, unlocks = 0;
    if (gameActions && game.roundScores && game.roundScores[round - 1]) {
      const allPlayers = [...game.team1, ...game.team2];
      const playerIdToMatch = allPlayers[playerIndex];

      const replacedPlayerInfo = game.replacedPlayers?.find((rp: any) => rp.replacementBotId === playerIdToMatch && rp.playerIndex === playerIndex);
      const originalPlayerIdForThisSlot = replacedPlayerInfo?.originalPlayerId;

      const actionsThisRound = gameActions.filter(action => {
        const isCurrentDisplayPlayer = action.playerId === playerIdToMatch;
        const isOriginalDisplayPlayer = originalPlayerIdForThisSlot && action.playerId === originalPlayerIdForThisSlot;
        return (isCurrentDisplayPlayer || isOriginalDisplayPlayer) && action.round === round;
      });
      stars = actionsThisRound.filter(action => action.action === "move" && (action.result === "harvested" || action.result === "harvested_overtime_win")).length;
      locks = actionsThisRound.filter(action => action.action === "lock" && action.result === "locked").length;
      unlocks = actionsThisRound.filter(action => action.action === "unlock" && action.result === "unlocked").length;
    }
    return (
      <div className="flex flex-col items-center mx-auto relative" style={{ minWidth: 48, minHeight: 48, maxHeight: 48 }}>
        <div className="relative inline-block">
          {getPlayerSymbol(playerIndex, false)}
          {playerIndex === game.playerIndex && (
            <div className="text-red-500 text-lg font-bold animate-bounce">
              ▲
            </div>
          )}
          {/* Overlay badges in top-right, stacked horizontally */}
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

  // Overlay rendering
  const renderCountdownOverlay = () => {
    if (!showCountdown) return null;
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          color: 'white',
          fontSize: '7rem',
          fontWeight: 'bold',
          textShadow: '0 4px 32px #000',
          letterSpacing: '0.1em',
          padding: '2rem 4rem',
          borderRadius: '2rem',
          background: 'rgba(0,0,0,0.3)',
        }}>
          {countdownValue}
        </div>
      </div>
    );
  };

  if (game.status === "game_finished") {
    // This is now the only end-of-game screen.
    // Winner calculation uses totalScores, which is now derived correctly from roundScores.
    const winner = totalScores.team1 > totalScores.team2 ? "Team 1" :
      totalScores.team2 > totalScores.team1 ? "Team 2" : "Tie";

    const playerWon = (game.teamNumber === 1 && winner === "Team 1") ||
      (game.teamNumber === 2 && winner === "Team 2");

    // Calculate total stars and points
    const totalStarsForPoints = totalScores.team1 + totalScores.team2;
    let team1Points = totalStarsForPoints === 0 ? 50 : Math.ceil((totalScores.team1 / totalStarsForPoints) * 100);
    let team2Points = totalStarsForPoints === 0 ? 50 : Math.max(0, 100 - team1Points); // Ensure points sum to 100 and non-negative

    return (
      <>
        {renderCountdownOverlay()}
        <style>{`
          @keyframes countUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes winnerPulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
            50% { transform: scale(1.02); box-shadow: 0 0 20px 10px rgba(59, 130, 246, 0.3); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          }
          @keyframes starFloat {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-5px) rotate(5deg); }
          }
          .count-up {
            animation: countUp 1s ease-out forwards;
          }
          .fade-in {
            animation: fadeIn 1s ease-out forwards;
          }
          .winner-pulse {
            animation: winnerPulse 2s infinite;
          }
          .star-float {
            animation: starFloat 2s ease-in-out infinite;
          }
          .result-delay-1 { animation-delay: 0.2s; }
          .result-delay-2 { animation-delay: 0.4s; }
          .result-delay-3 { animation-delay: 0.6s; }
          .result-delay-4 { animation-delay: 0.8s; }
        `}</style>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 z-50 fixed inset-0">
          <div className="text-center">
            <h2 className="text-5xl font-bold mb-2 mt-8 count-up">Game Over!</h2>
            <p className="text-3xl mb-4 fade-in result-delay-1">
              {winner === "Tie" ? "It's a tie!" :
                playerWon ? "You won 🎉" : "You lost 😔"}
            </p>
            <div className="flex flex-row gap-8 justify-center mb-8">
              {/* Team 1 */}
              <div className={`bg-white rounded-xl shadow-lg p-8 min-w-[380px] ${winner === "Team 1" ? 'winner-pulse' : ''} count-up result-delay-2`}>
                <div className="text-2xl font-bold mb-4 text-gray-800">
                  {winner === "Team 1" ? "Winner Team" : "Loser Team"}
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((roundNum, index) => (
                    <div key={roundNum} className="flex flex-row items-center justify-between py-2 border-b last:border-b-0 fade-in" style={{ animationDelay: `${0.3 + index * 0.2}s` }}>
                      <div className="w-24 text-left font-semibold">Round {roundNum}:</div>
                      <div className="flex flex-row gap-2">
                        {[0, 1].map(playerIdxInTeam => {
                          const playerIndex = playerIdxInTeam; // Team 1 players are 0 and 1
                          return (
                            <div key={playerIndex} className="relative">
                              {renderPlayerWithBadgesForRound(playerIndex, roundNum)}
                            </div>
                          );
                        })}
                      </div>
                      <div className="w-24 text-right font-semibold text-gray-700">{game.roundScores[roundNum - 1]?.team1 || 0} stars</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-blue-50 rounded-lg p-3 flex flex-row items-center justify-between fade-in result-delay-3">
                  <span className="font-bold text-blue-800">Total Score:</span>
                  <span className="font-bold text-blue-800">{totalScores.team1} star{totalScores.team1 === 1 ? '' : 's'}</span>
                  <span className="text-blue-700">({team1Points} points)</span>
                </div>
              </div>
              {/* Team 2 */}
              <div className={`bg-white rounded-xl shadow-lg p-8 min-w-[380px] ${winner === "Team 2" ? 'winner-pulse' : ''} count-up result-delay-2`}>
                <div className="text-2xl font-bold mb-4 text-gray-800">
                  {winner === "Team 2" ? "Winner Team" : "Loser Team"}
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((roundNum, index) => (
                    <div key={roundNum} className="flex flex-row items-center justify-between py-2 border-b last:border-b-0 fade-in" style={{ animationDelay: `${0.3 + index * 0.2}s` }}>
                      <div className="w-24 text-left font-semibold">Round {roundNum}:</div>
                      <div className="flex flex-row gap-2">
                        {[0, 1].map(playerIdxInTeam => {
                          const playerIndex = playerIdxInTeam + 2; // Team 2 players are 2 and 3
                          return (
                            <div key={playerIndex} className="relative">
                              {renderPlayerWithBadgesForRound(playerIndex, roundNum)}
                            </div>
                          );
                        })}
                      </div>
                      <div className="w-24 text-right font-semibold text-gray-700">{game.roundScores[roundNum - 1]?.team2 || 0} stars</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-blue-50 rounded-lg p-3 flex flex-row items-center justify-between fade-in result-delay-3">
                  <span className="font-bold text-blue-800">Total Score:</span>
                  <span className="font-bold text-blue-800">{totalScores.team2} star{totalScores.team2 === 1 ? '' : 's'}</span>
                  <span className="text-blue-700">({team2Points} points)</span>
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
      </>
    );
  }

  // Show resting page between rounds
  if (game.isResting) {
    // Calculate restingTimeLeft based on server time
    const currentTime = Date.now();
    const endTime = game.restingPhaseEndTime || currentTime; // Fallback if undefined, though shouldn't happen
    const calculatedRestingTimeLeft = Math.max(0, Math.ceil((endTime - currentTime) / 1000));

    // Get last round scores
    const lastRound = (game.roundScores || [])[game.currentRound - 1] || { team1: 0, team2: 0 };
    const total1 = game.roundScores.reduce((sum: number, r: { team1: number, team2: number }, i: number) => i < game.currentRound ? sum + r.team1 : sum, 0);
    const total2 = game.roundScores.reduce((sum: number, r: { team1: number, team2: number }, i: number) => i < game.currentRound ? sum + r.team2 : sum, 0);
    return (
      <>
        {renderCountdownOverlay()}
        <style>{`
          @keyframes simpleFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .simple-fade-in {
            animation: simpleFadeIn 0.3s ease-out forwards;
          }
        `}</style>
        <div className="text-center text-2xl mb-4">GAME CONDITION: {game.botCondition}</div>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 z-50 fixed inset-0">
          <div className="text-center simple-fade-in">
            <h2 className="text-5xl font-bold mb-2 mt-8">Round {game.currentRound} is over!</h2>
            <p className="text-2xl mb-6">Be ready for the next round in</p>
            <p className="text-5xl font-bold text-orange-500 mb-6 mt-2">
              00:{calculatedRestingTimeLeft < 10 ? `0${calculatedRestingTimeLeft}` : calculatedRestingTimeLeft}
            </p>
            <div className="flex flex-row gap-8 justify-center mb-8">
              {/* Team 1 */}
              <div className="bg-white rounded-xl shadow-lg p-8 min-w-[320px]">
                <div className="text-2xl font-bold mb-2 text-purple-700">Team 1</div>
                <div className="flex flex-col items-center">
                  <div className="flex flex-row gap-4 mb-2">
                    {renderPlayerWithBadgesForRound(0, game.currentRound)}
                    {renderPlayerWithBadgesForRound(1, game.currentRound)}
                  </div>
                  <div className="text-lg font-bold mt-2">Harvested stars: {lastRound.team1}</div>
                  <div className="text-sm text-gray-500">Total: {total1} stars</div>
                </div>
              </div>
              {/* Team 2 */}
              <div className="bg-white rounded-xl shadow-lg p-8 min-w-[320px]">
                <div className="text-2xl font-bold mb-2 text-orange-700">Team 2</div>
                <div className="flex flex-col items-center">
                  <div className="flex flex-row gap-4 mb-2">
                    {renderPlayerWithBadgesForRound(2, game.currentRound)}
                    {renderPlayerWithBadgesForRound(3, game.currentRound)}
                  </div>
                  <div className="text-lg font-bold mt-2">Harvested stars: {lastRound.team2}</div>
                  <div className="text-sm text-gray-500">Total: {total2} stars</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {renderCountdownOverlay()}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
        .twinkle {
          animation: twinkle 1.5s ease-in-out infinite;
        }
        @keyframes beam-pulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .beam-effect {
          animation: beam-pulse 0.5s ease-in-out infinite;
          box-shadow: 0 0 10px currentColor;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .bounce-indicator {
          animation: bounce 1s ease-in-out infinite;
        }
        @keyframes target-flash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.8); transform: scale(1); }
          25% { box-shadow: 0 0 0 6px rgba(255, 0, 0, 0.5); transform: scale(1.08); }
          50% { box-shadow: 0 0 0 3px rgba(255, 255, 0, 0.7); transform: scale(1.04); }
          75% { box-shadow: 0 0 0 6px rgba(255, 0, 0, 0.5); transform: scale(1.08); }
        }
        .target-highlight {
          animation: target-flash 0.4s ease-in-out 2;
          border: 3px solid #ff0000 !important;
          z-index: 20;
        }
        .locked-player {
          background: repeating-linear-gradient(
            45deg,
            #e5e7eb,
            #e5e7eb 3px,
            #f3f4f6 3px,
            #f3f4f6 6px
          );
          border-color: #9ca3af !important;
        }
        .locked-icon {
          opacity: 0.4;
        }
      `}</style>
      <div className="bg-white w-full h-full grid grid-cols-12 overflow-x-auto min-w-[1200px]">
        {/* Left Sidebar - Player Info and Team Scores */}
        <div className="col-span-3 bg-gray-50 p-6 flex flex-col flex-shrink-0 overflow-y-auto min-w-[280px]">
          {/* Current Player Indicator */}
          <div className="player-identity-section mb-8 bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
            <div className="flex flex-row items-center gap-4 justify-center">
              <div className="text-lg font-bold text-gray-700">YOU ARE</div>
              <div className="relative flex items-center justify-center">
                <div className="relative flex flex-col items-center">
                  {/* <div className={`w-14 h-14 ${getPlayerColor(game.playerIndex, game.playerLocks?.[game.playerIndex]?.isLocked)} flex items-center justify-center text-xl border-4 border-gray-300`}> */}
                  {/* Player Symbol */}
                  <div className="flex items-center justify-center w-full h-full">
                    {getPlayerSymbol(game.playerIndex, false)}
                  </div>
                  {/* </div> */}
                  {/* Current Player Triangle Indicator */}
                  <div className="current-player-indicator top-10 absolute z-10 text-red-500 text-lg font-bold bounce-indicator">
                    ▲
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Round Number Display */}
          <div className="round-info-section mb-8 bg-white rounded-lg shadow-lg p-4 w-full min-w-[240px]">
            <div className="text-center">
              <div className="text-sm font-bold text-gray-700 mb-1">ROUND</div>
              <div className="text-3xl font-bold text-gray-800">{game?.currentRound || 1}</div>
              <div className="text-xs text-gray-500">OF 3</div>
            </div>
          </div>

          {/* Team Scores */}
          <div className="team-scores-section space-y-6">
            {/* Team 1 */}
            <div className="bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
              <div className={`border-l-4 ${game._id === "tutorial_game" ? "border-indigo-500" : "border-purple-500"} pl-4`}>
                <div className={`text-lg font-bold ${game._id === "tutorial_game" ? "text-indigo-600" : "text-purple-600"}`}>
                  {game._id === "tutorial_game" ? "BLUE TEAM" : "PURPLE TEAM"}
                </div>
                <div className="flex items-center justify-center mt-2">
                  <div className="text-4xl font-bold">{game?.team1Score || 0}</div>
                  <div className="text-yellow-500 text-2xl ml-2">
                    <FontAwesomeIcon icon={faStar} className="twinkle" />
                  </div>
                </div>
                <div className="text-sm text-gray-500 mt-1">STARS COLLECTED</div>
              </div>
            </div>

            {/* Team 2 */}
            <div className="bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
              <div className={`border-l-4 ${game._id === "tutorial_game" ? "border-red-500" : "border-orange-500"} pl-4`}>
                <div className={`text-lg font-bold ${game._id === "tutorial_game" ? "text-red-600" : "text-orange-600"}`}>
                  {game._id === "tutorial_game" ? "RED TEAM" : "ORANGE TEAM"}
                </div>
                <div className="flex items-center justify-center mt-2">
                  <div className="text-4xl font-bold">{game?.team2Score || 0}</div>
                  <div className="text-yellow-500 text-2xl ml-2">
                    <FontAwesomeIcon icon={faStar} className="twinkle" />
                  </div>
                </div>
                <div className="text-sm text-gray-500 mt-1">STARS COLLECTED</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Game Area */}
        <div className="col-span-6 flex flex-col items-center justify-start bg-gray-50 pt-6">
          {/* Game Grid - Centered */}
          <div className="game-grid-section flex items-center justify-center w-full">
            <div className="inline-grid grid-cols-10 gap-1 bg-gray-200 p-3 rounded-xl shadow-lg max-w-full max-h-full aspect-square">
              {gridData.flat().map((cellData: CellData, index: number) => {
                const { x, y, cell, playerHere, star, isStarOld, isBeamCell, actionCounts } = cellData;
                const beamType = activeBeam?.type;
                const isTargetedPlayer = targetedPlayer !== null && playerHere === targetedPlayer;

                return (
                  <div
                    key={`${x}-${y}`}
                    className={`w-8 h-8 md:w-12 md:h-12 flex items-center justify-center text-sm font-bold rounded relative ${playerHere !== -1
                      ? `${'block'} ${isTargetedPlayer ? 'target-highlight' : ''} ${game.playerLocks?.[playerHere]?.isLocked ? 'locked-player' : ''
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
                        {/* Player Symbol */}
                        <div className="flex items-center justify-center w-full h-full">
                          {getPlayerSymbol(playerHere, game.playerLocks?.[playerHere]?.isLocked)}
                        </div>

                        {/* Current Player Indicator - Red Triangle */}
                        {playerHere === game.playerIndex && (
                          <div className="current-player-indicator absolute z-10 text-red-500 text-lg font-bold bounce-indicator" style={{ top: 'calc(0% + 30px)' }}>
                            ▲
                          </div>
                        )}

                        {/* Achievement Badges */}
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

          {/* Game Info - Now below the grid, same width as grid */}
          <div className="mt-6 flex flex-col items-center w-full">
            <div className="text-center p-4 bg-white rounded-lg shadow-md border border-gray-300" style={{ width: 'calc(10 * (2rem + 0.25rem) + 1.5rem + 0.25rem)' }}>
              {warningMessage ? (
                <div className="text-red-700 font-bold text-xl animate-pulse">
                  ⚠️ {warningMessage}
                </div>
              ) : showCountdown || !game.turnStartTime ? (
                <div className="text-center">
                  <div className="text-4xl font-bold">&nbsp;</div>
                </div>
              ) : game.isCurrentPlayer && !game.playerLocks?.[game.playerIndex]?.isLocked ? (
                <div className="text-green-600 font-bold text-xl">
                  Your turn!
                </div>
              ) : game.isCurrentPlayer && game.playerLocks?.[game.playerIndex]?.isLocked ? (
                <div className="text-red-600 font-bold text-xl">
                  You are locked! 🔒
                </div>
              ) : game.playerLocks?.[game.currentPlayer]?.isLocked ? (
                <div className="text-gray-700 text-xl">
                  Skipping locked player...
                </div>
              ) : game._id === "tutorial_game" ? (
                <div className="text-gray-700 text-xl flex items-center justify-center gap-3">
                  <span>{getPlayerLabel(game.currentPlayer)}'s turn</span>
                  <span className="text-lg">
                    {getPlayerSymbol(
                      2,
                      false
                    )}
                  </span>
                </div>
              ) : (
                <div className="text-gray-700 text-xl flex items-center justify-center gap-3">
                  <span>{getPlayerLabel(game.currentPlayer)}'s turn</span>
                  <span className="text-lg">
                    {getPlayerSymbol(
                      game.currentPlayer,
                      game.playerLocks?.[game.currentPlayer]?.isLocked
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Timer and Controls */}
        <div className="col-span-3 bg-gray-50 p-6 flex flex-col items-center flex-shrink-0 overflow-y-auto min-w-[280px]">
          {/* Timer Circle - in a box */}
          <div className="timer-section mb-8 bg-white rounded-lg shadow-lg p-6 w-full min-w-[240px]">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg mx-auto ${game.isCurrentPlayer && !game.playerLocks?.[game.playerIndex]?.isLocked
              ? timeLeft <= 3
                ? 'bg-green-600 animate-pulse'
                : 'bg-green-500'
              : 'bg-red-500'
              }`}>
              {showCountdown || !game.turnStartTime ? (
                <div className="text-center">
                  <div className="text-4xl font-bold">&nbsp;</div>
                </div>
              ) : game.isCurrentPlayer && !game.playerLocks?.[game.playerIndex]?.isLocked ? (
                <div className="text-center">
                  {(game.isTutorialActionStep || timeLeft === 10) ? (
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

          {/* Turns Left - in a box */}
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
            ) : game.playerLocks?.[game.playerIndex]?.isLocked ? (
              <>
                <div className="text-4xl font-bold text-red-600">
                  <FontAwesomeIcon icon={faLock} />
                </div>
                <div className="text-sm text-red-600 font-semibold">YOU ARE LOCKED</div>
              </>
            ) : (
              <>
                <div className={`text-4xl font-bold ${currentPlayerTurnsRemaining <= 3 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>{currentPlayerTurnsRemaining}</div>
                <div className={`text-sm font-semibold ${currentPlayerTurnsRemaining <= 3 ? 'text-red-600' : 'text-gray-600'}`}>YOUR TURNS LEFT</div>
              </>
            )}
          </div>

          {/* Controls - in a box */}
          <div className="bg-white rounded-lg shadow-lg py-6 px-2 mb-6 w-full min-w-[260px]">
            <div className="space-y-6">
              {/* Movement Controls */}
              <div className="movement-controls flex flex-col items-center space-y-3">
                {/* Top row - Up button */}
                <button
                  onClick={() => handleMove("up")}
                  disabled={!game.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress}
                  className={`w-20 py-2 ${actionMode === "lock"
                    ? "bg-red-500 hover:bg-red-600"
                    : actionMode === "unlock"
                      ? "bg-green-500 hover:bg-green-600"
                      : "bg-gray-400 hover:bg-gray-500"
                    } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                >
                  ▲
                </button>

                {/* Middle row - Left, Down, Right */}
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => handleMove("left")}
                    disabled={!game.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress}
                    className={`w-20 py-2 ${actionMode === "lock"
                      ? "bg-red-500 hover:bg-red-600"
                      : actionMode === "unlock"
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-gray-400 hover:bg-gray-500"
                      } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handleMove("down")}
                    disabled={!game.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress}
                    className={`w-20 py-2 ${actionMode === "lock"
                      ? "bg-red-500 hover:bg-red-600"
                      : actionMode === "unlock"
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-gray-400 hover:bg-gray-500"
                      } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => handleMove("right")}
                    disabled={!game.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress}
                    className={`w-20 py-2 ${actionMode === "lock"
                      ? "bg-red-500 hover:bg-red-600"
                      : actionMode === "unlock"
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-gray-400 hover:bg-gray-500"
                      } disabled:bg-gray-300 text-white rounded-lg font-bold text-xl transition-colors disabled:cursor-not-allowed`}
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Action Mode Buttons */}
              <div className="action-buttons flex w-full justify-between">
                <button
                  onClick={() => setActionMode(actionMode === "lock" ? "move" : "lock")}
                  disabled={!game.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress}
                  className={`w-[120px] px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap ${actionMode === "lock"
                    ? "bg-red-600 text-white"
                    : "bg-red-500 hover:bg-red-600 text-white"
                    }`}
                >
                  <FontAwesomeIcon icon={faLock} className="mr-2" />
                  LOCK
                </button>
                <button
                  onClick={() => setActionMode(actionMode === "unlock" ? "move" : "unlock")}
                  disabled={!game.isCurrentPlayer || game.playerLocks?.[game.playerIndex]?.isLocked || isActionInProgress}
                  className={`w-[120px] px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap ${actionMode === "unlock"
                    ? "bg-green-600 text-white"
                    : "bg-green-500 hover:bg-green-600 text-white"
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