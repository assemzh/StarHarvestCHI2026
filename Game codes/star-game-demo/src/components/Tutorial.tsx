import { useState, useEffect, useCallback } from "react";
import { GameBoard } from "./GameBoard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faArrowLeft,
  faStar,
  faLock,
  faLockOpen,
} from "@fortawesome/free-solid-svg-icons";
import type { GameState } from "../game/types";

interface TutorialProps {
  onComplete: () => void;
}

// Mock game data for the tutorial - matches original exactly
const createMockGame = (): GameState => {
  const grid = Array(10)
    .fill(null)
    .map(() => Array(10).fill("empty"));

  grid[3][4] = "star"; // Star at (4, 3)
  grid[9][7] = "star"; // Old star at (7, 9)

  return {
    status: "active",
    currentRound: 1,
    currentTurn: 1,
    currentPlayer: 0,
    turnsRemaining: 60,
    team1: ["human", "bot1"],
    team2: ["bot2", "bot3"],
    team1Score: 2,
    team2Score: 1,
    roundScores: [],
    grid,
    playerPositions: [
      { x: 3, y: 3 }, // User (purple team)
      { x: 8, y: 3 }, // Bot teammate (purple team)
      { x: 8, y: 8 }, // Opponent "human" (orange team)
      { x: 4, y: 6 }, // Bot opponent (orange team)
    ],
    playerLocks: [
      { isLocked: false, turnsRemaining: 0 },
      { isLocked: false, turnsRemaining: 0 },
      { isLocked: false, turnsRemaining: 0 },
      { isLocked: false, turnsRemaining: 0 },
    ],
    stars: [
      { x: 4, y: 3, turnsAlive: 3 },
      { x: 7, y: 9, turnsAlive: 12 },
    ],
    turnsSinceLastStar: 0,
    turnStartTime: Date.now(),
    gameActions: [
      // Bot teammate (bot1, index 1) collected 2 stars
      { playerId: "bot1", action: "move" as const, fromX: 7, fromY: 3, toX: 8, toY: 3, direction: "right" as const, result: "harvested" as const, round: 1, turn: 1, timestamp: Date.now() - 2000 },
      { playerId: "bot1", action: "move" as const, fromX: 8, fromY: 3, toX: 8, toY: 3, direction: "right" as const, result: "harvested" as const, round: 1, turn: 2, timestamp: Date.now() - 1000 },
      // Opponent "human" (bot2, index 2) collected 1 star
      { playerId: "bot2", action: "move" as const, fromX: 7, fromY: 8, toX: 8, toY: 8, direction: "right" as const, result: "harvested" as const, round: 1, turn: 3, timestamp: Date.now() - 500 },
    ],
  };
};

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  highlight: string | null;
  position: string;
  requiresUserActionToAdvance?: boolean;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Star Harvest!",
    description:
      "<div style='text-align: center;'><span style='font-size: 28px; color: #2c5282; font-weight: bold;'>Welcome to the Star Harvest Experiment!</span><br><br><span style='font-size: 20px; color: #4a5568;'>Here we will start with a short tutorial to explain the game.</span><br><br><span style='font-size: 24px; color: #38a169; font-weight: bold;'>Let's GO!</span></div>",
    highlight: null,
    position: "center",
  },
  {
    id: "game-grid",
    title: "The Game Board",
    description:
      "This is the <span style='font-weight: bold; color: #2c5282;'>game grid</span> where players move and collect <span style='font-weight: bold; color: #2c5282;'>stars</span>.",
    highlight: ".inline-grid",
    position: "top",
  },
  {
    id: "stars-collect",
    title: "Collect Stars",
    description:
      "Your goal is to <span style='font-weight: bold; color: #2c5282;'>collect as many stars as possible</span> by moving on the grid.",
    highlight: ".stars-on-grid .fa-star",
    position: "right",
  },
  {
    id: "stars-timing",
    title: "Star Timing",
    description:
      "Stars can <span style='font-weight: bold; color: #2c5282;'>appear and disappear</span> at any moment. So, you should collect them quickly.",
    highlight: ".stars-on-grid .fa-star",
    position: "right",
  },
  {
    id: "your-avatar",
    title: "Your Avatar",
    description:
      "This is your <span style='font-weight: bold; color: #2c5282;'>avatar</span>.",
    highlight: ".player-identity-section, .inline-grid > div:nth-child(34)",
    position: "right",
  },
  {
    id: "turn-indicator",
    title: "Turn Indicator",
    description:
      "Your avatar will be always highlighted with a <span style='color: #e53e3e; font-weight: bold;'>red triangle</span> below it.",
    highlight: ".current-player-indicator",
    position: "right",
  },
  {
    id: "round-info",
    title: "Round Info",
    description:
      "You will play <span style='font-weight: bold; color: #2c5282;'>3 rounds</span> in this game. Here you can see <span style='font-weight: bold; color: #2c5282;'>current round</span>.",
    highlight: ".round-info-section",
    position: "right",
  },
  {
    id: "team-scores",
    title: "Team Scores",
    description:
      "Here you can see <span style='font-weight: bold; color: #2c5282;'>teams' scores</span> for the current round.",
    highlight: ".team-scores-section",
    position: "right",
  },
  {
    id: "your-team",
    title: "Your Team",
    description:
      "You will be teamed up with <span style='color: #2c5282; font-weight: bold;'>another human player</span>. Your team will have <span style='color: #2c5282; font-weight: bold;'>same color</span> and <span style='color: #2c5282; font-weight: bold;'>icon shape</span>.",
    highlight: ".inline-grid > div:nth-child(34), .inline-grid > div:nth-child(39)",
    position: "bottom",
  },
  {
    id: "opponent-team",
    title: "Opponent Team",
    description:
      "Your <span style='font-weight: bold; color: #e53e3e;'>opponents</span> are also human players but in different color and shape.",
    highlight: ".inline-grid > div:nth-child(89), .inline-grid > div:nth-child(65)",
    position: "top",
  },
  {
    id: "timer-green",
    title: "Your Turn - Green Light",
    description:
      "When traffic light becomes <span style='color: #38a169; font-weight: bold;'>green</span>, you can move. You have only <span style='color: #e53e3e; font-weight: bold;'>10 seconds</span> to act or you will miss your turn.",
    highlight: ".timer-section",
    position: "left",
  },
  {
    id: "timer-red",
    title: "Wait - Red Light",
    description:
      "If traffic light is <span style='color: #e53e3e; font-weight: bold;'>red</span>, you cannot move. Wait for your turn.",
    highlight: ".timer-section",
    position: "left",
  },
  {
    id: "turn-counter",
    title: "Turns Remaining",
    description:
      "This box shows how many <span style='font-weight: bold; color: #2c5282;'>turns</span> you have left in this round. Each player moves in turns, you can do only <span style='color: #e53e3e; font-weight: bold;'>one action per turn</span>.",
    highlight: ".turns-remaining-section",
    position: "left",
  },
  {
    id: "movement-controls",
    title: "Movement Controls",
    description:
      "You can move your avatar using these <span style='font-weight: bold; color: #2c5282;'>control buttons</span>. You can move <span style='color: #2c5282; font-weight: bold;'>1 cell per turn</span>.",
    highlight: ".movement-controls",
    position: "left",
  },
  {
    id: "action-buttons",
    title: "Lock & Unlock Actions",
    description:
      "These buttons can activate <span style='color: #e53e3e; font-weight: bold;'>locking</span> and <span style='color: #38a169; font-weight: bold;'>unlocking</span> beams to freeze and unfreeze players.",
    highlight: ".action-buttons",
    position: "left",
  },
  {
    id: "try-star-collection",
    title: "Collect a Star",
    description: "Now, let's try to get this star!",
    highlight: ".inline-grid > div:nth-child(35)",
    position: "bottom",
  },
  {
    id: "try-movement",
    title: "Try Moving",
    description: "Click on the right arrow button to move to the right.",
    highlight: ".movement-controls",
    position: "left",
    requiresUserActionToAdvance: true,
  },
  {
    id: "star-badge",
    title: "Star Badge",
    description: "You have collected the star! Now, got a badge with your star score!",
    highlight: ".inline-grid > div:nth-child(35)",
    position: "bottom",
  },
  {
    id: "try-locking",
    title: "Try Locking",
    description: "Let's try to lock this player.",
    highlight: ".inline-grid > div:nth-child(65)",
    position: "left",
  },
  {
    id: "activate-beam",
    title: "Activate Lock",
    description:
      "Click on the <span style='color: #e53e3e; font-weight: bold;'>LOCK</span> button to activate locking mode.",
    highlight: ".action-buttons",
    position: "left",
    requiresUserActionToAdvance: true,
  },
  {
    id: "send-beam",
    title: "Send Beam",
    description: "Click on the down arrow button to send the beam.",
    highlight: ".movement-controls",
    position: "top",
    requiresUserActionToAdvance: true,
  },
  {
    id: "lock-badge",
    title: "Lock Badge",
    description: "You have locked the player! Now, got a badge with your lock score!",
    highlight: ".inline-grid > div:nth-child(35)",
    position: "left",
  },
  {
    id: "locked-player-demo",
    title: "Locked Player Status",
    description:
      "This player is <span style='font-weight: bold; color: #e53e3e;'>locked for 3 turns</span> and cannot move. Now, let's try to <span style='color: #38a169; font-weight: bold;'>unlock</span> him.",
    highlight: ".inline-grid > div:nth-child(65)",
    position: "left",
  },
  {
    id: "try-unlocking",
    title: "Activate Unlock Beam",
    description:
      "Click on the <span style='color: #38a169; font-weight: bold;'>UNLOCK</span> button to activate unlocking mode.",
    highlight: ".action-buttons",
    position: "left",
    requiresUserActionToAdvance: true,
  },
  {
    id: "send-unlock-beam",
    title: "Send Unlock Beam",
    description: "Click on the down arrow button to send the beam and free the player.",
    highlight: ".movement-controls",
    position: "top",
    requiresUserActionToAdvance: true,
  },
  {
    id: "unlock-badge",
    title: "Unlock Badge!",
    description: "Player unlocked! You've earned an unlock badge!",
    highlight: ".inline-grid > div:nth-child(35)",
    position: "left",
  },
  {
    id: "ready-to-play",
    title: "Ready to Play!",
    description: `
      <div style="text-align: center;">
        <div style="font-size: 26px; color: #38a169; font-weight: bold; margin-bottom: 12px;">
          You're Ready to Play!
        </div>
        <div style="font-size: 17px; color: #4a5568; margin-bottom: 14px; line-height: 1.5;">
          <span style="display: block; margin-bottom: 4px;">
            <strong>Remember, your reward depends <span style="color: #2c5282;">only</span> on the number of stars you harvest.</strong>
          </span>
          <span>
            But <span style="color: #e53e3e; font-weight: bold;">Lock</span> and
            <span style="color: #38a169; font-weight: bold;"> Unlock</span> badges may influence extra points rewarded by other players to you.
          </span>
        </div>
      </div>
    `,
    highlight: null,
    position: "center",
  },
];

export function Tutorial({ onComplete }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [mockGame, setMockGame] = useState<GameState>(createMockGame);
  const [tooltipPosition, setTooltipPosition] = useState<React.CSSProperties>({
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 110,
    transition: "all 0.5s ease-in-out",
  });
  const [highlightOverlayStyle, setHighlightOverlayStyle] = useState<React.CSSProperties>({
    position: "fixed",
    zIndex: 59,
    pointerEvents: "none",
    opacity: 0,
    top: "0px",
    left: "0px",
    width: "0px",
    height: "0px",
    transition:
      "top 0.5s ease-in-out, left 0.5s ease-in-out, width 0.5s ease-in-out, height 0.5s ease-in-out, opacity 0.3s ease-in-out",
  });
  const [secondaryHighlightStyles, setSecondaryHighlightStyles] = useState<React.CSSProperties[]>([]);
  const [isTutorialLockModePrimed, setIsTutorialLockModePrimed] = useState(false);
  const [isTutorialUnlockModePrimed, setIsTutorialUnlockModePrimed] = useState(false);
  const [tutorialBeamCells, setTutorialBeamCells] = useState<Array<{ x: number; y: number }> | null>(null);
  const [tutorialBeamType, setTutorialBeamType] = useState<"lock" | "unlock" | null>(null);
  const [tutorialTargetedPlayerIndex, setTutorialTargetedPlayerIndex] = useState<number | null>(null);
  const [beamCellOverlayStyles, setBeamCellOverlayStyles] = useState<React.CSSProperties[]>([]);
  const [targetPlayerHighlightStyle, setTargetPlayerHighlightStyle] = useState<React.CSSProperties | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Window resize
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getTooltipPos = useCallback(
    (el: HTMLElement | null) => {
      const stepData = tutorialSteps[currentStep];
      if (!stepData || !el) {
        return { position: "fixed" as const, top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 110, transition: "all 0.5s ease-in-out" };
      }

      const rect = el.getBoundingClientRect();
      const tooltipWidth = Math.min(320, windowSize.width * 0.8);
      const tooltipHeight = Math.min(180, windowSize.height * 0.3);
      const margin = Math.min(100, windowSize.width * 0.05);

      let top = 0;
      let left = 0;
      const pp = stepData.position;

      const spaceRight = windowSize.width - rect.right;
      const spaceLeft = rect.left;
      const spaceTop = rect.top;
      const spaceBottom = windowSize.height - rect.bottom;

      if (pp === "right" && spaceRight >= tooltipWidth + margin) {
        left = rect.right + margin;
        top = Math.max(margin, Math.min(windowSize.height - tooltipHeight - margin, rect.top + (rect.height - tooltipHeight) / 2));
      } else if (pp === "left" && spaceLeft >= tooltipWidth + margin) {
        left = rect.left - tooltipWidth - margin;
        top = Math.max(margin, Math.min(windowSize.height - tooltipHeight - margin, rect.top + (rect.height - tooltipHeight) / 2));
      } else if (pp === "top" && spaceTop >= tooltipHeight + margin) {
        top = rect.top - tooltipHeight - margin;
        left = Math.max(margin, Math.min(windowSize.width - tooltipWidth - margin, rect.left + (rect.width - tooltipWidth) / 2));
      } else if (pp === "bottom" && spaceBottom >= tooltipHeight + margin) {
        top = rect.bottom + margin;
        left = Math.max(margin, Math.min(windowSize.width - tooltipWidth - margin, rect.left + (rect.width - tooltipWidth) / 2));
      } else {
        const positions = [
          { space: spaceRight, left: rect.right + margin, top: rect.top + (rect.height - tooltipHeight) / 2 },
          { space: spaceLeft, left: rect.left - tooltipWidth - margin, top: rect.top + (rect.height - tooltipHeight) / 2 },
          { space: spaceTop, left: rect.left + (rect.width - tooltipWidth) / 2, top: rect.top - tooltipHeight - margin },
          { space: spaceBottom, left: rect.left + (rect.width - tooltipWidth) / 2, top: rect.bottom + margin },
        ];
        const best = positions.reduce((a, b) => (b.space > a.space ? b : a));
        left = best.left;
        top = best.top;
      }

      top = Math.max(margin, Math.min(windowSize.height - tooltipHeight - margin, top));
      left = Math.max(margin, Math.min(windowSize.width - tooltipWidth - margin, left));

      return { position: "fixed" as const, top: `${top}px`, left: `${left}px`, zIndex: 110, transition: "all 0.5s ease-in-out" };
    },
    [currentStep, windowSize]
  );

  // Navigation
  const nextStep = useCallback(() => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  }, [currentStep, onComplete]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  }, [currentStep]);

  // Highlighting and step logic
  useEffect(() => {
    const timer = setTimeout(() => {
      const stepData = tutorialSteps[currentStep];
      if (!stepData) return;

      if (stepData.id !== "send-beam") setIsTutorialLockModePrimed(false);
      if (stepData.id !== "send-unlock-beam") setIsTutorialUnlockModePrimed(false);

      const padding = 10;
      let primaryEl: HTMLElement | null = null;
      const newSecondary: React.CSSProperties[] = [];

      if (stepData.highlight) {
        const targets = Array.from(document.querySelectorAll(stepData.highlight)) as HTMLElement[];
        if (targets.length > 0) {
          primaryEl = targets[0];
          const r = primaryEl.getBoundingClientRect();
          setHighlightOverlayStyle((prev) => ({
            ...prev,
            opacity: 1,
            top: `${r.top - padding}px`,
            left: `${r.left - padding}px`,
            width: `${r.width + padding * 2}px`,
            height: `${r.height + padding * 2}px`,
          }));
          for (let i = 1; i < targets.length; i++) {
            const sr = targets[i].getBoundingClientRect();
            newSecondary.push({
              position: "fixed",
              zIndex: 58,
              pointerEvents: "none",
              opacity: 1,
              top: `${sr.top - padding}px`,
              left: `${sr.left - padding}px`,
              width: `${sr.width + padding * 2}px`,
              height: `${sr.height + padding * 2}px`,
              transition: "opacity 0.3s ease-in-out",
            });
          }
        } else {
          setHighlightOverlayStyle((prev) => ({ ...prev, opacity: 0 }));
        }
      } else {
        setHighlightOverlayStyle((prev) => ({ ...prev, opacity: 0 }));
      }
      setSecondaryHighlightStyles(newSecondary);

      // Control button states for specific steps
      const goSteps = ["movement-controls", "action-buttons", "try-movement", "activate-beam", "send-beam", "try-unlocking", "send-unlock-beam"];
      if (goSteps.includes(stepData.id)) {
        setMockGame((prev) => ({ ...prev, turnStartTime: Date.now() - 1100 }));
      } else {
        setMockGame((prev) => ({ ...prev, turnStartTime: Date.now() - 15000 }));
      }

      // Manage which buttons are active
      const lockBtn = document.querySelector(".action-buttons button:first-child") as HTMLElement | null;
      const unlockBtn = document.querySelector(".action-buttons button:last-child") as HTMLElement | null;
      if (lockBtn && unlockBtn) {
        lockBtn.style.pointerEvents = "auto";
        lockBtn.style.opacity = "1";
        unlockBtn.style.pointerEvents = "auto";
        unlockBtn.style.opacity = "1";

        if (stepData.id === "try-movement") {
          lockBtn.style.pointerEvents = "none";
          lockBtn.style.opacity = "0.5";
          unlockBtn.style.pointerEvents = "none";
          unlockBtn.style.opacity = "0.5";
        } else if (stepData.id === "activate-beam") {
          unlockBtn.style.pointerEvents = "none";
          unlockBtn.style.opacity = "0.5";
        } else if (stepData.id === "try-unlocking") {
          lockBtn.style.pointerEvents = "none";
          lockBtn.style.opacity = "0.5";
        } else if (stepData.id === "send-beam" || stepData.id === "send-unlock-beam") {
          lockBtn.style.pointerEvents = "none";
          lockBtn.style.opacity = "0.5";
          unlockBtn.style.pointerEvents = "none";
          unlockBtn.style.opacity = "0.5";
        }
      }

      // Manage movement buttons
      const moveBtns = document.querySelectorAll(".movement-controls button") as NodeListOf<HTMLElement>;
      const downOnlySteps = ["send-beam", "send-unlock-beam"];
      moveBtns.forEach((btn) => {
        if (stepData.id === "try-movement") {
          if (btn.textContent?.trim() === "\u25B6") {
            btn.style.pointerEvents = "auto";
            btn.style.opacity = "1";
          } else {
            btn.style.pointerEvents = "none";
            btn.style.opacity = "0.5";
          }
        } else if (downOnlySteps.includes(stepData.id)) {
          if (btn.textContent?.trim() === "\u25BC") {
            btn.style.pointerEvents = "auto";
            btn.style.opacity = "1";
          } else {
            btn.style.pointerEvents = "none";
            btn.style.opacity = "0.5";
          }
          if (stepData.id === "send-beam") {
            btn.style.backgroundColor = "#ef4444";
            btn.style.color = "white";
          } else if (stepData.id === "send-unlock-beam") {
            btn.style.backgroundColor = "#22c55e";
            btn.style.color = "white";
          }
        } else if (["activate-beam", "try-unlocking"].includes(stepData.id)) {
          btn.style.pointerEvents = "none";
          btn.style.opacity = "0.5";
        } else {
          btn.style.pointerEvents = "auto";
          btn.style.opacity = "1";
          btn.style.backgroundColor = "";
          btn.style.color = "";
        }
      });

      setTimeout(() => setTooltipPosition(getTooltipPos(primaryEl)), 50);
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStep, getTooltipPos]);

  // Keep GO state for interactive steps
  useEffect(() => {
    const goSteps = ["movement-controls", "action-buttons", "try-movement", "activate-beam", "send-beam", "try-unlocking", "send-unlock-beam"];
    const stepData = tutorialSteps[currentStep];
    if (!stepData || !goSteps.includes(stepData.id)) return;

    const interval = setInterval(() => {
      setMockGame((prev) => ({ ...prev, turnStartTime: Date.now() - 1100 }));
    }, 200);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Handle "try-movement" step - click right arrow to collect star
  useEffect(() => {
    const stepData = tutorialSteps[currentStep];
    if (!stepData || stepData.id !== "try-movement") return;

    const handler = (event: MouseEvent) => {
      const el = event.target as HTMLElement;
      const btn = el.closest("button");
      if (btn && btn.textContent?.trim() === "\u25B6" && btn.closest(".movement-controls")) {
        // Move player right from (3,3) to (4,3), collecting star
        setMockGame((prev) => {
          const newGrid = prev.grid.map((row) => [...row]);
          newGrid[3][4] = "empty";
          const newStars = prev.stars.filter((s) => !(s.x === 4 && s.y === 3));
          const newPositions = [...prev.playerPositions];
          newPositions[0] = { x: 4, y: 3 };
          return {
            ...prev,
            grid: newGrid,
            stars: newStars,
            playerPositions: newPositions,
            team1Score: prev.team1Score + 1,
            gameActions: [
              ...prev.gameActions,
              {
                playerId: "human",
                action: "move" as const,
                fromX: 3,
                fromY: 3,
                toX: 4,
                toY: 3,
                direction: "right" as const,
                result: "harvested" as const,
                round: 1,
                turn: 1,
                timestamp: Date.now(),
              },
            ],
          };
        });
        nextStep();
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [currentStep, nextStep]);

  // Handle lock and unlock interactions
  useEffect(() => {
    const stepData = tutorialSteps[currentStep];
    if (
      !stepData ||
      !(
        stepData.id === "activate-beam" ||
        (stepData.id === "send-beam" && isTutorialLockModePrimed) ||
        stepData.id === "try-unlocking" ||
        (stepData.id === "send-unlock-beam" && isTutorialUnlockModePrimed)
      ) ||
      !stepData.requiresUserActionToAdvance
    )
      return;

    const handler = (event: MouseEvent) => {
      const el = event.target as HTMLElement;
      const btn = el.closest("button");

      if (stepData.id === "activate-beam") {
        if (btn && btn.textContent?.toUpperCase().includes("LOCK") && btn.closest(".action-buttons")) {
          setIsTutorialLockModePrimed(true);
          event.stopPropagation();
          nextStep();
        }
      } else if (stepData.id === "send-beam" && isTutorialLockModePrimed) {
        if (btn && btn.textContent?.trim() === "\u25BC" && btn.closest(".movement-controls")) {
          // Calculate beam cells downward from player at (4,3)
          const beamCells: Array<{ x: number; y: number }> = [];
          for (let y = 4; y <= 9; y++) {
            beamCells.push({ x: 4, y });
            if (mockGame.playerPositions.find((p) => p.x === 4 && p.y === y)) break;
          }
          setTutorialBeamCells(beamCells);
          setTutorialBeamType("lock");
          setTutorialTargetedPlayerIndex(3);
          setTimeout(() => {
            setTutorialBeamCells(null);
            setTutorialBeamType(null);
            setTutorialTargetedPlayerIndex(null);
          }, 800);

          setMockGame((prev) => {
            const newLocks = [...prev.playerLocks];
            newLocks[3] = { isLocked: true, turnsRemaining: 3 };
            return {
              ...prev,
              playerLocks: newLocks,
              gameActions: [
                ...prev.gameActions,
                {
                  playerId: "human",
                  action: "lock" as const,
                  fromX: 4,
                  fromY: 3,
                  direction: "down" as const,
                  targetPlayer: 3,
                  result: "locked" as const,
                  round: 1,
                  turn: 2,
                  timestamp: Date.now(),
                },
              ],
            };
          });
          setIsTutorialLockModePrimed(false);
          nextStep();
        }
      } else if (stepData.id === "try-unlocking") {
        if (btn && btn.textContent?.toUpperCase().includes("UNLOCK") && btn.closest(".action-buttons")) {
          setIsTutorialUnlockModePrimed(true);
          event.stopPropagation();
          nextStep();
        }
      } else if (stepData.id === "send-unlock-beam" && isTutorialUnlockModePrimed) {
        if (btn && btn.textContent?.trim() === "\u25BC" && btn.closest(".movement-controls")) {
          const beamCells: Array<{ x: number; y: number }> = [];
          for (let y = 4; y <= 9; y++) {
            beamCells.push({ x: 4, y });
            if (mockGame.playerPositions.find((p) => p.x === 4 && p.y === y)) break;
          }
          setTutorialBeamCells(beamCells);
          setTutorialBeamType("unlock");
          setTutorialTargetedPlayerIndex(3);
          setTimeout(() => {
            setTutorialBeamCells(null);
            setTutorialBeamType(null);
            setTutorialTargetedPlayerIndex(null);
          }, 800);

          setMockGame((prev) => {
            const newLocks = [...prev.playerLocks];
            newLocks[3] = { isLocked: false, turnsRemaining: 0 };
            return {
              ...prev,
              playerLocks: newLocks,
              gameActions: [
                ...prev.gameActions,
                {
                  playerId: "human",
                  action: "unlock" as const,
                  fromX: 4,
                  fromY: 3,
                  direction: "down" as const,
                  targetPlayer: 3,
                  result: "unlocked" as const,
                  round: 1,
                  turn: 3,
                  timestamp: Date.now(),
                },
              ],
            };
          });
          setIsTutorialUnlockModePrimed(false);
          nextStep();
        }
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [currentStep, isTutorialLockModePrimed, isTutorialUnlockModePrimed, nextStep, mockGame.playerPositions]);

  // Beam overlay styles
  useEffect(() => {
    if (tutorialBeamCells && tutorialBeamType) {
      const styles: React.CSSProperties[] = [];
      for (const cell of tutorialBeamCells) {
        const cellEl = document.querySelector(`.inline-grid > div:nth-child(${cell.y * 10 + cell.x + 1})`) as HTMLElement | null;
        if (cellEl) {
          const r = cellEl.getBoundingClientRect();
          styles.push({
            position: "fixed",
            top: `${r.top}px`,
            left: `${r.left}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
            backgroundColor: tutorialBeamType === "lock" ? "rgba(255, 0, 0, 0.3)" : "rgba(0, 255, 0, 0.3)",
            zIndex: 64,
            pointerEvents: "none",
            borderRadius: "4px",
          });
        }
      }
      setBeamCellOverlayStyles(styles);
    } else {
      setBeamCellOverlayStyles([]);
    }

    if (tutorialTargetedPlayerIndex !== null && mockGame.playerPositions[tutorialTargetedPlayerIndex]) {
      const tp = mockGame.playerPositions[tutorialTargetedPlayerIndex];
      const cellEl = document.querySelector(`.inline-grid > div:nth-child(${tp.y * 10 + tp.x + 1})`) as HTMLElement | null;
      if (cellEl) {
        const r = cellEl.getBoundingClientRect();
        setTargetPlayerHighlightStyle({
          position: "fixed",
          top: `${r.top}px`,
          left: `${r.left}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          border: tutorialBeamType === "lock" ? "3px solid red" : "3px solid green",
          boxSizing: "border-box",
          zIndex: 65,
          pointerEvents: "none",
          borderRadius: "4px",
        });
      }
    } else {
      setTargetPlayerHighlightStyle(null);
    }
  }, [tutorialBeamCells, tutorialBeamType, tutorialTargetedPlayerIndex, mockGame.playerPositions]);

  // Update highlight positions on resize
  useEffect(() => {
    const stepData = tutorialSteps[currentStep];
    if (!stepData?.highlight) return;
    const targets = Array.from(document.querySelectorAll(stepData.highlight)) as HTMLElement[];
    if (targets.length > 0) {
      const r = targets[0].getBoundingClientRect();
      const padding = 10;
      setHighlightOverlayStyle((prev) => ({
        ...prev,
        opacity: 1,
        top: `${r.top - padding}px`,
        left: `${r.left - padding}px`,
        width: `${r.width + padding * 2}px`,
        height: `${r.height + padding * 2}px`,
      }));
      setTooltipPosition(getTooltipPos(targets[0]));
    }
  }, [windowSize, currentStep, getTooltipPos]);

  const stepData = tutorialSteps[currentStep];
  if (!stepData) return null;

  return (
    <div className="relative w-full min-h-screen">
      {/* Highlight Overlay */}
      <div style={highlightOverlayStyle} className="animated-tutorial-highlight" />
      {secondaryHighlightStyles.map((style, i) => (
        <div key={`sec-${i}`} style={style} className="animated-tutorial-highlight secondary-highlight" />
      ))}

      {/* Beam overlays */}
      {beamCellOverlayStyles.map((style, i) => (
        <div key={`beam-${i}`} style={style} className="tutorial-beam-cell-pulse" />
      ))}
      {targetPlayerHighlightStyle && <div style={targetPlayerHighlightStyle} className="tutorial-target-player-flash" />}

      {/* Welcome overlay */}
      {stepData.id === "welcome" && <div className="absolute inset-0 bg-white/30 pointer-events-none z-40" />}

      {/* Tooltip */}
      <div className="tutorial-tooltip pointer-events-auto" style={tooltipPosition}>
        <div className="bg-white rounded-lg shadow-2xl border-2 border-green-500 p-4 w-80 transition-all duration-500 ease-in-out">
          <div
            className="text-gray-700 mb-4 leading-relaxed text-md"
            dangerouslySetInnerHTML={{ __html: stepData.description }}
          />
          <div className="flex justify-between">
            <button
              onClick={prevStep}
              disabled={currentStep === 0 || currentStep >= 16}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="text-xs" /> Previous
            </button>
            {!stepData.requiresUserActionToAdvance && (
              <button
                onClick={nextStep}
                className="flex items-center gap-1 bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                {currentStep === tutorialSteps.length - 1 ? "Start Playing!" : "Next"}
                <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* GameBoard */}
      <div className="w-full min-h-screen">
        <style>{`
          .animated-tutorial-highlight {
            border: 2px solid rgba(34, 197, 94, 0.8) !important;
            box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.8), 0 0 0 8px rgba(34, 197, 94, 0.4), 0 0 20px rgba(34, 197, 94, 0.6) !important;
            border-radius: 10px !important;
            animation: tutorial-pulse 2s ease-in-out infinite;
          }
          .secondary-highlight {
            border-color: rgba(34, 197, 94, 0.6) !important;
            box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.6), 0 0 0 8px rgba(34, 197, 94, 0.3), 0 0 20px rgba(34, 197, 94, 0.4) !important;
          }
          @keyframes tutorial-pulse {
            0%, 100% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.8), 0 0 0 8px rgba(34, 197, 94, 0.4), 0 0 20px rgba(34, 197, 94, 0.6); }
            50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 1), 0 0 0 12px rgba(34, 197, 94, 0.6), 0 0 25px rgba(34, 197, 94, 0.8); }
          }
          .tutorial-beam-cell-pulse {
            animation: tutorial-beam-pulse 0.5s ease-in-out infinite;
          }
          .tutorial-target-player-flash {
            animation: tutorial-target-flash 0.4s ease-in-out 2;
          }
          @keyframes tutorial-beam-pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 0.9; transform: scale(1.05); }
          }
          @keyframes tutorial-target-flash {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); }
            50% { box-shadow: 0 0 0 7px rgba(255, 0, 0, 0.4); }
          }
          .tutorial-tooltip { z-index: 110 !important; }
          .tutorial-mode .movement-controls button { pointer-events: auto; }
          .tutorial-mode .action-buttons button { pointer-events: auto; }
        `}</style>
        <div className="tutorial-mode min-h-screen">
          <GameBoard game={mockGame} onGameUpdate={() => {}} isTutorial={true} />
        </div>
      </div>
    </div>
  );
}
