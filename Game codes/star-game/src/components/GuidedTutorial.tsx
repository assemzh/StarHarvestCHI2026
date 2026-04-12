import { useState, useEffect, useCallback } from "react";
import { GameBoard } from "./GameBoard";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowRight, faArrowLeft, faTimes, faInfoCircle,
    faStar, faLock, faLockOpen
} from '@fortawesome/free-solid-svg-icons';

interface GuidedTutorialProps {
    onComplete: () => void;
}

// Define types for player state in the tutorial
interface PlayerActionCounts {
    stars: number;
    locks: number;
    unlocks: number;
}

interface PlayerTutorialPosition {
    id: string;
    x: number;
    y: number;
    justCollectedStar?: boolean;
    actionCounts?: PlayerActionCounts; // Added for badges
}

// Mock game data for tutorial
const createMockGame = () => {
    const grid = Array(10).fill(null).map(() => Array(10).fill(""));

    // Add stars to grid at specific positions
    grid[3][4] = "star"; // Fresh star at (4, 3)
    grid[9][7] = "star"; // Old star at (7, 9)

    const defaultActionCounts = (): PlayerActionCounts => ({ stars: 0, locks: 0, unlocks: 0 });

    // Define player IDs based on team setup
    const playerIds = {
        user: "user123",
        teammateBot: "bot1",
        opponentHuman: "opponent456",
        opponentBot: "bot2"
    };

    // Ensure playerPositions conform to PlayerTutorialPosition[]
    const playerPositions: PlayerTutorialPosition[] = [
        { id: playerIds.user, x: 3, y: 3, actionCounts: defaultActionCounts() }, // User (purple team)
        { id: playerIds.teammateBot, x: 8, y: 3, actionCounts: defaultActionCounts() }, // Bot teammate (purple team)
        { id: playerIds.opponentHuman, x: 8, y: 8, actionCounts: defaultActionCounts() }, // Opponent (orange team)
        { id: playerIds.opponentBot, x: 4, y: 6, actionCounts: defaultActionCounts() }  // Bot opponent (orange team)
    ];

    // Initialize individual player scores
    const playerScores: { [key: string]: number } = {};
    playerScores[playerIds.user] = 0;
    playerScores[playerIds.teammateBot] = 0;
    playerScores[playerIds.opponentHuman] = 0;
    playerScores[playerIds.opponentBot] = 0;

    return {
        _id: "tutorial_game",
        status: "active",
        currentRound: 1,
        currentTurn: 1,
        currentPlayer: 0, // User's turn
        turnsRemaining: 60,
        team1: [playerIds.user, playerIds.teammateBot],
        team2: [playerIds.opponentHuman, playerIds.opponentBot],
        team1Score: 2,
        team2Score: 1,
        playerScores, // Add individual player scores
        roundScores: [],
        grid,
        playerPositions,
        playerLocks: [
            { isLocked: false, turnsRemaining: 0 },
            { isLocked: false, turnsRemaining: 0 },
            { isLocked: false, turnsRemaining: 0 }, // Opponent is locked
            { isLocked: false, turnsRemaining: 0 }
        ],
        stars: [
            { x: 4, y: 3, turnsAlive: 3 },
            { x: 7, y: 9, turnsAlive: 12 } // Old star
        ],
        turnStartTime: Date.now(),
        playerIndex: 0, // User is player 0
        teamNumber: 1,
        isCurrentPlayer: true,
        isTutorialActionStep: false
    };
};

const tutorialSteps = [
    {
        id: "welcome",
        title: "Welcome to Star Harvest!",
        description: "<div style='text-align: center;'><span style='font-size: 28px; color: #2c5282; font-weight: bold;'>Welcome to the Star Harvest Experiment!</span><br><br><span style='font-size: 20px; color: #4a5568;'>Here we will start with a short tutorial to explain the game.</span><br><br><span style='font-size: 24px; color: #38a169; font-weight: bold;'>Let's GO! 🚀</span></div>",
        highlight: null,
        position: "center"
    },
    {
        id: "game-grid",
        title: "The Game Board",
        description: "🎮 This is the <span style='font-weight: bold; color: #2c5282;'>game grid</span> where players move and collect <span style='font-weight: bold; color: #2c5282;'>⭐ stars</span>.",
        highlight: ".inline-grid",
        position: "top"
    },
    {
        id: "stars-collect",
        title: "Collect Stars",
        description: "🌟 Your goal is to <span style='font-weight: bold; color: #2c5282;'>collect as many stars as possible</span> by moving on the grid.",
        highlight: ".stars-on-grid .fa-star",
        position: "right"
    },
    {
        id: "stars-timing",
        title: "Star Timing",
        description: "🌟 Stars can <span style='font-weight: bold; color: #2c5282;'>appear and disappear</span> at any moment. So, you should collect them quickly.",
        highlight: ".stars-on-grid .fa-star",
        position: "right"
    },
    {
        id: "your-avatar",
        title: "Your Avatar",
        description: "👤 This is your <span style='font-weight: bold; color: #2c5282;'>avatar</span>.",
        highlight: ".player-identity-section, .inline-grid > div:nth-child(34) ",
        position: "right"
    },
    {
        id: "turn-indicator",
        title: "Turn Indicator",
        description: "Your avatar will be always highlighted with a <span style='color: #e53e3e; font-weight: bold;'>red triangle 🔺</span> below it.",
        highlight: ".current-player-indicator",
        position: "right"
    },
    {
        id: "round-info",
        title: "Round Info",
        description: "📊 You will play <span style='font-weight: bold; color: #2c5282;'>3 rounds</span>  in this game. Here you can see <span style='font-weight: bold; color: #2c5282;'>current round</span>.",
        highlight: ".round-info-section",
        position: "right"
    },
    {
        id: "team-scores",
        title: "Team Scores",
        description: "📊 Here you can see <span style='font-weight: bold; color: #2c5282;'>teams' scores</span> for the current round.",
        highlight: ".team-scores-section",
        position: "right"
    },
    {
        id: "your-team",
        title: "Your Team",
        description: "🤝 This is your <span style='font-weight: bold; color: #2c5282;'>team</span>. You will be teamed up with a <span style='color: #2c5282; font-weight: bold;'>🤖 bot</span>. Your team will have <span style='color: #2c5282; font-weight: bold;'>same color</span> and <span style='color: #2c5282; font-weight: bold;'>icon shape</span>.",
        highlight: ".inline-grid > div:nth-child(34), .inline-grid > div:nth-child(39)",
        position: "bottom"
    },
    {
        id: "opponent-team",
        title: "Opponent Team",
        description: "⚔️ Your <span style='font-weight: bold; color: #e53e3e;'>opponents</span> are in different color and shape. One of them is <span style='color: #2c5282; font-weight: bold;'>👤 human</span> and the other is a <span style='color: #2c5282; font-weight: bold;'>🤖 bot</span>.",
        highlight: ".inline-grid > div:nth-child(65), .inline-grid > div:nth-child(89)",
        position: "top"
    },

    {
        id: "timer-green",
        title: "Your Turn - Green Light",
        description: "🚦 When traffic light becomes <span style='color: #38a169; font-weight: bold;'>🟢 green</span>, you will hear a <span style='cursor: pointer; color: #0066cc; text-decoration: underline;'>sound</span> and can move. You have only <span style='color: #e53e3e; font-weight: bold;'>10 seconds</span> to act or you will miss your turn.",
        highlight: ".timer-section",
        position: "left"
    },
    {
        id: "timer-red",
        title: "Wait - Red Light",
        description: "🚦 If traffic light is <span style='color: #e53e3e; font-weight: bold;'>🔴 red</span>, you cannot move. Wait for your turn.",
        highlight: ".timer-section",
        position: "left"
    },
    {
        id: "turn-counter",
        title: "Turns Remaining",
        description: "⏱️ This box shows how many <span style='font-weight: bold; color: #2c5282;'>turns</span> you have left in this round. Each player moves in turns, you can do only <span style='color: #e53e3e; font-weight: bold;'>one action per turn</span>.",
        highlight: ".turns-remaining-section",
        position: "left"
    },
    {
        id: "movement-controls",
        title: "Movement Controls",
        description: "🎮 You can move your avatar using these <span style='font-weight: bold; color: #2c5282;'>control buttons</span>. You can move <span style='color: #2c5282; font-weight: bold;'>1 cell per turn</span>.",
        highlight: ".movement-controls",
        position: "left"
    },
    {
        id: "action-buttons",
        title: "Lock & Unlock Actions",
        description: "🔫 These buttons can activate <span style='color: #e53e3e; font-weight: bold;'>locking</span> and <span style='color: #38a169; font-weight: bold;'>unlocking</span> beams to freeze and unfreeze players.",
        highlight: ".action-buttons",
        position: "left"
    },
    {
        id: "try-star-collection",
        title: "Collect a Star",
        description: "🎯 Now, let's try to get this star!",
        highlight: ".inline-grid > div:nth-child(35)",
        position: "bottom"
    },
    {
        id: "try-movement",
        title: "Try Moving",
        description: "Click on the right arrow button to move to the ➡️ right.",
        highlight: ".movement-controls",
        position: "left",
        requiresUserActionToAdvance: true
    },
    {
        id: "star-badge",
        title: "Star Badge",
        description: "You have collected the star! Now, got a badge with your star score 🎉..",
        highlight: ".inline-grid > div:nth-child(35)",
        position: "bottom",
    },
    {
        id: "try-locking",
        title: "Try Locking",
        description: "🎯 Let's try to lock this player.",
        highlight: ".inline-grid > div:nth-child(65)",
        position: "left",
    },
    {
        id: "activate-beam",
        title: "Activate Lock",
        description: "🔒 Click on the <span style='color: #e53e3e; font-weight: bold;'>LOCK</span> button to activate locking mode.",
        highlight: ".action-buttons",
        position: "left",
        requiresUserActionToAdvance: true
    },
    {
        id: "send-beam",
        title: "Send Beam",
        description: "⬇️ Click on the down arrow button to send the beam.",
        highlight: ".movement-controls",
        position: "top",
        requiresUserActionToAdvance: true
    },
    {
        id: "lock-badge",
        title: "Lock Badge",
        description: "You have locked the player! Now, got a badge with your lock score 🎉..",
        highlight: ".inline-grid > div:nth-child(35)",
        position: "left",
    },
    {
        id: "locked-player-demo",
        title: "Locked Player Status",
        description: "🔒 This player is <span style='font-weight: bold; color: #e53e3e;'>locked for 3 turns</span> and cannot move. Now, let's try to <span style='color: #38a169; font-weight: bold;'>unlock</span> him.",
        highlight: ".inline-grid > div:nth-child(65)", // Orange Bot at x:4, y:6
        position: "left"
    },
    {
        id: "try-unlocking",
        title: "Activate Unlock Beam",
        description: "🔓 Click on the <span style='color: #38a169; font-weight: bold;'>UNLOCK</span> button to activate unlocking mode.",
        highlight: ".action-buttons",
        position: "left",
        requiresUserActionToAdvance: true
    },
    {
        id: "send-unlock-beam",
        title: "Send Unlock Beam",
        description: "⬇️ Click on the down arrow button to send the beam and free the player.",
        highlight: ".movement-controls",
        position: "top", // Changed from left as per user's diff for send-lock-beam
        requiresUserActionToAdvance: true
    },
    {
        id: "unlock-badge",
        title: "Unlock Badge!",
        description: "Player unlocked! You've earned an unlock badge! 🎉",
        highlight: ".inline-grid > div:nth-child(35)", // User's avatar for badge display
        position: "left"
    },
    {
        id: "ready-to-play",
        title: "Ready to Play!",
        description: `
            <div style="text-align: center;">
                <div style="font-size: 26px; color: #38a169; font-weight: bold; margin-bottom: 12px;">
                    🏆 You're Ready to Play!
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
        position: "center"
    }
];

export function GuidedTutorial({ onComplete }: GuidedTutorialProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [mockGame, setMockGame] = useState(createMockGame);
    const [tooltipPosition, setTooltipPosition] = useState<any>({
        position: "fixed" as const,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 110,
        transition: "all 0.5s ease-in-out"
    });
    const [highlightOverlayStyle, setHighlightOverlayStyle] = useState<React.CSSProperties>({
        position: 'fixed',
        zIndex: 59,
        pointerEvents: 'none',
        opacity: 0,
        top: '0px',
        left: '0px',
        width: '0px',
        height: '0px',
        transition: 'top 0.5s ease-in-out, left 0.5s ease-in-out, width 0.5s ease-in-out, height 0.5s ease-in-out, opacity 0.3s ease-in-out',
    });
    const [secondaryHighlightStyles, setSecondaryHighlightStyles] = useState<React.CSSProperties[]>([]);
    const [simulatedPlayerCellPosition, setSimulatedPlayerCellPosition] = useState<React.CSSProperties | null>(null);
    const [isTutorialLockModePrimed, setIsTutorialLockModePrimed] = useState(false);
    const [isTutorialUnlockModePrimed, setIsTutorialUnlockModePrimed] = useState(false);
    const [tutorialBeamCells, setTutorialBeamCells] = useState<Array<{ x: number, y: number }> | null>(null);
    const [tutorialBeamType, setTutorialBeamType] = useState<'lock' | 'unlock' | null>(null);
    const [tutorialTargetedPlayerIndex, setTutorialTargetedPlayerIndex] = useState<number | null>(null);

    const [beamCellOverlayStyles, setBeamCellOverlayStyles] = useState<React.CSSProperties[]>([]);
    const [targetPlayerHighlightStyle, setTargetPlayerHighlightStyle] = useState<React.CSSProperties | null>(null);

    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight
    });

    // Add window resize handler
    useEffect(() => {
        const handleResize = () => {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Update positions when window size changes
    useEffect(() => {
        const currentStepData = tutorialSteps[currentStep];
        if (!currentStepData) return;

        const targetElements = currentStepData.highlight
            ? Array.from(document.querySelectorAll(currentStepData.highlight)) as HTMLElement[]
            : [];

        if (targetElements.length > 0) {
            const primaryRect = targetElements[0].getBoundingClientRect();
            const padding = 10;

            // Update primary highlight
            setHighlightOverlayStyle(prevStyle => ({
                ...prevStyle,
                opacity: 1,
                top: `${primaryRect.top - padding}px`,
                left: `${primaryRect.left - padding}px`,
                width: `${primaryRect.width + padding * 2}px`,
                height: `${primaryRect.height + padding * 2}px`,
                transition: 'top 0.5s ease-in-out, left 0.5s ease-in-out, width 0.5s ease-in-out, height 0.5s ease-in-out, opacity 0.3s ease-in-out',
            }));

            // Update secondary highlights
            const newSecondaryHighlights: React.CSSProperties[] = [];
            for (let i = 1; i < targetElements.length; i++) {
                const secondaryTarget = targetElements[i];
                const secondaryRect = secondaryTarget.getBoundingClientRect();
                newSecondaryHighlights.push({
                    position: 'fixed',
                    zIndex: 58,
                    pointerEvents: 'none',
                    opacity: 1,
                    top: `${secondaryRect.top - padding}px`,
                    left: `${secondaryRect.left - padding}px`,
                    width: `${secondaryRect.width + padding * 2}px`,
                    height: `${secondaryRect.height + padding * 2}px`,
                    transition: 'top 0.5s ease-in-out, left 0.5s ease-in-out, width 0.5s ease-in-out, height 0.5s ease-in-out, opacity 0.3s ease-in-out',
                });
            }
            setSecondaryHighlightStyles(newSecondaryHighlights);
        } else {
            setHighlightOverlayStyle(prevStyle => ({ ...prevStyle, opacity: 0 }));
            setSecondaryHighlightStyles([]);
        }

        // Update tooltip position
        setTooltipPosition(getTooltipPosition(targetElements[0] || null));
    }, [windowSize, currentStep]);

    // Define navigation and action callbacks first
    const nextStep = useCallback(() => {
        if (currentStep < tutorialSteps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            try {
                const audio = new Audio('/bell.mp3');
                audio.volume = 0.3;
                audio.play().catch(error => {
                    console.log("Could not play completion sound:", error);
                });
            } catch (error) {
                console.log("Could not create audio element:", error);
            }
            onComplete();
        }
    }, [currentStep, onComplete]);

    const prevStep = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    }, [currentStep]);

    const skipTutorial = useCallback(() => {
        onComplete();
    }, [onComplete]);

    // Handle highlighting and specific step logic when step changes
    useEffect(() => {
        const applyHighlightingAndStepLogic = () => {
            try {
                document.querySelectorAll('.tutorial-highlight').forEach(el => {
                    el.classList.remove('tutorial-highlight');
                });

                const currentStepData = tutorialSteps[currentStep];
                if (!currentStepData) return;

                // Reset lock mode if not in send-beam step (after being primed by activate-beam)
                if (currentStepData.id !== 'send-beam') {
                    setIsTutorialLockModePrimed(false);
                }
                // Reset unlock mode if not in send-unlock-beam step
                if (currentStepData.id !== 'send-unlock-beam') {
                    setIsTutorialUnlockModePrimed(false);
                }

                let targetElementForTooltip: HTMLElement | null = null;
                const newSecondaryHighlights: React.CSSProperties[] = [];
                const padding = 10;

                if (currentStepData.highlight) {
                    const targetElements = Array.from(document.querySelectorAll(currentStepData.highlight)) as HTMLElement[];
                    if (targetElements.length > 0) {
                        targetElementForTooltip = targetElements[0];
                        const primaryRect = targetElementForTooltip.getBoundingClientRect();
                        setHighlightOverlayStyle(prevStyle => ({
                            ...prevStyle,
                            opacity: 1,
                            top: `${primaryRect.top - padding}px`,
                            left: `${primaryRect.left - padding}px`,
                            width: `${primaryRect.width + padding * 2}px`,
                            height: `${primaryRect.height + padding * 2}px`,
                            transition: 'top 0.5s ease-in-out, left 0.5s ease-in-out, width 0.5s ease-in-out, height 0.5s ease-in-out, opacity 0.3s ease-in-out',
                        }));
                        for (let i = 1; i < targetElements.length; i++) {
                            const secondaryTarget = targetElements[i];
                            const secondaryRect = secondaryTarget.getBoundingClientRect();
                            newSecondaryHighlights.push({
                                position: 'fixed', zIndex: 58, pointerEvents: 'none', opacity: 1,
                                top: `${secondaryRect.top - padding}px`, left: `${secondaryRect.left - padding}px`,
                                width: `${secondaryRect.width + padding * 2}px`, height: `${secondaryRect.height + padding * 2}px`,
                                transition: 'opacity 0.3s ease-in-out',
                            });
                        }
                    } else {
                        console.warn(`Tutorial: Could not find elements for selector "${currentStepData.highlight}"`);
                        setHighlightOverlayStyle(prevStyle => ({ ...prevStyle, opacity: 0 }));
                    }
                } else {
                    setHighlightOverlayStyle(prevStyle => ({ ...prevStyle, opacity: 0 }));
                }
                setSecondaryHighlightStyles(newSecondaryHighlights);

                // Update simulated badge position if star collected
                const playerHasStar = (mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.stars || 0) > 0;
                if (playerHasStar) {
                    const playerPos = mockGame.playerPositions[mockGame.playerIndex];
                    // Assuming 10 columns in the grid, and nth-child is 1-based
                    const playerCellSelector = `.inline-grid > div:nth-child(${playerPos.y * 10 + playerPos.x + 1})`;
                    const playerAvatarCell = document.querySelector(playerCellSelector) as HTMLElement | null;

                    if (playerAvatarCell) {
                        const playerCellRect = playerAvatarCell.getBoundingClientRect();
                        setSimulatedPlayerCellPosition({
                            position: 'fixed',
                            top: `${playerCellRect.top}px`,
                            left: `${playerCellRect.left}px`,
                            width: `${playerCellRect.width}px`,
                            height: `${playerCellRect.height}px`,
                            zIndex: 60,
                            pointerEvents: 'none',
                        });
                    } else {
                        setSimulatedPlayerCellPosition(null); // Hide if player cell not found
                    }
                } else {
                    setSimulatedPlayerCellPosition(null); // Hide if no star collected
                }

                // Initial Timer State and mockGame setup based on step
                const timerSectionElement = document.querySelector('.timer-section');
                const trafficLightIndicator = timerSectionElement?.querySelector('.traffic-light-indicator') as HTMLElement | null;
                const timerTextElement = timerSectionElement?.querySelector('.text-center > .text-4xl.font-bold') as HTMLElement | null;

                if (trafficLightIndicator) {
                    trafficLightIndicator.classList.remove('timer-red-active', 'timer-green-active');
                }

                const goTextAndFreezeSteps = ['movement-controls', 'action-buttons', 'try-movement', 'activate-beam', 'send-beam', 'try-unlocking', 'send-unlock-beam'];
                const greenLightVisualSteps = ['timer-green'];

                if (goTextAndFreezeSteps.includes(currentStepData.id)) {
                    setMockGame(prev => ({ ...prev, turnStartTime: Date.now() - 1100, isCurrentPlayer: true, isTutorialActionStep: true }));
                    if (trafficLightIndicator) trafficLightIndicator.classList.add('timer-green-active'); // Force green light
                } else if (greenLightVisualSteps.includes(currentStepData.id)) {
                    setMockGame(prev => ({ ...prev, turnStartTime: Date.now() - 1100, isCurrentPlayer: true, isTutorialActionStep: true }));
                    if (trafficLightIndicator) trafficLightIndicator.classList.add('timer-green-active');
                } else {
                    setMockGame(prev => ({ ...prev, turnStartTime: Date.now() - 15000, isCurrentPlayer: false, isTutorialActionStep: false }));
                    if (trafficLightIndicator) trafficLightIndicator.classList.add('timer-red-active');
                }

                const turnsCounterSpan = document.querySelector('.turns-remaining-section span');
                if (turnsCounterSpan) {
                    turnsCounterSpan.classList.remove('tutorial-text-red');
                    if (currentStepData.id === 'timer-red') {
                        turnsCounterSpan.classList.add('tutorial-text-red');
                    }
                }

                // Added to handle specific text change for star-badge step
                const turnsRemainingDiv = document.querySelector('.turns-remaining-section .text-4xl.font-bold');
                if (turnsRemainingDiv) {
                    if (currentStepData.id === 'star-badge') {
                        turnsRemainingDiv.innerHTML = '29';
                    } else if (currentStepData.id === 'lock-badge') {
                        turnsRemainingDiv.innerHTML = '28';
                    } else if (currentStepData.id === 'unlock-badge') {
                        turnsRemainingDiv.innerHTML = '27';
                    }
                }

                // Make action buttons unclickable during specific steps
                const lockButton = document.querySelector('.action-buttons button:first-child') as HTMLElement | null;
                const unlockButton = document.querySelector('.action-buttons button:last-child') as HTMLElement | null;

                if (lockButton && unlockButton) {
                    // Default state: enable both
                    lockButton.style.pointerEvents = 'auto';
                    lockButton.style.opacity = '1';
                    unlockButton.style.pointerEvents = 'auto';
                    unlockButton.style.opacity = '1';

                    if (currentStepData) {
                        if (currentStepData.id === 'try-movement') {
                            lockButton.style.pointerEvents = 'none';
                            lockButton.style.opacity = '0.5';
                            unlockButton.style.pointerEvents = 'none';
                            unlockButton.style.opacity = '0.5';
                        } else if (currentStepData.id === 'activate-beam') {
                            unlockButton.style.pointerEvents = 'none';
                            unlockButton.style.opacity = '0.5';
                            // Lock button remains enabled by default
                        } else if (currentStepData.id === 'try-unlocking') {
                            lockButton.style.pointerEvents = 'none';
                            lockButton.style.opacity = '0.5';
                            // Unlock button remains enabled by default
                        } else if (currentStepData.id === 'send-beam' || currentStepData.id === 'send-unlock-beam') {
                            lockButton.style.pointerEvents = 'none';
                            lockButton.style.opacity = '0.5';
                            unlockButton.style.pointerEvents = 'none';
                            unlockButton.style.opacity = '0.5';
                        }
                    }
                }

                // Make movement control buttons unclickable during specific beam-related steps
                const movementControlButtons = document.querySelectorAll('.movement-controls button') as NodeListOf<HTMLElement>;
                const beamActionSteps = ['activate-beam', 'send-beam', 'try-unlocking', 'send-unlock-beam'];
                const downArrowOnlySteps = ['send-beam', 'send-unlock-beam']; // Steps where only down arrow is active
                const tryMovementStep = 'try-movement'; // Added for clarity

                if (movementControlButtons.length > 0) {
                    movementControlButtons.forEach(button => {
                        let disableButton = false;
                        let enableButton = false;

                        if (currentStepData) {
                            if (currentStepData.id === tryMovementStep) {
                                // For try-movement step, only enable the right arrow, disable others
                                if (button.textContent?.trim() === '▶') {
                                    enableButton = true;
                                } else {
                                    disableButton = true;
                                }
                            } else if (downArrowOnlySteps.includes(currentStepData.id)) {
                                // For these steps, only enable the down arrow, disable others
                                if (button.textContent?.trim() === '▼') {
                                    enableButton = true;
                                } else {
                                    disableButton = true;
                                }
                                // Make all direction buttons solid red with white text during send-beam step
                                if (currentStepData.id === 'send-beam') {
                                    button.style.backgroundColor = '#ef4444'; // Tailwind red-500
                                    button.style.color = 'white';
                                }
                                // Make all direction buttons solid green with white text during send-unlock-beam step
                                else if (currentStepData.id === 'send-unlock-beam') {
                                    button.style.backgroundColor = '#22c55e'; // Tailwind green-500
                                    button.style.color = 'white';
                                }
                            } else if (beamActionSteps.includes(currentStepData.id)) {
                                // For other beam steps (activate-beam, try-unlocking), disable all movement
                                disableButton = true;
                            } else {
                                // For non-beam steps, enable all movement buttons
                                enableButton = true;
                            }
                        }

                        if (disableButton) {
                            button.style.pointerEvents = 'none';
                            button.style.opacity = '0.5';
                            // Reset any custom styling unless in send-beam or send-unlock-beam step
                            if (currentStepData?.id !== 'send-beam' && currentStepData?.id !== 'send-unlock-beam') {
                                button.style.backgroundColor = '';
                                button.style.color = '';
                            }
                        } else if (enableButton) {
                            button.style.pointerEvents = 'auto';
                            button.style.opacity = '1';
                            // Only reset styling if not in send-beam or send-unlock-beam step
                            if (currentStepData?.id !== 'send-beam' && currentStepData?.id !== 'send-unlock-beam') {
                                button.style.backgroundColor = '';
                                button.style.color = '';
                            }
                        } else {
                            // Default to enabled if no specific condition met, or if currentStepData is null
                            button.style.pointerEvents = 'auto';
                            button.style.opacity = '1';
                            // Reset any custom styling
                            if (currentStepData?.id !== 'send-beam' && currentStepData?.id !== 'send-unlock-beam') {
                                button.style.backgroundColor = '';
                                button.style.color = '';
                            }
                        }
                    });
                }

                setTimeout(() => setTooltipPosition(getTooltipPosition(targetElementForTooltip)), 50);
            } catch (error) {
                console.error('Tutorial highlighting error:', error);
                setHighlightOverlayStyle(prevStyle => ({ ...prevStyle, opacity: 0 }));
                setSecondaryHighlightStyles([]);
            }
        };
        const timer = setTimeout(applyHighlightingAndStepLogic, 100);
        return () => clearTimeout(timer);
    }, [currentStep]);

    // Continuous override for GO! text and green light for specific steps
    useEffect(() => {
        const goTextAndForceRefreshSteps = ['movement-controls', 'action-buttons', 'try-movement', 'activate-beam', 'send-beam', 'try-unlocking', 'send-unlock-beam'];
        let overrideInterval: NodeJS.Timeout | undefined = undefined;

        if (tutorialSteps[currentStep] && goTextAndForceRefreshSteps.includes(tutorialSteps[currentStep].id)) {
            overrideInterval = setInterval(() => {
                setMockGame(prev => ({
                    ...prev,
                    turnStartTime: Date.now() - 1100, // Keeps GameBoard timeLeft != 10, suppressing sound
                    isCurrentPlayer: true,
                    isTutorialActionStep: true // GameBoard uses this to show "GO!"
                }));

                // Ensure the visual green light is consistently applied for these steps
                const timerSectionElement = document.querySelector('.timer-section');
                const trafficLightIndicator = timerSectionElement?.querySelector('.traffic-light-indicator') as HTMLElement | null;
                if (trafficLightIndicator) {
                    trafficLightIndicator.classList.remove('timer-red-active'); // Remove red if present
                    trafficLightIndicator.classList.add('timer-green-active'); // Add green
                }
                // No need to set timerTextElement.textContent here, GameBoard handles it via isTutorialActionStep
            }, 200);
        }
        return () => {
            if (overrideInterval) {
                clearInterval(overrideInterval);
            }
        };
    }, [currentStep, setMockGame]);

    // Effect to handle advancing 'try-movement' step on specific user action
    useEffect(() => {
        const currentStepData = tutorialSteps[currentStep];
        if (!currentStepData || currentStepData.id !== 'try-movement' || !currentStepData.requiresUserActionToAdvance) {
            return; // Only run for try-movement step that requires action
        }

        const handleRightButtonAndStarCollection = (event: MouseEvent) => {
            const clickedElement = event.target as HTMLElement;
            const closestButton = clickedElement.closest('button');

            // Check if the clicked element is the correct button
            // 1. Is it a button?
            // 2. Is its text content "▶"?
            // 3. Is it inside the .movement-controls container?
            if (
                closestButton && // Check if closestButton is not null
                closestButton.tagName === 'BUTTON' &&
                closestButton.textContent?.trim() === '▶' &&
                closestButton.closest('.movement-controls')
            ) {
                // Assume player 0 starts at x:3, y:3 and star is at x:4, y:3
                const playerInitialX = 3;
                const playerInitialY = 3;
                const starX = 4;
                const starY = 3; // Grid index [3][4]

                // Check if player is in position to collect the star by moving right
                if (mockGame.playerPositions[0].x === playerInitialX && mockGame.playerPositions[0].y === playerInitialY) {
                    // Simulate game state update
                    setMockGame(prev => {
                        const newGrid = prev.grid.map(row => [...row]);
                        newGrid[starY][starX] = "";

                        const newStars = prev.stars.filter(star => !(star.x === starX && star.y === starY));

                        const newPlayerPositions = [...prev.playerPositions] as PlayerTutorialPosition[];
                        const currentPlayerPosition = newPlayerPositions[prev.playerIndex];

                        if (currentPlayerPosition) {
                            const currentActionCounts = currentPlayerPosition.actionCounts || { stars: 0, locks: 0, unlocks: 0 };
                            newPlayerPositions[prev.playerIndex] = {
                                ...currentPlayerPosition,
                                x: starX,
                                y: starY,
                                justCollectedStar: true,
                                actionCounts: {
                                    ...currentActionCounts,
                                    stars: (currentActionCounts.stars || 0) + 1,
                                }
                            };
                        }

                        // Update individual player score
                        const newPlayerScores = { ...prev.playerScores };
                        const collectingPlayerId = prev.team1[prev.playerIndex]; // User is on team1, at playerIndex
                        if (collectingPlayerId && newPlayerScores[collectingPlayerId] !== undefined) {
                            newPlayerScores[collectingPlayerId] = (newPlayerScores[collectingPlayerId] || 0) + 1;
                        }

                        return {
                            ...prev,
                            grid: newGrid,
                            stars: newStars,
                            playerPositions: newPlayerPositions,
                            playerScores: newPlayerScores, // Include updated individual scores
                            team1Score: prev.team1Score + 1, // Also update team score
                            lastAction: 'collectedStarInTutorial'
                        };
                    });

                    // Advance to the next tutorial step, then clear the flag after a brief moment
                    nextStep();

                    setTimeout(() => {
                        setMockGame(prev => {
                            const newPlayerPositions = [...prev.playerPositions] as PlayerTutorialPosition[];
                            const playerPosToUpdate = newPlayerPositions[prev.playerIndex];
                            if (playerPosToUpdate) {
                                const { justCollectedStar, ...restOfPlayerPos } = playerPosToUpdate;
                                newPlayerPositions[prev.playerIndex] = restOfPlayerPos; // actionCounts is preserved in restOfPlayerPos
                            }
                            return { ...prev, playerPositions: newPlayerPositions };
                        });
                    }, 500); // Clear flag after 500ms
                }
            }
        };

        document.addEventListener('click', handleRightButtonAndStarCollection, true); // Use capture phase

        return () => {
            document.removeEventListener('click', handleRightButtonAndStarCollection, true);
        };
    }, [currentStep, mockGame, nextStep, setMockGame]); // nextStep and setMockGame are now defined before this hook

    // Effect to handle locking action for 'activate-beam' and 'send-beam' steps
    useEffect(() => {
        const currentStepData = tutorialSteps[currentStep];
        if (!currentStepData ||
            !( // Conditions for lock steps
                (currentStepData.id === 'activate-beam') ||
                (currentStepData.id === 'send-beam' && isTutorialLockModePrimed) ||
                // Conditions for unlock steps
                (currentStepData.id === 'try-unlocking') ||
                (currentStepData.id === 'send-unlock-beam' && isTutorialUnlockModePrimed)
            ) ||
            !currentStepData.requiresUserActionToAdvance) {
            return;
        }

        const handleBeamInteraction = (event: MouseEvent) => {
            const clickedElement = event.target as HTMLElement;
            const closestButton = clickedElement.closest('button');

            if (currentStepData.id === 'activate-beam') {
                if (closestButton && closestButton.textContent?.toUpperCase().includes("LOCK") && closestButton.closest('.action-buttons')) {
                    setIsTutorialLockModePrimed(true);
                    event.stopPropagation();
                    nextStep();
                }
            } else if (currentStepData.id === 'send-beam' && isTutorialLockModePrimed) {
                if (closestButton && closestButton.textContent?.trim() === '▼' && closestButton.closest('.movement-controls')) {
                    const actingPlayerIndex = mockGame.playerIndex;
                    const targetPlayerToLockIndex = 3;
                    // ... (beam calculation for lock)
                    const beamOriginX = mockGame.playerPositions[actingPlayerIndex].x;
                    const beamOriginY = mockGame.playerPositions[actingPlayerIndex].y;
                    const beamDirection = 'down';
                    const newBeamCells: Array<{ x: number, y: number }> = [];
                    let currentX = beamOriginX; let currentY = beamOriginY;
                    for (let i = 0; i < 10; i++) {
                        if (beamDirection === 'down') currentY++;
                        if (currentX < 0 || currentX >= 10 || currentY < 0 || currentY >= 10) break;
                        newBeamCells.push({ x: currentX, y: currentY });
                        if (mockGame.playerPositions.find(p => p.x === currentX && p.y === currentY)) break;
                    }
                    setTutorialBeamCells(newBeamCells); setTutorialBeamType('lock'); setTutorialTargetedPlayerIndex(targetPlayerToLockIndex);
                    setTimeout(() => { setTutorialBeamCells(null); setTutorialBeamType(null); setTutorialTargetedPlayerIndex(null); }, 800);

                    setMockGame(prev => {
                        const newPlayerLocks = [...prev.playerLocks];
                        newPlayerLocks[targetPlayerToLockIndex] = { isLocked: true, turnsRemaining: 3 };
                        const newPlayerPositions = [...prev.playerPositions] as PlayerTutorialPosition[];
                        const actingPlayerGameObj = newPlayerPositions[actingPlayerIndex];
                        if (actingPlayerGameObj) {
                            const currentActionCounts = actingPlayerGameObj.actionCounts || { stars: 0, locks: 0, unlocks: 0 };
                            actingPlayerGameObj.actionCounts = { ...currentActionCounts, locks: (currentActionCounts.locks || 0) + 1 };
                        }
                        return { ...prev, playerLocks: newPlayerLocks, playerPositions: newPlayerPositions, lastAction: 'lockedPlayerInTutorial' };
                    });
                    setIsTutorialLockModePrimed(false);
                    nextStep();
                } else if (closestButton && (closestButton.closest('.movement-controls') || closestButton.closest('.action-buttons'))) {
                    event.stopPropagation();
                }
            } else if (currentStepData.id === 'try-unlocking') {
                if (closestButton && closestButton.textContent?.toUpperCase().includes("UNLOCK") && closestButton.closest('.action-buttons')) {
                    setIsTutorialUnlockModePrimed(true);
                    event.stopPropagation();
                    nextStep(); // Advance to send-unlock-beam
                }
            } else if (currentStepData.id === 'send-unlock-beam' && isTutorialUnlockModePrimed) {
                if (closestButton && closestButton.textContent?.trim() === '▼' && closestButton.closest('.movement-controls')) {
                    const actingPlayerIndex = mockGame.playerIndex;
                    const targetPlayerToUnlockIndex = 3; // Orange bot, previously locked

                    // Beam calculation for unlock (downwards)
                    const beamOriginX = mockGame.playerPositions[actingPlayerIndex].x;
                    const beamOriginY = mockGame.playerPositions[actingPlayerIndex].y;
                    const beamDirection = 'down';
                    const newBeamCells: Array<{ x: number, y: number }> = [];
                    let currentX = beamOriginX; let currentY = beamOriginY;
                    for (let i = 0; i < 10; i++) {
                        if (beamDirection === 'down') currentY++;
                        if (currentX < 0 || currentX >= 10 || currentY < 0 || currentY >= 10) break;
                        newBeamCells.push({ x: currentX, y: currentY });
                        if (mockGame.playerPositions.find(p => p.x === currentX && p.y === currentY)) break;
                    }
                    setTutorialBeamCells(newBeamCells); setTutorialBeamType('unlock'); setTutorialTargetedPlayerIndex(targetPlayerToUnlockIndex);
                    setTimeout(() => { setTutorialBeamCells(null); setTutorialBeamType(null); setTutorialTargetedPlayerIndex(null); }, 800);

                    setMockGame(prev => {
                        const newPlayerLocks = [...prev.playerLocks];
                        newPlayerLocks[targetPlayerToUnlockIndex] = { isLocked: false, turnsRemaining: 0 };
                        const newPlayerPositions = [...prev.playerPositions] as PlayerTutorialPosition[];
                        const actingPlayerGameObj = newPlayerPositions[actingPlayerIndex];
                        if (actingPlayerGameObj) {
                            const currentActionCounts = actingPlayerGameObj.actionCounts || { stars: 0, locks: 0, unlocks: 0 };
                            actingPlayerGameObj.actionCounts = { ...currentActionCounts, unlocks: (currentActionCounts.unlocks || 0) + 1 };
                        }
                        return { ...prev, playerLocks: newPlayerLocks, playerPositions: newPlayerPositions, lastAction: 'unlockedPlayerInTutorial' };
                    });
                    setIsTutorialUnlockModePrimed(false);
                    nextStep(); // Advance to unlock-badge
                } else if (closestButton && (closestButton.closest('.movement-controls') || closestButton.closest('.action-buttons'))) {
                    event.stopPropagation();
                }
            }
        };

        document.addEventListener('click', handleBeamInteraction, true);
        return () => {
            document.removeEventListener('click', handleBeamInteraction, true);
        };
    }, [currentStep, isTutorialLockModePrimed, isTutorialUnlockModePrimed, nextStep, setMockGame, mockGame.playerIndex]);

    // Effect to calculate styles for beam and target highlight overlays
    useEffect(() => {
        if (tutorialBeamCells && tutorialBeamType) {
            const newBeamCellStyles: React.CSSProperties[] = [];
            for (const cell of tutorialBeamCells) {
                const cellSelector = `.inline-grid > div:nth-child(${cell.y * 10 + cell.x + 1})`;
                const cellElement = document.querySelector(cellSelector) as HTMLElement | null;
                if (cellElement) {
                    const rect = cellElement.getBoundingClientRect();
                    newBeamCellStyles.push({
                        position: 'fixed',
                        top: `${rect.top}px`,
                        left: `${rect.left}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`,
                        backgroundColor: tutorialBeamType === 'lock' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.3)',
                        zIndex: 64, // Just above game elements, below simulated badges/tooltip
                        pointerEvents: 'none',
                        borderRadius: '4px', // Optional: match cell rounding
                        // Add animation/pulse later if needed via className or direct style
                    });
                }
            }
            setBeamCellOverlayStyles(newBeamCellStyles);
        } else {
            setBeamCellOverlayStyles([]);
        }

        if (tutorialTargetedPlayerIndex !== null && mockGame.playerPositions[tutorialTargetedPlayerIndex]) {
            const targetPos = mockGame.playerPositions[tutorialTargetedPlayerIndex];
            const targetCellSelector = `.inline-grid > div:nth-child(${targetPos.y * 10 + targetPos.x + 1})`;
            const targetCellElement = document.querySelector(targetCellSelector) as HTMLElement | null;
            if (targetCellElement) {
                const rect = targetCellElement.getBoundingClientRect();
                setTargetPlayerHighlightStyle({
                    position: 'fixed',
                    top: `${rect.top}px`,
                    left: `${rect.left}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    border: tutorialBeamType === 'lock' ? '3px solid red' : '3px solid green',
                    boxSizing: 'border-box',
                    zIndex: 65,
                    pointerEvents: 'none',
                    borderRadius: '4px',
                    // Add animation/pulse later
                });
            }
        } else {
            setTargetPlayerHighlightStyle(null);
        }
    }, [tutorialBeamCells, tutorialBeamType, tutorialTargetedPlayerIndex, mockGame.playerPositions]);

    // Calculate tooltip position based on highlighted element
    const getTooltipPosition = (highlightedElement: HTMLElement | null) => {
        const currentStepData = tutorialSteps[currentStep];
        if (!currentStepData) return {
            position: "fixed" as const,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 110,
            transition: "all 0.5s ease-in-out"
        };

        if (!highlightedElement) {
            return {
                position: "fixed" as const,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 110,
                transition: "all 0.5s ease-in-out"
            };
        }

        const rect = highlightedElement.getBoundingClientRect();
        const tooltipWidth = Math.min(320, windowSize.width * 0.8); // Responsive width
        const tooltipHeight = Math.min(180, windowSize.height * 0.3); // Responsive height
        const margin = Math.min(100, windowSize.width * 0.05); // Responsive margin

        let top = 0;
        let left = 0;

        const preferredPosition = currentStepData.position;
        const viewportWidth = windowSize.width;
        const viewportHeight = windowSize.height;

        // Calculate available space in each direction
        const spaceRight = viewportWidth - rect.right;
        const spaceLeft = rect.left;
        const spaceTop = rect.top;
        const spaceBottom = viewportHeight - rect.bottom;

        // Determine best position based on available space
        if (preferredPosition === "right" && spaceRight >= tooltipWidth + margin) {
            left = rect.right + margin;
            top = Math.max(margin, Math.min(viewportHeight - tooltipHeight - margin,
                rect.top + (rect.height - tooltipHeight) / 2));
        } else if (preferredPosition === "left" && spaceLeft >= tooltipWidth + margin) {
            left = rect.left - tooltipWidth - margin;
            top = Math.max(margin, Math.min(viewportHeight - tooltipHeight - margin,
                rect.top + (rect.height - tooltipHeight) / 2));
        } else if (preferredPosition === "top" && spaceTop >= tooltipHeight + margin) {
            top = rect.top - tooltipHeight - margin;
            left = Math.max(margin, Math.min(viewportWidth - tooltipWidth - margin,
                rect.left + (rect.width - tooltipWidth) / 2));
        } else if (preferredPosition === "bottom" && spaceBottom >= tooltipHeight + margin) {
            top = rect.bottom + margin;
            left = Math.max(margin, Math.min(viewportWidth - tooltipWidth - margin,
                rect.left + (rect.width - tooltipWidth) / 2));
        } else {
            // Fallback to best available position
            const positions = [
                { space: spaceRight, left: rect.right + margin, top: rect.top + (rect.height - tooltipHeight) / 2 },
                { space: spaceLeft, left: rect.left - tooltipWidth - margin, top: rect.top + (rect.height - tooltipHeight) / 2 },
                { space: spaceTop, left: rect.left + (rect.width - tooltipWidth) / 2, top: rect.top - tooltipHeight - margin },
                { space: spaceBottom, left: rect.left + (rect.width - tooltipWidth) / 2, top: rect.bottom + margin }
            ];

            const bestPosition = positions.reduce((best, current) =>
                current.space > best.space ? current : best
            );

            left = bestPosition.left;
            top = bestPosition.top;
        }

        // Ensure tooltip stays within viewport bounds
        top = Math.max(margin, Math.min(viewportHeight - tooltipHeight - margin, top));
        left = Math.max(margin, Math.min(viewportWidth - tooltipWidth - margin, left));

        return {
            position: "fixed" as const,
            top: `${top}px`,
            left: `${left}px`,
            zIndex: 110,
            transition: "all 0.5s ease-in-out"
        };
    };

    const handleMockLeaveGame = () => {
        // Do nothing in tutorial mode
    };

    const currentStepData = tutorialSteps[currentStep];
    if (!currentStepData) return null; // or some fallback UI if currentStep is invalid

    return (
        <div className="relative w-full min-h-screen">
            {/* Animated Highlight Overlay */}
            <div style={highlightOverlayStyle} className="animated-tutorial-highlight" />

            {/* Secondary Highlight Overlays */}
            {secondaryHighlightStyles.map((style, index) => (
                <div
                    key={`secondary-highlight-${index}`}
                    style={style}
                    className="animated-tutorial-highlight secondary-highlight"
                />
            ))}

            {/* Beam Visualization Overlays */}
            {beamCellOverlayStyles.map((style, index) => (
                <div key={`beam-cell-${index}`} style={style} className="tutorial-beam-cell-pulse" />
            ))}
            {targetPlayerHighlightStyle && (
                <div style={targetPlayerHighlightStyle} className="tutorial-target-player-flash" />
            )}

            {/* Simulated Star Badge - visible if player has stars and position is known */}
            {(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.stars || 0) > 0 && simulatedPlayerCellPosition && (
                <div style={simulatedPlayerCellPosition}>
                    {/* Badge JSX copied and adapted from GameBoard.tsx */}
                    <div className="absolute -top-5 -left-4 bg-white rounded-full p-0.5 shadow-sm border border-gray-200 z-10">
                        <div className="flex flex-row -space-x-2">
                            {(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.stars || 0) > 0 && (
                                <div className="relative bg-yellow-500 text-black text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                                    <span className="pr-1">{(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.stars || 0)}</span>
                                    <FontAwesomeIcon icon={faStar} className="absolute bottom-4 right-0.5 text-[13px] text-yellow-800" />
                                </div>
                            )}
                            {/* Render lock/unlock badges if needed, though for this step only star is expected */}
                            {(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.locks || 0) > 0 && (
                                <div className="relative bg-red-500 text-white text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                                    <span className="pr-1">{(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.locks || 0)}</span>
                                    <FontAwesomeIcon icon={faLock} className="absolute bottom-4 right-0.5 text-[13px] text-red-700" />
                                </div>
                            )}
                            {(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.unlocks || 0) > 0 && (
                                <div className="relative bg-green-500 text-white text-[13px] px-1.5 py-0.5 rounded-full font-bold shadow-sm min-w-[12px] min-h-[16px] flex items-center justify-center">
                                    <span className="pr-1">{(mockGame.playerPositions[mockGame.playerIndex]?.actionCounts?.unlocks || 0)}</span>
                                    <FontAwesomeIcon icon={faLockOpen} className="absolute bottom-4 right-0.5 text-[13px] text-green-800" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tutorial Overlay */}
            <div className="tutorial-overlay absolute inset-0 z-50 pointer-events-none">
                {/* Full screen overlay only for welcome message */}
                {currentStepData.id === "welcome" && (
                    <div className="absolute inset-0 bg-opacity-30 bg-white pointer-events-none"></div>
                )}
            </div>

            {/* Tutorial tooltip */}
            <div
                className="tutorial-tooltip pointer-events-auto"
                style={tooltipPosition}
            >
                <div className="bg-white rounded-lg shadow-2xl border-2 border-green-500 p-4 w-80 transition-all duration-500 ease-in-out">
                    {/* Content */}
                    <div
                        className="text-gray-700 mb-4 leading-relaxed text-md transition-all duration-500 ease-in-out"
                        dangerouslySetInnerHTML={{ __html: currentStepData.description }}
                        onClick={(e) => {
                            // Handle click on sound link
                            const target = e.target as HTMLElement;
                            if (target.style.cursor === 'pointer' && target.style.color === 'rgb(0, 102, 204)') {
                                try {
                                    const audio = new Audio('/bell.mp3');
                                    audio.volume = 0.5;
                                    audio.play().catch(error => {
                                        console.log("Could not play sound:", error);
                                    });
                                } catch (error) {
                                    console.log("Could not create audio element:", error);
                                }
                            }
                        }}
                    />

                    {/* Navigation */}
                    <div className="flex justify-between">
                        <button
                            onClick={prevStep}
                            disabled={currentStep === 0 || currentStep >= 16}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
                            Previous
                        </button>

                        {!currentStepData.requiresUserActionToAdvance && (
                            <button
                                onClick={nextStep}
                                className="flex items-center gap-1 bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                            >
                                {currentStep === tutorialSteps.length - 1 ? 'Start Playing!' : 'Next'}
                                <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Add CSS classes to GameBoard elements */}
            <div className="w-full min-h-screen">
                <style>{`
          /* Styles for the animated highlight overlay */
          .animated-tutorial-highlight {
            /* Visuals: border, shadow, pulse animation */
            border: 2px solid rgba(34, 197, 94, 0.8) !important; /* Similar to tutorial-focus border */
            box-shadow: 
              0 0 0 4px rgba(34, 197, 94, 0.8), /* Outer glow */
              0 0 0 8px rgba(34, 197, 94, 0.4), /* Softer outer glow */
              0 0 20px rgba(34, 197, 94, 0.6) !important; /* Wider diffuse glow */
            border-radius: 10px !important; /* Slightly more rounded than default 8px */
            animation: tutorial-pulse 2s ease-in-out infinite;
            /* Transitions for top, left, width, height, opacity are handled by inline style in JS */
          }

          /* Old .tutorial-highlight class - largely superseded by the animated overlay */
          .tutorial-highlight {
            /* Most styles removed. Could be used for specific non-animated fallback if needed. */
          }
          
          /* Custom class to make text red for the timer-red step */
          .tutorial-text-red {
            color: red !important;
          }

          /* Custom classes for timer states in tutorial */
          .timer-red-active {
            background-color: red !important;
            /* Add any other styles for the red light, e.g., box-shadow */
          }
          .timer-green-active {
            background-color: #38a169 !important; /* Tailwind green-600 */
            /* Add any other styles for the green light */
          }

          @keyframes tutorial-pulse {
            0%, 100% { 
              box-shadow: 
                0 0 0 4px rgba(34, 197, 94, 0.8), 
                0 0 0 8px rgba(34, 197, 94, 0.4),
                0 0 20px rgba(34, 197, 94, 0.6);
              border-color: rgba(34, 197, 94, 0.8);
            }
            50% { 
              box-shadow: 
                0 0 0 6px rgba(34, 197, 94, 1),    /* Slightly stronger pulse */
                0 0 0 12px rgba(34, 197, 94, 0.6),
                0 0 25px rgba(34, 197, 94, 0.8);
              border-color: rgba(34, 197, 94, 1);
            }
          }
          
          /* Specific element targeting - ensure these don't conflict */
          .game-grid-section .inline-grid {
            position: relative;
          }
          
          .stars-on-grid {
            position: relative;
          }
          
          .locked-player {
            position: relative;
          }
        
          
          /* Special styles for tutorial mode */
          .tutorial-mode .game-board {
            pointer-events: auto;
          }
          
          .tutorial-mode .movement-controls button {
            pointer-events: auto;
          }
          
          .tutorial-mode .action-buttons button {
            pointer-events: auto;
          }
          
          /* Ensure tutorial overlay always stays on top */
          .tutorial-overlay {
            z-index: 100 !important;
          }
          
          .tutorial-tooltip {
            z-index: 110 !important;
          }
          
          /* Make sure highlighted elements don't block interactions */
          .tutorial-highlight * {
            pointer-events: auto !important;
          }

          /* Custom classes for tutorial beam and target effects */
          .tutorial-beam-cell-pulse {
            /* Similar to GameBoard's beam-effect but adapted for tutorial */
            animation: tutorial-beam-pulse 0.5s ease-in-out infinite;
            /* backgroundColor is set via inline style */
          }

          .tutorial-target-player-flash {
            /* Similar to GameBoard's target-highlight but adapted for tutorial */
            animation: tutorial-target-flash 0.4s ease-in-out 2; 
            /* border is set via inline style */
          }

          @keyframes tutorial-beam-pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 0.9; transform: scale(1.05); }
          }

          @keyframes tutorial-target-flash {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); transform: scale(1); }
            25% { box-shadow: 0 0 0 7px rgba(255, 0, 0, 0.4); transform: scale(1.1); }
            50% { box-shadow: 0 0 0 4px rgba(255, 255, 0, 0.6); transform: scale(1.05); }
            75% { box-shadow: 0 0 0 7px rgba(255, 0, 0, 0.4); transform: scale(1.1); }
          }

          /* Add smooth transitions for tooltip */
          .tutorial-tooltip {
            transition: all 0.5s ease-in-out !important;
          }
          
          .tutorial-tooltip > div {
            transition: all 0.5s ease-in-out !important;
          }
          
          .tutorial-tooltip .text-gray-700 {
            transition: all 0.5s ease-in-out !important;
          }
          
          /* Ensure transitions work with transform */
          .tutorial-tooltip * {
            transform-origin: center center;
            will-change: transform, opacity;
          }

          /* Add responsive styles */
          @media (max-width: 640px) {
            .tutorial-tooltip {
                width: 90vw !important;
                max-width: 320px;
            }
            
            .tutorial-tooltip > div {
                padding: 0.75rem !important;
            }
          }
          
          /* Ensure smooth transitions during resize */
          .tutorial-tooltip,
          .tutorial-tooltip > div,
          .tutorial-tooltip .text-gray-700,
          .animated-tutorial-highlight {
            will-change: transform, opacity, width, height, top, left;
          }

          /* Add specific styles for secondary highlights */
          .secondary-highlight {
            border-color: rgba(34, 197, 94, 0.6) !important;
            box-shadow: 
                0 0 0 4px rgba(34, 197, 94, 0.6),
                0 0 0 8px rgba(34, 197, 94, 0.3),
                0 0 20px rgba(34, 197, 94, 0.4) !important;
          }

          /* Ensure smooth transitions for all highlights */
          .animated-tutorial-highlight,
          .secondary-highlight {
            will-change: transform, opacity, width, height, top, left;
            transform-origin: center center;
          }

          /* Add responsive styles for highlights */
          @media (max-width: 640px) {
            .animated-tutorial-highlight,
            .secondary-highlight {
                border-width: 1px !important;
                box-shadow: 
                    0 0 0 2px rgba(34, 197, 94, 0.6),
                    0 0 0 4px rgba(34, 197, 94, 0.3),
                    0 0 10px rgba(34, 197, 94, 0.4) !important;
            }
          }
        `}</style>

                <div className="tutorial-mode min-h-screen">
                    <GameBoard game={mockGame} onLeaveGame={handleMockLeaveGame} />
                </div>
            </div>
        </div>
    );
} 