import React, { useState, useCallback, useMemo } from "react";
import MatrixComponent from "../components/MatrixComponent";
import { Id } from "../../convex/_generated/dataModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faRobot, faStar, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { useQuery, useMutation } from "convex/react";
import { api, internal } from "../../convex/_generated/api";

// Global constants
const WAITING_THRESHOLD = 20 * 1000; // seconds
const MIN_TIME_BETWEEN_SUBMISSIONS = 4 * 1000; // 4 seconds
export const EXIT_URL = "https://app.prolific.com/submissions/complete?cc=C1AAD9S0";

// Define props for form components that include the navigation callback
interface FormComponentProps {
    onNextClicked: () => void;
    gameId?: Id<"games">; // Add gameId to get real data
    gameResults?: {
        isPlayerWinner: boolean;
        playerTeam: number;
        winnerTeam: number;
        achievements: Record<number, { stars: number; locks: number; unlocks: number }>;
    };
    gameActions?: any[]; // Add gameActions to calculate interactions
    game?: any; // Add game data for calculating interactions
}

interface FormPageTestProps {
    gameId?: Id<"games">; // Make gameId optional for testing
}

export default function FormPageTest({ gameId }: FormPageTestProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [isWinner, setIsWinner] = useState(true); // This should come from game state/props
    const [isProgressLoaded, setIsProgressLoaded] = useState(false);
    const [hasMarkedExperimentFinished, setHasMarkedExperimentFinished] = useState(false);
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";



    // Fetch real game data if gameId is provided
    const game = useQuery(api.game.getGame, gameId ? { gameId } : "skip");
    const gameActions = useQuery(api.game.getGameActions, gameId ? { gameId } : "skip");

    // Form progress tracking
    const formProgress = useQuery(api.game.getFormProgress, gameId ? { gameId } : "skip");
    const initializeFormProgress = useMutation(api.game.initializeFormProgress);
    const updateFormProgress = useMutation(api.game.updateFormProgress);
    const updateGameStatus = useMutation(api.game.updateGameStatus);
    const markSurveyCompleted = useMutation(api.game.markSurveyCompleted);

    // Define the ordered list of step names for the form flow
    const stepNames = [
        "team-reward-distribution",
        "other-team-distribution",
        "overall-performance",
        "competitiveness",
        "collaboration",
        "harm-intention",
        "waiting",
        "results",
    ];

    // Initialize form progress and load current step
    React.useEffect(() => {
        const initializeProgress = async () => {
            if (!gameId) {
                setIsProgressLoaded(true);
                return;
            }

            try {
                // Initialize progress if it doesn't exist
                await initializeFormProgress({ gameId });
            } catch (error) {
                console.error("Failed to initialize form progress:", error);
            }
        };

        initializeProgress();
    }, [gameId, initializeFormProgress]);

    // Load current step from progress when available
    React.useEffect(() => {
        if (formProgress !== undefined) {
            if (formProgress === null) {
                // No progress yet, start from step 0
                setCurrentStep(0);
            } else {
                // Load the saved current step
                setCurrentStep(formProgress.currentStep);
            }
            setIsProgressLoaded(true);
        }
    }, [formProgress]);

    // Check if we should show the Survey Complete page and update game status
    React.useEffect(() => {
        // Only proceed if we have the necessary data and haven't already marked as finished
        if (!gameId || !isProgressLoaded || hasMarkedExperimentFinished) {
            return;
        }

        // Use stepNames.length instead of hardcoded 8
        const isFormComplete = currentStep >= stepNames.length;

        if (isFormComplete) {
            // Mark that this individual player has completed everything, but don't change game status yet
            const markIndividualCompletion = async () => {
                try {
                    await markSurveyCompleted({
                        gameId,
                        completionType: "all-surveys-completed"
                    });
                    setHasMarkedExperimentFinished(true);
                    console.log("Individual player marked as survey complete");
                } catch (error) {
                    console.error("Failed to mark individual completion:", error);
                }
            };

            markIndividualCompletion();
        }
    }, [gameId, currentStep, isProgressLoaded, hasMarkedExperimentFinished, markSurveyCompleted, stepNames.length]);

    // Check if all players have completed surveys and update game status
    const allPlayersCompletionStatus = useQuery(
        api.game.checkSurveyCompletion,
        gameId ? {
            gameId,
            completionType: "all-surveys-completed"
        } : "skip"
    );

    React.useEffect(() => {
        // Use stepNames.length instead of hardcoded 8
        if (allPlayersCompletionStatus?.allCompleted && gameId && currentStep >= stepNames.length) {
            // All players have completed their surveys, now update game status
            const updateToExperimentFinished = async () => {
                try {
                    await updateGameStatus({
                        gameId,
                        status: "experiment_finished"
                    });
                    console.log("Game status updated to experiment_finished - all players completed");
                } catch (error) {
                    console.error("Failed to update game status to experiment_finished:", error);
                }
            };

            updateToExperimentFinished();
        }
    }, [allPlayersCompletionStatus?.allCompleted, gameId, currentStep, updateGameStatus, stepNames.length]);

    const handleNextStep = async () => {
        const newStep = currentStep + 1;
        setCurrentStep(newStep);

        // Update progress in database if gameId is available
        if (gameId && isProgressLoaded) {
            try {
                // Use stepNames array for step mapping
                const stepName = stepNames[currentStep];
                if (stepName) {
                    await updateFormProgress({
                        gameId,
                        stepCompleted: stepName as any,
                        newCurrentStep: newStep,
                    });
                }
            } catch (error) {
                console.error("Failed to update form progress:", error);
                // Don't block the user if progress saving fails
            }
        }
    };

    // Don't render until progress is loaded
    if (!isProgressLoaded) {
        return (
            <div className="max-w-4xl mx-auto my-10 bg-white rounded-xl p-8 shadow-lg font-sans text-center">
                <div className="text-lg text-gray-600">Loading...</div>
            </div>
        );
    }

    // Calculate real winner/loser status and achievements from game data
    const getGameResults = () => {
        if (!game || !gameActions) {
            // Use mock data for testing when no game data available
            return {
                isPlayerWinner: true,
                playerTeam: 2, // Change to team 2 to test player 2 getting the red triangle
                winnerTeam: 2,
                achievements: {
                    0: { stars: 7, locks: 2, unlocks: 1 }, // Player 1
                    1: { stars: 4, locks: 1, unlocks: 3 }, // Bot teammate  
                    2: { stars: 3, locks: 3, unlocks: 0 }, // Player 3 (this should get the red triangle)
                    3: { stars: 2, locks: 0, unlocks: 2 }, // Bot opponent
                }
            };
        }

        // Calculate total scores across all rounds
        const totalScores = game.roundScores?.reduce(
            (acc, round) => ({
                team1: acc.team1 + round.team1,
                team2: acc.team2 + round.team2
            }),
            { team1: 0, team2: 0 }
        ) || { team1: 0, team2: 0 };

        const winnerTeam = totalScores.team1 > totalScores.team2 ? 1 :
            totalScores.team2 > totalScores.team1 ? 2 : 0; // 0 for tie

        const playerTeam = game.teamNumber || 1;
        const isPlayerWinner = winnerTeam === playerTeam;

        // Calculate achievements for each player from game actions
        const achievements: Record<number, { stars: number; locks: number; unlocks: number }> = {
            0: { stars: 0, locks: 0, unlocks: 0 },
            1: { stars: 0, locks: 0, unlocks: 0 },
            2: { stars: 0, locks: 0, unlocks: 0 },
            3: { stars: 0, locks: 0, unlocks: 0 },
        };

        const allPlayers = [...game.team1, ...game.team2];

        gameActions.forEach(action => {
            const playerIndex = allPlayers.indexOf(action.playerId);
            if (playerIndex !== -1 && achievements[playerIndex]) {
                if (action.action === "move" && (action.result === "harvested" || action.result === "harvested_overtime_win")) {
                    achievements[playerIndex].stars++;
                } else if (action.action === "lock" && action.result === "locked") {
                    achievements[playerIndex].locks++;
                } else if (action.action === "unlock" && action.result === "unlocked") {
                    achievements[playerIndex].unlocks++;
                }
            }
        });

        return {
            isPlayerWinner,
            playerTeam,
            winnerTeam,
            achievements
        };
    };

    const gameResults = getGameResults();
    const currentPlayerIndex = getCurrentPlayerIndex(gameResults);

    // Define winner flow pages
    const winnerPages = [
        (props: FormComponentProps) => <ExtraRewardPage {...props} isWinner={true} isTeamReward={true} gameResults={gameResults} gameActions={gameActions} game={game} gameId={gameId} />, // Winner distributes to own team (20 points)
        (props: FormComponentProps) => <ExtraRewardPage {...props} isWinner={true} isTeamReward={false} gameResults={gameResults} gameActions={gameActions} game={game} gameId={gameId} />, // Winner distributes to other team (10 points)
        (props: FormComponentProps) => <OverallPerformancePage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <CompetitivenessPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <CollaborationPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <HarmIntentionPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <WaitingPage {...props} gameId={gameId} gameResults={gameResults} />, // New waiting page
        (props: FormComponentProps) => <GameResultsPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} gameId={gameId} />, // New results page
        // (props: FormComponentProps) => <DemographicsPage {...props} gameId={gameId} />, // Demographics page
    ];

    // Define loser flow pages
    const loserPages = [
        (props: FormComponentProps) => <ExtraRewardPage {...props} isWinner={false} isTeamReward={false} gameResults={gameResults} gameActions={gameActions} game={game} gameId={gameId} />, // Loser scenario - "You lost :(" (giving to winners)
        (props: FormComponentProps) => <ExtraRewardPage {...props} isWinner={false} isTeamReward={true} gameResults={gameResults} gameActions={gameActions} game={game} gameId={gameId} />, // Loser but gets reward (giving to own team)
        (props: FormComponentProps) => <OverallPerformancePage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <CompetitivenessPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <CollaborationPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <HarmIntentionPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} />,
        (props: FormComponentProps) => <WaitingPage {...props} gameId={gameId} gameResults={gameResults} />, // New waiting page
        (props: FormComponentProps) => <GameResultsPage {...props} gameResults={gameResults} gameActions={gameActions} game={game} gameId={gameId} />, // New results page
        // (props: FormComponentProps) => <DemographicsPage {...props} gameId={gameId} />, // Demographics page
    ];

    // Choose the appropriate page flow based on winner/loser status
    const formPages = gameResults.isPlayerWinner ? winnerPages : loserPages;

    const CurrentFormComponent = formPages[currentStep];

    return (
        <div>
            {CurrentFormComponent ? (
                <CurrentFormComponent onNextClicked={handleNextStep} gameId={gameId} />
            ) : (
                <div className="max-w-4xl mx-auto my-10 bg-white rounded-xl p-8 shadow-lg font-sans text-center">
                    <ThankYouCompletePage />
                </div>
            )}
        </div>
    );
}

// Add new ThankYouCompletePage component with auto-redirect
const ThankYouCompletePage: React.FC = () => {
    const [countdown, setCountdown] = React.useState(5);

    React.useEffect(() => {
        // Countdown timer
        const countdownInterval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownInterval);
                    // Redirect to Prolific completion page
                    window.location.href = EXIT_URL;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, []);

    return (
        <>
            <div className="mb-8">
                <div className="text-6xl mb-4">🎉</div>
                <h1 className="text-4xl font-bold text-gray-800 mb-4">Survey Complete!</h1>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6 mb-8">
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Thank you for completing the experiment!</h2>
                <div className="text-center space-y-3 max-w-2xl mx-auto">
                    <h3 className="text-xl font-semibold text-blue-800 mb-2">Automatic Redirect</h3>
                    <p className="text-blue-700 mb-3">
                        You will be automatically redirected to Prolific to complete your submission in:
                    </p>
                    <div className="text-3xl font-bold text-blue-600 mb-3">
                        {countdown} second{countdown !== 1 ? 's' : ''}
                    </div>
                    <p className="text-sm text-blue-600">
                        If the redirect doesn't work, you can manually visit the completion page.
                    </p>
                </div>
                {/* Manual redirect button as backup */}
                <div className="text-center mt-4">
                    <a
                        href={EXIT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-lg shadow-lg transition-colors duration-200"
                    >
                        Complete Study on Prolific
                    </a>
                </div>
            </div>

        </>
    );
};

// Simplified version of getPlayerSymbol for use in forms (without game context)
const getPlayerSymbol = (
    playerIndex: number,
    isLocked: boolean = false,
    size: "small" | "medium" | "large" = "large",
    isCurrentPlayer: boolean = false,
    achievements?: { stars: number; locks: number; unlocks: number },
    dbBotCondition: "aware" | "unaware" = "aware"
) => {
    // Players 0 and 2 are users, players 1 and 3 are bots
    const isBot = playerIndex === 1 || playerIndex === 3;
    const isTeam1 = playerIndex === 0 || playerIndex === 1;

    // Use purple/orange colors like in the real game (not tutorial)
    const iconColor = isTeam1 ? "text-purple-500" : "text-orange-500";
    const borderColor = isTeam1 ? "border-purple-500" : "border-orange-500";

    // Different sizes
    const sizeClasses = {
        small: "w-8 h-8",
        medium: "w-12 h-12",
        large: "w-16 h-16"
    };

    const iconSizeClassesAware = {
        small: "text-sm",
        medium: "text-base",
        large: "text-xl"
    };

    const iconSizeClassesUnaware = {
        small: "text-xl",
        medium: "text-2xl",
        large: "text-4xl"
    };

    // Badge size adjustments based on icon size
    const badgeSizeClasses = {
        small: {
            badgeText: "text-[10px]",
            badgePadding: "px-1 py-0.3",
            badgeMinSize: "min-w-[8px] min-h-[12px]",
            iconSize: "text-[8px]"
        },
        medium: {
            badgeText: "text-[11px]",
            badgePadding: "px-1.5 py-0.5",
            badgeMinSize: "min-w-[10px] min-h-[14px]",
            iconSize: "text-[10px]"
        },
        large: {
            badgeText: "text-[13px]",
            badgePadding: "px-1.5 py-0.5",
            badgeMinSize: "min-w-[12px] min-h-[16px]",
            iconSize: "text-[13px]"
        }
    };

    // Team 1 gets circles, Team 2 gets squares
    const containerClasses = `${sizeClasses[size]} bg-white border-4 ${isLocked ? "locked-player" : borderColor} ${isTeam1 ? "rounded-full" : ""} flex items-center justify-center shadow-sm`;

    // Icon classes
    const iconColorClass = isLocked ? "locked-icon" : iconColor;
    const iconClass = `${dbBotCondition === "unaware" ? iconSizeClassesUnaware[size] : iconSizeClassesAware[size]} ${iconColorClass}`;
    const suitSymbols = ["♠", "♥", "♣", "♦"];
    return (
        <div className={`${sizeClasses[size]} relative`}>
            {dbBotCondition === "aware" && (
                <div className={isLocked ? "locked-player" : containerClasses}>
                    <div className="w-full h-full flex items-center justify-center">
                        <FontAwesomeIcon icon={isBot ? faRobot : faUser} className={iconClass} />
                    </div>
                </div>
            )}
            {dbBotCondition === "unaware" && (
                <div className={containerClasses}>
                    <div className="w-full h-full flex items-center justify-center">
                        <span className={iconClass}>{suitSymbols[playerIndex]}</span>
                    </div>
                </div>
            )}

            {/* Achievement badges */}
            {achievements && (achievements.stars > 0 || achievements.locks > 0 || achievements.unlocks > 0) && (
                <div className="absolute top-0 left-0 transform -translate-x-1/2 -translate-y-3.5 bg-white rounded-full p-0.5 shadow-sm border border-gray-200 z-10">
                    <div className="flex flex-row -space-x-1">
                        {achievements.stars > 0 && (
                            <div className={`relative bg-yellow-300 text-black ${badgeSizeClasses[size].badgeText} ${badgeSizeClasses[size].badgePadding} rounded-full font-bold shadow-sm ${badgeSizeClasses[size].badgeMinSize} flex items-center justify-center`}>
                                <span className="pr-0.5">{achievements.stars}</span>
                                <FontAwesomeIcon icon={faStar} className={`absolute -top-1 -right-0.5 ${badgeSizeClasses[size].iconSize} text-yellow-800`} />
                            </div>
                        )}
                        {achievements.locks > 0 && (
                            <div className={`relative bg-red-500 text-white ${badgeSizeClasses[size].badgeText} ${badgeSizeClasses[size].badgePadding} rounded-full font-bold shadow-sm ${badgeSizeClasses[size].badgeMinSize} flex items-center justify-center`}>
                                <span className="pr-0.5">{achievements.locks}</span>
                                <FontAwesomeIcon icon={faLock} className={`absolute -top-1 -right-0.5 ${badgeSizeClasses[size].iconSize} text-red-700`} />
                            </div>
                        )}
                        {achievements.unlocks > 0 && (
                            <div className={`relative bg-green-500 text-white ${badgeSizeClasses[size].badgeText} ${badgeSizeClasses[size].badgePadding} rounded-full font-bold shadow-sm ${badgeSizeClasses[size].badgeMinSize} flex items-center justify-center`}>
                                <span className="pr-0.5">{achievements.unlocks}</span>
                                <FontAwesomeIcon icon={faLockOpen} className={`absolute -top-1 -right-0.5 ${badgeSizeClasses[size].iconSize} text-green-800`} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Red triangle indicator for current player - positioned in a flex column */}
            {isCurrentPlayer && (
                <div className="text-red-500 text-lg font-bold animate-bounce">
                    ▲
                </div>
            )}
        </div>
    );
};

// Helper function to determine current player based on game results
const getCurrentPlayerIndex = (gameResults?: { playerTeam: number }) => {
    if (!gameResults) return 0; // Default fallback

    // If player is on team 1, they are player 0 (users are players 0 and 2)
    // If player is on team 2, they are player 2
    return gameResults.playerTeam === 1 ? 0 : 2;
};

// --- Reusable Player Input Card ---
interface PlayerInputCardProps {
    playerIndex: number; // 0,1,2,3 for actual player indexing
    points: number;
    onPointsChange: (points: number) => void;
    isWinningPlayer?: boolean; // To show the star icon
    achievements?: { stars: number; locks: number; unlocks: number }; // Achievement data
    maxPoints?: number; // Maximum value for the slider
    interactions?: {
        lockedPlayers: { playerIndex: number; count: number }[];
        unlockedPlayers: { playerIndex: number; count: number }[];
    }; // Lock/unlock interactions
    gameResults?: {
        isPlayerWinner: boolean;
        playerTeam: number;
        winnerTeam: number;
        achievements: Record<number, { stars: number; locks: number; unlocks: number }>;
    }; // Add gameResults to determine current player with achievements
    dbBotCondition?: "aware" | "unaware"; // Add dbBotCondition prop
}

const PlayerInputCard: React.FC<PlayerInputCardProps> = ({
    playerIndex,
    points,
    onPointsChange,
    isWinningPlayer,
    achievements = { stars: 0, locks: 0, unlocks: 0 }, // Default to no achievements
    maxPoints = 20, // Default max points
    interactions = { lockedPlayers: [], unlockedPlayers: [] }, // Default to no interactions
    gameResults,
    dbBotCondition = "aware" // Add default value
}) => {
    const currentPlayerIndex = getCurrentPlayerIndex(gameResults);

    // Players 0 and 2 are users, players 1 and 3 are bots
    const isBot = playerIndex === 1 || playerIndex === 3;
    const isTeam1 = playerIndex === 0 || playerIndex === 1;
    const isCurrentPlayer = playerIndex === currentPlayerIndex; // Use the calculated current player

    // Use purple/orange colors like in the real game
    const iconColor = isTeam1 ? "text-purple-500" : "text-orange-500";
    const borderColor = isTeam1 ? "border-purple-500" : "border-orange-500";

    // Team 1 gets circles, Team 2 gets squares
    const containerClasses = `w-16 h-16 bg-white border-4 ${borderColor} ${isTeam1 ? "rounded-full" : ""} flex items-center justify-center shadow-sm`;

    return (
        <div className="border border-gray-200 rounded-lg p-5 w-80 text-center shadow-md flex flex-col pb-8 bg-white">
            {/* Player Icon Section - Fixed height */}
            <div className="h-13 flex items-center justify-center mb-4">
                {getPlayerSymbol(playerIndex, false, "large", isCurrentPlayer, achievements, dbBotCondition)}
            </div>

            {/* Player Interactions */}
            <div className="mb-4 lg:mb-6 flex-1">
                {/* Stars Collected Section */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 lg:p-3 mb-2 lg:mb-3 min-h-[4rem] lg:min-h-10 flex flex-col">
                    <div className="text-lg font-medium text-yellow-600 mb-4 lg:mb-4 flex items-center justify-center gap-1">
                        <span>Harvested {achievements.stars} star{achievements.stars > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        {achievements.stars > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                                {Array.from({ length: Math.min(achievements.stars, 10) }).map((_, index) => (
                                    <FontAwesomeIcon
                                        key={index}
                                        icon={faStar}
                                        className="text-yellow-500 text-sm"
                                    />
                                ))}
                                {achievements.stars > 10 && (
                                    <span className="text-xs text-yellow-600 font-medium ml-1">
                                        +{achievements.stars - 10} more
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-xs text-yellow-600"> </span>
                        )}
                    </div>
                </div>

                {/* Locked Players Section */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 lg:p-3 mb-2 lg:mb-3 min-h-[4rem] lg:min-h-10 flex flex-col">
                    <div className="text-lg font-medium text-red-600 mb-4 lg:mb-4 flex items-center justify-center gap-1">
                        <FontAwesomeIcon icon={faLock} />
                        {interactions.lockedPlayers.length > 0 ? (
                            <span>Locked {interactions.lockedPlayers.reduce((total, player) => total + player.count, 0)} time{interactions.lockedPlayers.reduce((total, player) => total + player.count, 0) > 1 ? 's' : ''}</span>
                        ) : (
                            <span>Never locked anyone</span>
                        )}
                    </div>
                    <div className="flex-1 flex items-center justify-center pt-2">
                        {interactions.lockedPlayers.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1 lg:gap-2">
                                {interactions.lockedPlayers.map(({ playerIndex: targetIndex, count }) => {
                                    return (
                                        <div key={targetIndex} className="flex items-center gap-1.5 rounded-md px-2 py-1">
                                            <div className="flex-shrink-0">
                                                {getPlayerSymbol(targetIndex, false, "small", targetIndex === currentPlayerIndex, gameResults?.achievements?.[targetIndex], dbBotCondition)}
                                            </div>
                                            <div className="text-sm font-medium text-red-700">
                                                {count}x
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Unlocked Players Section */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 lg:p-3 min-h-[4rem] lg:min-h-10 flex flex-col">
                    <div className="text-lg font-medium text-green-600 mb-4 lg:mb-4 flex items-center justify-center gap-1">
                        <FontAwesomeIcon icon={faLockOpen} />
                        {interactions.unlockedPlayers.length > 0 ? (
                            <span>Unlocked {interactions.unlockedPlayers.reduce((total, player) => total + player.count, 0)} time{interactions.unlockedPlayers.reduce((total, player) => total + player.count, 0) > 1 ? 's' : ''}</span>
                        ) : (
                            <span>Never unlocked anyone</span>
                        )}
                    </div>
                    <div className="flex-1 flex items-center justify-center pt-2">
                        {interactions.unlockedPlayers.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1 lg:gap-2">
                                {interactions.unlockedPlayers.map(({ playerIndex: targetIndex, count }) => {
                                    return (
                                        <div key={targetIndex} className="flex items-center gap-1.5 rounded-md px-2 py-1">
                                            <div className="flex-shrink-0">
                                                {getPlayerSymbol(targetIndex, false, "small", targetIndex === currentPlayerIndex, gameResults?.achievements?.[targetIndex], dbBotCondition)}
                                            </div>
                                            <div className="text-sm font-medium text-green-700">
                                                {count}x
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Points Display and Slider */}
            <div className="mt-auto">
                <div className="text-lg font-semibold mb-2 text-gray-700">{points}</div>

                {/* Slider Input */}
                <input
                    type="range"
                    min="0"
                    max={maxPoints}
                    value={points}
                    onChange={(e) => {
                        const newPoints = parseInt(e.target.value, 10);
                        onPointsChange(newPoints);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                        background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(points / maxPoints) * 100}%, #E5E7EB ${(points / maxPoints) * 100}%, #E5E7EB 100%)`
                    }}
                />

                {/* Min/Max labels */}
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>0</span>
                    <span>{maxPoints}</span>
                </div>
            </div>
        </div>
    );
};

// --- Reusable Player Display Card for Survey Pages ---
interface PlayerDisplayCardProps {
    playerIndex: number; // 0,1,2,3 for actual player indexing
    isWinningPlayer?: boolean; // To show the star icon
    achievements?: { stars: number; locks: number; unlocks: number }; // Achievement data
    interactions?: {
        lockedPlayers: { playerIndex: number; count: number }[];
        unlockedPlayers: { playerIndex: number; count: number }[];
    }; // Lock/unlock interactions
    gameActions?: any[]; // Add gameActions to calculate interactions
    game?: any; // Add game data for calculating interactions
    gameResults?: {
        isPlayerWinner: boolean;
        playerTeam: number;
        winnerTeam: number;
        achievements: Record<number, { stars: number; locks: number; unlocks: number }>;
    }; // Add gameResults to determine current player with achievements
    dbBotCondition?: "aware" | "unaware"; // Add dbBotCondition prop
}

const PlayerDisplayCard: React.FC<PlayerDisplayCardProps> = ({
    playerIndex,
    isWinningPlayer,
    achievements = { stars: 0, locks: 0, unlocks: 0 }, // Default to no achievements
    interactions = { lockedPlayers: [], unlockedPlayers: [] }, // Default to no interactions
    gameActions,
    game,
    gameResults,
    dbBotCondition = "aware" // Add default value
}) => {
    const currentPlayerIndex = getCurrentPlayerIndex(gameResults);

    // Calculate player interactions from game actions
    const calculatePlayerInteractions = useCallback((forPlayerIndex: number) => {
        if (!gameActions || !game) {
            return { lockedPlayers: [], unlockedPlayers: [] };
        }

        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[forPlayerIndex];

        if (!playerId) {
            return { lockedPlayers: [], unlockedPlayers: [] };
        }

        // Find players locked by this player
        const lockActions = gameActions.filter(action => {
            return action.playerId === playerId &&
                action.action === "lock" &&
                action.result === "locked";
        });

        const lockedPlayers = lockActions
            .map(action => {
                const targetPlayerIndex = action.targetPlayer;
                return { playerIndex: targetPlayerIndex, count: 1 };
            })
            .reduce((acc, curr) => {
                if (curr.playerIndex === undefined || curr.playerIndex === null) return acc;
                const existing = acc.find(p => p.playerIndex === curr.playerIndex);
                if (existing) {
                    existing.count++;
                } else {
                    acc.push(curr);
                }
                return acc;
            }, [] as { playerIndex: number; count: number }[]);

        // Find players unlocked by this player  
        const unlockActions = gameActions.filter(action => {
            return action.playerId === playerId &&
                action.action === "unlock" &&
                action.result === "unlocked";
        });

        const unlockedPlayers = unlockActions
            .map(action => {
                const targetPlayerIndex = action.targetPlayer;
                return { playerIndex: targetPlayerIndex, count: 1 };
            })
            .reduce((acc, curr) => {
                if (curr.playerIndex === undefined || curr.playerIndex === null) return acc;
                const existing = acc.find(p => p.playerIndex === curr.playerIndex);
                if (existing) {
                    existing.count++;
                } else {
                    acc.push(curr);
                }
                return acc;
            }, [] as { playerIndex: number; count: number }[]);

        return { lockedPlayers, unlockedPlayers };
    }, [gameActions, game]);

    const calculatedInteractions = useMemo(() => calculatePlayerInteractions(playerIndex), [calculatePlayerInteractions, playerIndex]);

    // Players 0 and 2 are users, players 1 and 3 are bots
    const isBot = playerIndex === 1 || playerIndex === 3;
    const isTeam1 = playerIndex === 0 || playerIndex === 1;
    const isCurrentPlayer = playerIndex === currentPlayerIndex; // Use the calculated current player

    // Use purple/orange colors like in the real game
    const iconColor = isTeam1 ? "text-purple-500" : "text-orange-500";
    const borderColor = isTeam1 ? "border-purple-500" : "border-orange-500";

    // Team 1 gets circles, Team 2 gets squares
    const containerClasses = `w-16 h-16 bg-white border-4 ${borderColor} ${isTeam1 ? "rounded-full" : ""} flex items-center justify-center shadow-sm`;

    return (
        <div className="border border-gray-200 rounded-lg p-4 w-72 text-center shadow-md bg-white">
            {/* Player Icon Section */}
            <div className="h-20 flex items-center justify-center mb-4">
                {getPlayerSymbol(playerIndex, false, "large", isCurrentPlayer, achievements, dbBotCondition)}
            </div>

            {/* Player Interactions */}
            <div className="flex-1">
                {/* Stars Collected Section */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2 min-h-[4rem] flex flex-col">
                    <div className="text-md font-medium text-yellow-600 mb-1 flex items-center justify-center gap-1">
                        <span>Harvested {achievements.stars} star{achievements.stars > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        {achievements.stars > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                                {Array.from({ length: Math.min(achievements.stars, 10) }).map((_, index) => (
                                    <FontAwesomeIcon
                                        key={index}
                                        icon={faStar}
                                        className="text-yellow-500 text-sm"
                                    />
                                ))}
                                {achievements.stars > 10 && (
                                    <span className="text-xs text-yellow-600 font-medium ml-1">
                                        +{achievements.stars - 10} more
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-xs text-yellow-600"> </span>
                        )}
                    </div>
                </div>

                {/* Locked Players Section */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2 min-h-[4rem] flex flex-col">
                    <div className="text-md font-medium text-red-600 mb-1 flex items-center justify-center gap-1">
                        <FontAwesomeIcon icon={faLock} />
                        {calculatedInteractions.lockedPlayers.length > 0 ? (
                            <span>Locked {calculatedInteractions.lockedPlayers.reduce((total, player) => total + player.count, 0)} time{calculatedInteractions.lockedPlayers.reduce((total, player) => total + player.count, 0) > 1 ? 's' : ''}</span>
                        ) : (
                            <span>Never locked anyone</span>
                        )}
                    </div>
                    <div className="flex-1 flex items-center justify-center pt-4">
                        {calculatedInteractions.lockedPlayers.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                                {calculatedInteractions.lockedPlayers.map(({ playerIndex: targetIndex, count }) => (
                                    <div key={targetIndex} className="flex items-center gap-1 rounded-md px-1.5 py-0.5">
                                        <div className="flex-shrink-0">
                                            {getPlayerSymbol(targetIndex, false, "small", targetIndex === currentPlayerIndex, gameResults?.achievements?.[targetIndex], dbBotCondition)}
                                        </div>
                                        <div className="text-xs font-medium text-red-700">
                                            {count}x
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Unlocked Players Section */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 min-h-[4rem] flex flex-col">
                    <div className="text-md font-medium text-green-600 mb-1 flex items-center justify-center gap-1">
                        <FontAwesomeIcon icon={faLockOpen} />
                        {calculatedInteractions.unlockedPlayers.length > 0 ? (
                            <span>Unlocked {calculatedInteractions.unlockedPlayers.reduce((total, player) => total + player.count, 0)} time{calculatedInteractions.unlockedPlayers.reduce((total, player) => total + player.count, 0) > 1 ? 's' : ''}</span>
                        ) : (
                            <span>Never unlocked anyone</span>
                        )}
                    </div>
                    <div className="flex-1 flex items-center justify-center pt-4">
                        {calculatedInteractions.unlockedPlayers.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                                {calculatedInteractions.unlockedPlayers.map(({ playerIndex: targetIndex, count }) => (
                                    <div key={targetIndex} className="flex items-center gap-1 rounded-md px-1.5 py-0.5">
                                        <div className="flex-shrink-0">
                                            {getPlayerSymbol(targetIndex, false, "small", targetIndex === currentPlayerIndex, gameResults?.achievements?.[targetIndex], dbBotCondition)}
                                        </div>
                                        <div className="text-xs font-medium text-green-700">
                                            {count}x
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Reusable Player Rating Page ---
interface PlayerRatingPageProps {
    pageTitle: string;
    ratingQuestion: React.ReactNode;
    ratingLabels: string[];
    players: Array<{
        id: number;
        name: string;
        playerIndex: number;
        achievements?: { stars: number; locks: number; unlocks: number };
    }>;
    onRatingsSubmit: (ratings: RatingsState, ratingType: string) => void;
    onNextClicked: () => void;
    ratingType: string;
    gameActions?: any[]; // Add gameActions to calculate interactions
    game?: any; // Add game data for calculating interactions
    gameResults?: {
        isPlayerWinner: boolean;
        playerTeam: number;
        winnerTeam: number;
        achievements: Record<number, { stars: number; locks: number; unlocks: number }>;
    };
    currentPlayerIndex?: number; // Add prop to specify which player is current
    dbBotCondition?: "aware" | "unaware"; // Add dbBotCondition prop
}

type RatingsState = { [playerId: number]: string }; // Kept type alias for clarity

const PlayerRatingPage: React.FC<PlayerRatingPageProps> = ({
    pageTitle,
    ratingQuestion,
    ratingLabels,
    players,
    onRatingsSubmit,
    onNextClicked,
    ratingType,
    gameActions,
    game,
    gameResults,
    currentPlayerIndex = 0, // Default to player 0 if not specified
    dbBotCondition = "aware" // Add default value
}) => {
    const [ratings, setRatings] = React.useState<RatingsState>({});
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [validationError, setValidationError] = React.useState<string>('');

    // Add time tracking for quick submission prevention
    const [startTime, setStartTime] = React.useState<number | null>(null);
    const [hasBeenWarned, setHasBeenWarned] = React.useState(false);
    const [showQuickSubmitWarning, setShowQuickSubmitWarning] = React.useState(false);

    // Add mutation for saving survey ratings
    const saveSurveyRatings = useMutation(api.game.saveSurveyRatings);

    // Set start time when component mounts
    React.useEffect(() => {
        if (startTime === null) {
            setStartTime(Date.now());
        }
    }, []);

    const handleRating = (playerId: number, value: string) => {
        // Set start time on first interaction
        if (startTime === null) {
            setStartTime(Date.now());
        }
        setRatings((prev) => ({ ...prev, [playerId]: value }));
        // Clear validation error when user starts rating
        if (validationError) {
            setValidationError('');
        }
    };

    // Check if all players have been rated
    const areAllPlayersRated = () => {
        return players.every(player => ratings[player.id] && ratings[player.id].trim() !== '');
    };

    const handleSubmit = async () => {
        // Check if user is submitting too quickly (less than MIN_TIME_BETWEEN_SUBMISSIONS)
        if (startTime && !hasBeenWarned) {
            const timeSpent = Date.now() - startTime;
            if (timeSpent < MIN_TIME_BETWEEN_SUBMISSIONS) {
                setShowQuickSubmitWarning(true);
                return;
            }
        }

        // Validate that all players have been rated
        if (!areAllPlayersRated()) {
            const unratedPlayers = players.filter(player => !ratings[player.id] || ratings[player.id].trim() === '');
            setValidationError(`Please rate all players before proceeding. Missing ratings for: Player ${unratedPlayers.map(p => p.playerIndex + 1).join(', Player ')}`);
            return;
        }

        setIsSubmitting(true);

        try {
            // Call the existing onRatingsSubmit first for backwards compatibility
            onRatingsSubmit(ratings, ratingType);

            // Save to database if gameId is available via gameResults
            // Extract gameId from the component props if available
            const gameId = gameResults ? undefined : undefined; // This would need to be passed down

            // Convert ratings to the format expected by the mutation
            const ratingsArray = Object.entries(ratings).map(([playerId, rating]) => {
                // Find the player index from the players array
                const player = players.find(p => p.id === Number(playerId));
                return {
                    targetPlayerIndex: player?.playerIndex || 0,
                    rating,
                };
            });

            // Note: Since gameId isn't available in this component, we'll need to handle saving elsewhere
            console.log("Would save ratings:", { ratingType, ratingsArray });
        } catch (error) {
            console.error("Failed to process ratings:", error);
        } finally {
            setIsSubmitting(false);
        }

        onNextClicked();
    };

    // Determine winners for display
    const winnerTeam = gameResults?.winnerTeam || 1; // This should come from game results
    const team1Players = players.filter(p => p.playerIndex === 0 || p.playerIndex === 1);
    const team2Players = players.filter(p => p.playerIndex === 2 || p.playerIndex === 3);

    const isTeam1Winner = winnerTeam === 1;

    // Calculate total stars for each team
    const team1TotalStars = team1Players.reduce((total, player) => {
        return total + (player.achievements?.stars || 0);
    }, 0);

    const team2TotalStars = team2Players.reduce((total, player) => {
        return total + (player.achievements?.stars || 0);
    }, 0);

    return (
        <div className="min-w-90% mx-auto my-0 bg-white rounded-xl p-6 shadow-lg font-sans">
            <h2 className="text-center text-2xl font-semibold mb-6">Game Summary & Survey</h2>

            {/* Team-based Player Display */}
            <div className="mb-8">
                <div className="flex flex-col lg:flex-row justify-center items-start gap-6">
                    {/* Team 1 */}
                    <div className={`border-2 rounded-xl p-6 w-fit min-h-[460px] transition-all duration-500 border-gray-300 bg-gray-50`}>
                        <div className="text-center mb-4">
                            <h4 className={`text-xl font-bold ${isTeam1Winner ? 'text-yellow-700' : 'text-gray-600'} mb-2`}>
                                {isTeam1Winner ? 'Winners' : 'Losers'} <FontAwesomeIcon icon={faStar} className="text-yellow-500" />
                                <span className="text-lg font-semibold text-gray-700">
                                    {team1TotalStars}
                                </span>
                            </h4>

                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
                            {team1Players.map((player) => (
                                <PlayerDisplayCard
                                    key={player.id}
                                    playerIndex={player.playerIndex}
                                    achievements={player.achievements}
                                    gameActions={gameActions}
                                    game={game}
                                    gameResults={gameResults}
                                    dbBotCondition={dbBotCondition}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Team 2 */}
                    <div className={`border-2 rounded-xl p-6 w-fit min-h-[460px] transition-all duration-500 border-gray-300 bg-gray-50`}>
                        <div className="text-center mb-4">
                            <h4 className={`text-xl font-bold ${isTeam1Winner ? 'text-gray-600' : 'text-yellow-700'} mb-2`}>
                                {isTeam1Winner ? 'Losers' : 'Winners'} <FontAwesomeIcon icon={faStar} className="text-yellow-500" />
                                <span className="text-lg font-semibold text-gray-700">
                                    {team2TotalStars}
                                </span>
                            </h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
                            {team2Players.map((player) => (
                                <PlayerDisplayCard
                                    key={player.id}
                                    playerIndex={player.playerIndex}
                                    achievements={player.achievements}
                                    gameActions={gameActions}
                                    game={game}
                                    gameResults={gameResults}
                                    dbBotCondition={dbBotCondition}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <h3 className="text-center text-xl mb-8">{ratingQuestion}</h3>

            {/* Validation Error Display */}
            {validationError && (
                <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center">
                    <div className="flex items-center justify-center">
                        <span className="text-red-500 mr-2">⚠️</span>
                        <span>{validationError}</span>
                    </div>
                </div>
            )}

            {/* Rating Table */}
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Header Row */}
                <div className="bg-gray-50 border-b border-gray-200">
                    <div className="grid grid-cols-6 gap-4 p-4">
                        <div className="font-semibold text-gray-700 text-center">Player</div>
                        {ratingLabels.map((label, index) => (
                            <div key={index} className="font-semibold text-gray-700 text-center text-sm">
                                {label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Player Rows */}
                {players.map((player, playerIndex) => {
                    // Players 0 and 2 are users, players 1 and 3 are bots
                    const isBot = player.playerIndex === 1 || player.playerIndex === 3;
                    const isTeam1 = player.playerIndex === 0 || player.playerIndex === 1;
                    const isCurrentPlayer = player.playerIndex === currentPlayerIndex; // Use the prop instead of hardcoded 0

                    // Use purple/orange colors like in the real game
                    const iconColor = isTeam1 ? "text-purple-500" : "text-orange-500";
                    const borderColor = isTeam1 ? "border-purple-500" : "border-orange-500";

                    // Team 1 gets circles, Team 2 gets squares
                    const containerClasses = `w-12 h-12 bg-white border-4 ${borderColor} ${isTeam1 ? "rounded-full" : ""} flex items-center justify-center shadow-sm`;

                    const achievements = player.achievements || { stars: 0, locks: 0, unlocks: 0 };

                    // Check if this player has been rated
                    const isPlayerRated = ratings[player.id] && ratings[player.id].trim() !== '';

                    return (
                        <div key={player.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${playerIndex % 2 === 0 ? 'bg-white' : 'bg-gray-25'} ${!isPlayerRated && validationError ? 'border-l-4 border-l-red-400 bg-red-50' : ''}`}>
                            <div className="grid grid-cols-6 gap-4 p-4 items-center">
                                {/* Player Info Column */}
                                <div className="flex items-center justify-center">
                                    {getPlayerSymbol(player.playerIndex, false, "medium", isCurrentPlayer, achievements, dbBotCondition)}
                                </div>

                                {/* Rating Columns */}
                                {ratingLabels.map((label, labelIndex) => (
                                    <div key={labelIndex} className="flex justify-center">
                                        <label className="cursor-pointer">
                                            <input
                                                type="radio"
                                                name={`rating-${ratingType}-${player.id}`}
                                                value={label}
                                                checked={ratings[player.id] === label}
                                                onChange={() => handleRating(player.id, label)}
                                                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                            />
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="text-center mt-8">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !areAllPlayersRated()}
                    className={`border-0 rounded-md py-3 px-8 text-base cursor-pointer transition-colors duration-200 shadow-lg ${isSubmitting || !areAllPlayersRated()
                        ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                >
                    {isSubmitting ? 'Saving...' : 'Next'}
                </button>
                {!areAllPlayersRated() && !validationError && (
                    <p className="text-sm text-gray-500 mt-2">Please rate all players to continue</p>
                )}
            </div>

            {/* Quick Submit Warning Modal */}
            {showQuickSubmitWarning && (
                <>
                    {/* Backdrop overlay */}
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50"></div>

                    {/* Warning Modal */}
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full mx-4">
                        <div className="p-8 text-center">
                            <div className="text-6xl mb-4">⚠️</div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Quick Submission Detected</h2>
                            <p className="text-gray-600 leading-relaxed mb-6">
                                You completed this survey too quickly.
                                Please take time to carefully read and consider each question about the players' behavior.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={() => {
                                        setShowQuickSubmitWarning(false);
                                        // Scroll to the top of the survey for review
                                        window.scrollTo({
                                            top: 0,
                                            behavior: 'smooth'
                                        });
                                    }}
                                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors duration-200"
                                >
                                    Review Questions
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

interface ExtraRewardPageProps extends FormComponentProps {
    isWinner?: boolean; // true for winner, false for loser
    isTeamReward?: boolean; // true if giving to own team, false if giving to other team
    gameResults: {
        isPlayerWinner: boolean;
        playerTeam: number;
        winnerTeam: number;
        achievements: Record<number, { stars: number; locks: number; unlocks: number }>;
    };
    gameActions?: any[]; // Add gameActions to calculate interactions
    game?: any; // Add game data for calculating interactions
    gameId?: Id<"games">; // Add gameId prop
}

const ExtraRewardPage: React.FC<ExtraRewardPageProps> = ({
    onNextClicked,
    isWinner = true,
    isTeamReward = true,
    gameResults,
    gameActions,
    game,
    gameId // Add gameId prop
}) => {
    const [player1Points, setPlayer1Points] = React.useState(0);
    const [player2Points, setPlayer2Points] = React.useState(0);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Add time tracking for quick submission prevention
    const [startTime, setStartTime] = React.useState<number | null>(null);
    const [hasBeenWarned, setHasBeenWarned] = React.useState(false);
    const [showQuickSubmitWarning, setShowQuickSubmitWarning] = React.useState(false);

    // Add state for zero distribution confirmation
    const [showZeroDistributionWarning, setShowZeroDistributionWarning] = React.useState(false);
    const [hasConfirmedZeroDistribution, setHasConfirmedZeroDistribution] = React.useState(false);

    const saveDistribution = useMutation(api.game.saveDistribution);
    const markSurveyCompleted = useMutation(api.game.markSurveyCompleted);

    // Get dbBotCondition from user profile
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    // Set start time when component mounts
    React.useEffect(() => {
        if (startTime === null) {
            setStartTime(Date.now());
        }
    }, []);

    // Determine which players to show based on team and reward target
    const getPlayersToShow = () => {
        const currentPlayerTeam = gameResults?.playerTeam || 1;

        if (isTeamReward) {
            // Distributing to own team
            if (currentPlayerTeam === 1) {
                return { player1Index: 0, player2Index: 1 }; // Team 1: players 0,1
            } else {
                return { player1Index: 2, player2Index: 3 }; // Team 2: players 2,3
            }
        } else {
            // Distributing to other team
            if (currentPlayerTeam === 1) {
                return { player1Index: 2, player2Index: 3 }; // Other team: players 2,3
            } else {
                return { player1Index: 0, player2Index: 1 }; // Other team: players 0,1
            }
        }
    };

    const { player1Index, player2Index } = getPlayersToShow();

    // Determine content based on props
    const getPageContent = () => {
        if (isWinner && isTeamReward) {
            return {
                title: "🎉 Congratulations! You Won!",
                subtitle: "Bonus Points Available",
                description: "Split 20 points among your teammates!",
                instruction: "Use the sliders below to decide how many points each teammate should receive.",
                totalPoints: 20,
                showWinnerIcon: true,
                bgColor: "bg-green-50",
                borderColor: "border-green-200",
                accentColor: "text-green-600"
            };
        } else if (isWinner && !isTeamReward) {
            return {
                title: "🤝 Share with the Other Team",
                subtitle: "Sportsmanship Bonus",
                description: "Split 10 points among players from the losing team!",
                instruction: "Use the sliders below to decide how many points each opposing player should receive.",
                totalPoints: 10,
                showWinnerIcon: false,
                bgColor: "bg-blue-50",
                borderColor: "border-blue-200",
                accentColor: "text-blue-600"
            };
        } else if (!isWinner && isTeamReward) {
            return {
                title: "💪 Consolation Reward",
                subtitle: "Team Bonus Points",
                description: "Split 10 points among your teammates!",
                instruction: "Use the sliders below to decide how many points each teammate should receive.",
                totalPoints: 10,
                showWinnerIcon: false,
                bgColor: "bg-yellow-50",
                borderColor: "border-yellow-200",
                accentColor: "text-yellow-600"
            };
        } else {
            return {
                title: "😔 Better Luck Next Time",
                subtitle: "Gracious in Defeat",
                description: "Split 20 points among players from the winning team!",
                instruction: "Use the sliders below to decide how many bonus points each winning player should receive.",
                totalPoints: 20,
                showWinnerIcon: false,
                bgColor: "bg-gray-50",
                borderColor: "border-gray-200",
                accentColor: "text-gray-600"
            };
        }
    };

    const content = getPageContent();

    // Calculate player interactions from game actions
    const calculatePlayerInteractions = (forPlayerIndex: number) => {
        if (!gameActions || !game) {
            return { lockedPlayers: [], unlockedPlayers: [] };
        }

        const allPlayers = [...game.team1, ...game.team2];
        const playerId = allPlayers[forPlayerIndex];

        if (!playerId) {
            return { lockedPlayers: [], unlockedPlayers: [] };
        }

        // Find players locked by this player
        const lockActions = gameActions.filter(action => {
            return action.playerId === playerId &&
                action.action === "lock" &&
                action.result === "locked";
        });

        const lockedPlayers = lockActions
            .map(action => {
                const targetPlayerIndex = action.targetPlayer;
                return { playerIndex: targetPlayerIndex, count: 1 };
            })
            .reduce((acc, curr) => {
                if (curr.playerIndex === undefined || curr.playerIndex === null) return acc;
                const existing = acc.find(p => p.playerIndex === curr.playerIndex);
                if (existing) {
                    existing.count++;
                } else {
                    acc.push(curr);
                }
                return acc;
            }, [] as { playerIndex: number; count: number }[]);

        // Find players unlocked by this player  
        const unlockActions = gameActions.filter(action => {
            return action.playerId === playerId &&
                action.action === "unlock" &&
                action.result === "unlocked";
        });

        const unlockedPlayers = unlockActions
            .map(action => {
                const targetPlayerIndex = action.targetPlayer;
                return { playerIndex: targetPlayerIndex, count: 1 };
            })
            .reduce((acc, curr) => {
                if (curr.playerIndex === undefined || curr.playerIndex === null) return acc;
                const existing = acc.find(p => p.playerIndex === curr.playerIndex);
                if (existing) {
                    existing.count++;
                } else {
                    acc.push(curr);
                }
                return acc;
            }, [] as { playerIndex: number; count: number }[]);

        return { lockedPlayers, unlockedPlayers };
    };

    // Calculate maximum points each player can receive based on the other's current points
    const getMaxPointsForPlayer1 = () => {
        return content.totalPoints; // Allow full range instead of constraining
    };

    const getMaxPointsForPlayer2 = () => {
        return content.totalPoints; // Allow full range instead of constraining
    };

    const handlePlayer1Change = (newPoints: number) => {
        // Set start time on first interaction
        if (startTime === null) {
            setStartTime(Date.now());
        }
        setPlayer1Points(newPoints); // No more constraints - allow independent movement
    };

    const handlePlayer2Change = (newPoints: number) => {
        // Set start time on first interaction
        if (startTime === null) {
            setStartTime(Date.now());
        }
        setPlayer2Points(newPoints); // No more constraints - allow independent movement
    };

    const handleDone = async () => {
        // Check if both players are getting zero points and user hasn't confirmed yet
        if (player1Points === 0 && player2Points === 0 && !hasConfirmedZeroDistribution) {
            setShowZeroDistributionWarning(true);
            return;
        }

        // Check if user is submitting too quickly (less than MIN_TIME_BETWEEN_SUBMISSIONS)
        if (startTime && !hasBeenWarned) {
            const timeSpent = Date.now() - startTime;
            if (timeSpent < MIN_TIME_BETWEEN_SUBMISSIONS) { // Less than 10 seconds
                setShowQuickSubmitWarning(true);
                return;
            }
        }

        if (!gameId) {
            console.warn("No gameId provided, cannot save distribution");
            window.scrollTo({ top: 0, behavior: 'smooth' });
            onNextClicked();
            return;
        }

        setIsSubmitting(true);

        try {
            // Get current player index (who is distributing)
            const currentPlayerIndex = getCurrentPlayerIndex(gameResults);

            // Build the distributions array - always include both players regardless of points
            const distributions = [
                {
                    recipientPlayerIndex: player1Index,
                    pointsGiven: player1Points,
                },
                {
                    recipientPlayerIndex: player2Index,
                    pointsGiven: player2Points,
                }
            ];

            // Save to database
            await saveDistribution({
                gameId,
                distributorPlayerIndex: currentPlayerIndex,
                isWinner: gameResults?.isPlayerWinner || isWinner,
                isTeamReward,
                distributions,
                totalPointsAvailable: content.totalPoints,
            });

            console.log("Distribution saved successfully:", {
                gameId,
                distributorPlayerIndex: currentPlayerIndex,
                distributions,
                totalPointsAvailable: content.totalPoints,
            });

            // Only mark survey completion after BOTH distribution pages are completed
            // For winners: mark completion after second page (distributing to other team, isTeamReward=false)
            // For losers: mark completion after second page (distributing to own team, isTeamReward=true)
            const isSecondDistributionPage = (isWinner && !isTeamReward) || (!isWinner && isTeamReward);

            if (isSecondDistributionPage) {
                await markSurveyCompleted({
                    gameId,
                    completionType: "extra-reward-distribution-completed",
                });
            }
        } catch (error) {
            console.error("Failed to save distribution:", error);
            // Continue anyway - don't block the user
        } finally {
            setIsSubmitting(false);
        }

        // Scroll to top when leaving the extra reward page
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNextClicked(); // Navigate to the next page
    };

    const totalDistributed = player1Points + player2Points;
    const remainingPoints = content.totalPoints - totalDistributed;
    const isOverLimit = totalDistributed > content.totalPoints;
    const excessPoints = Math.max(0, totalDistributed - content.totalPoints);

    return (
        <div className="max-w-4xl mx-auto my-10 text-center font-sans ">
            {/* Header Section */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold mb-3 text-gray-800">{content.title}</h1>
                <h2 className="text-xl text-gray-600 mb-4">{content.subtitle}</h2>
            </div>

            {/* Points Distribution Summary */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-4 mb-3 shadow-md">
                <h2 className={`text-3xl font-semibold text-blue-700 mb-5 mt-5 ml-20 mr-20`}>{content.description}</h2>
                {/* <p className="text-lg text-gray-600 mb-4 leading-relaxed ml-20 mr-20">
                    {content.description} {content.instruction}
                </p> */}
                <div className=" text-center ml-20 mr-20 ">
                    <div className={`rounded-lg p-4 ${isOverLimit ? 'bg-red-100 border-2 border-red-300' : 'bg-blue-50'}`}>
                        <div className={`text-3xl font-bold ${isOverLimit ? 'text-red-600' : 'text-blue-600'}`}>{totalDistributed} / {content.totalPoints}</div>
                        <div className={`text-md ${isOverLimit ? 'text-red-500' : 'text-blue-500'}`}>
                            {isOverLimit ? <span className="text-red-500"> Exceeds limit ⚠️</span> : 'Currently Distributed'}
                        </div>


                    </div>

                </div>

                {/* Player Selection Cards */}
                <div className="mb-8 mt-8">
                    <div className="flex flex-col lg:flex-row justify-center items-top lg:space-x-8 space-y-0 lg:space-y-0">
                        <PlayerInputCard
                            playerIndex={player1Index}
                            points={player1Points}
                            onPointsChange={handlePlayer1Change}
                            isWinningPlayer={content.showWinnerIcon}
                            achievements={gameResults?.achievements[player1Index] || { stars: 0, locks: 0, unlocks: 0 }}
                            maxPoints={getMaxPointsForPlayer1()}
                            interactions={calculatePlayerInteractions(player1Index)}
                            gameResults={gameResults}
                            dbBotCondition={dbBotCondition}
                        />
                        <PlayerInputCard
                            playerIndex={player2Index}
                            points={player2Points}
                            onPointsChange={handlePlayer2Change}
                            isWinningPlayer={content.showWinnerIcon}
                            achievements={gameResults?.achievements[player2Index] || { stars: 0, locks: 0, unlocks: 0 }}
                            maxPoints={getMaxPointsForPlayer2()}
                            interactions={calculatePlayerInteractions(player2Index)}
                            gameResults={gameResults}
                            dbBotCondition={dbBotCondition}
                        />
                    </div>

                </div>
                {/* Important Note */}
                <div className="flex items-start">
                    <div className="ml-3">
                        <p className="text-md text-blue-700"> <span className="text-blue-400 text-xl">💡</span>
                            <span className="text-md font-bold text-blue-800">Note:</span> You don't have to distribute all points. <span className="underline">Total points after distribution will decide who will be the best player and get additional Prolific reward.</span>
                        </p>
                    </div>
                </div>


            </div>




            {/* Action Button */}
            <div className="text-center">
                <button
                    onClick={handleDone}
                    disabled={isOverLimit || isSubmitting}
                    className={`font-semibold py-4 px-10 rounded-lg text-lg shadow-lg transition-colors duration-200 ${isOverLimit || isSubmitting
                        ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white transform hover:scale-105'
                        }`}
                >
                    {isSubmitting ? 'Saving...' : 'Continue'}
                </button>
            </div>

            {/* Quick Submit Warning Modal */}
            {showQuickSubmitWarning && (
                <>
                    {/* Backdrop overlay */}
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50"></div>

                    {/* Warning Modal */}
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full mx-4">
                        <div className="p-8 text-center">
                            <div className="text-6xl mb-4">⚠️</div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Quick Submission Detected</h2>
                            <p className="text-gray-600 leading-relaxed mb-6">
                                You completed this survey too quickly.
                                Please take time to carefully read and consider each question about the players' behavior.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={() => {
                                        setShowQuickSubmitWarning(false);
                                        // Scroll to the top of the survey for review
                                        window.scrollTo({
                                            top: 0,
                                            behavior: 'smooth'
                                        });
                                    }}
                                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors duration-200"
                                >
                                    Review Questions
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Zero Distribution Warning Modal */}
            {showZeroDistributionWarning && (
                <>
                    {/* Backdrop overlay */}
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50"></div>

                    {/* Warning Modal */}
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full mx-4">
                        <div className="p-8 text-center">
                            <div className="text-6xl mb-4">🤔</div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Zero Points Distribution</h2>
                            <p className="text-gray-600 leading-relaxed mb-6">
                                You're giving zero points to both players. Are you sure?
                            </p>

                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={() => {
                                        setShowZeroDistributionWarning(false);
                                        // Scroll to the distribution section for review
                                        window.scrollTo({
                                            top: 0,
                                            behavior: 'smooth'
                                        });
                                    }}
                                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors duration-200"
                                >
                                    Go Back & Adjust
                                </button>
                                <button
                                    onClick={() => {
                                        setShowZeroDistributionWarning(false);
                                        setHasConfirmedZeroDistribution(true);
                                        // Trigger handleDone again with confirmation
                                        handleDone();
                                    }}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
                                >
                                    Yes, Continue with 0 Points
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const RewardTheOtherTeamPage: React.FC<FormComponentProps> = ({ onNextClicked }) => {
    const [otherPlayer1Points, setOtherPlayer1Points] = React.useState(0);
    const [otherPlayer2Points, setOtherPlayer2Points] = React.useState(0);
    const totalGivenPoints = 10;

    // Get dbBotCondition from user profile
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const handleDone = () => {
        console.log("Points for other team:", { player1: otherPlayer1Points, player2: otherPlayer2Points });
        // TODO: Add logic to submit these points
        // Scroll to top when leaving the distribution page
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNextClicked(); // Navigate to the next page
    };

    return (
        <div className="max-w-2xl mx-auto my-10 text-center font-sans">
            <h1 className="text-3xl mb-2.5">Reward the other team</h1>
            <p className="text-base text-gray-600 mb-7">
                You were also given <strong className="text-pink-600">extra 10 points</strong> to share with other players! How would you split points among the other team members? Note: You don't have to distribute all points.
            </p>
            <div className="flex justify-around mb-7">
                <PlayerInputCard
                    playerIndex={0}
                    points={otherPlayer1Points}
                    onPointsChange={setOtherPlayer1Points}
                    achievements={{ stars: 5, locks: 1, unlocks: 2 }} // Mock achievements for testing
                    dbBotCondition={dbBotCondition}
                />
                <PlayerInputCard
                    playerIndex={1}
                    points={otherPlayer2Points}
                    onPointsChange={setOtherPlayer2Points}
                    achievements={{ stars: 3, locks: 2, unlocks: 1 }} // Mock achievements for testing
                    dbBotCondition={dbBotCondition}
                />
            </div>
            <button
                onClick={handleDone}
                className="bg-blue-600 text-white py-3 px-7 border-none rounded-md text-base cursor-pointer shadow-md"
            >
                Done
            </button>
        </div>
    );
}

const OverallPerformancePage: React.FC<FormComponentProps> = ({ onNextClicked, gameResults, gameActions, game, gameId }) => {
    // Use real achievements if available, otherwise fallback to mock data
    const achievements = gameResults?.achievements || {
        0: { stars: 7, locks: 2, unlocks: 1 },
        1: { stars: 4, locks: 1, unlocks: 3 },
        2: { stars: 3, locks: 3, unlocks: 0 },
        3: { stars: 2, locks: 0, unlocks: 2 },
    };

    const players = [
        { id: 1, name: "Player 1", playerIndex: 0, achievements: achievements[0] },
        { id: 2, name: "Player 2", playerIndex: 1, achievements: achievements[1] },
        { id: 3, name: "Player 3", playerIndex: 2, achievements: achievements[2] },
        { id: 4, name: "Player 4", playerIndex: 3, achievements: achievements[3] },
    ];
    const ratingLabels = [
        "Very bad",
        "Bad",
        "Neutral",
        "Good",
        "Very good",
    ];

    const saveSurveyRatings = useMutation(api.game.saveSurveyRatings);

    // Get dbBotCondition from user profile
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const handleRatingsSubmit = async (ratings: RatingsState, ratingType: string) => {
        console.log("Overall performance ratings:", ratings, "Type:", ratingType);

        if (gameId) {
            try {
                // Convert ratings to the format expected by the mutation
                const ratingsArray = Object.entries(ratings).map(([playerId, rating]) => {
                    // Find the player index from the players array
                    const player = players.find(p => p.id === Number(playerId));
                    return {
                        targetPlayerIndex: player?.playerIndex || 0,
                        rating,
                    };
                });

                await saveSurveyRatings({
                    gameId,
                    ratingType: "overall-performance",
                    ratings: ratingsArray,
                });

                console.log("Overall performance ratings saved successfully");
            } catch (error) {
                console.error("Failed to save overall performance ratings:", error);
            }
        }
    };

    return (
        <PlayerRatingPage
            pageTitle="Game Summary"
            ratingQuestion={<>Rate the players for their <b>overall game performance</b></>}
            ratingLabels={ratingLabels}
            players={players}
            onRatingsSubmit={handleRatingsSubmit}
            onNextClicked={onNextClicked}
            ratingType="overall-performance"
            gameActions={gameActions}
            game={game}
            gameResults={gameResults}
            currentPlayerIndex={getCurrentPlayerIndex(gameResults)}
            dbBotCondition={dbBotCondition}
        />
    );
}

const CompetitivenessPage: React.FC<FormComponentProps> = ({ onNextClicked, gameResults, gameActions, game, gameId }) => {
    // Use real achievements if available, otherwise fallback to mock data
    const achievements = gameResults?.achievements || {
        0: { stars: 7, locks: 2, unlocks: 1 },
        1: { stars: 4, locks: 1, unlocks: 3 },
        2: { stars: 3, locks: 3, unlocks: 0 },
        3: { stars: 2, locks: 0, unlocks: 2 },
    };

    const players = [
        { id: 1, name: "Player 1", playerIndex: 0, achievements: achievements[0] },
        { id: 2, name: "Player 2", playerIndex: 1, achievements: achievements[1] },
        { id: 3, name: "Player 3", playerIndex: 2, achievements: achievements[2] },
        { id: 4, name: "Player 4", playerIndex: 3, achievements: achievements[3] },
    ];
    const ratingLabels = [
        "Not at all Competitive",
        "Slightly Competitive",
        "Moderately Competitive",
        "Very Competitive",
        "Extremely Competitive",
    ];

    const saveSurveyRatings = useMutation(api.game.saveSurveyRatings);

    // Get dbBotCondition from user profile
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const handleRatingsSubmit = async (ratings: RatingsState, ratingType: string) => {
        console.log("Competitiveness ratings:", ratings, "Type:", ratingType);

        if (gameId) {
            try {
                // Convert ratings to the format expected by the mutation
                const ratingsArray = Object.entries(ratings).map(([playerId, rating]) => {
                    // Find the player index from the players array
                    const player = players.find(p => p.id === Number(playerId));
                    return {
                        targetPlayerIndex: player?.playerIndex || 0,
                        rating,
                    };
                });

                await saveSurveyRatings({
                    gameId,
                    ratingType: "competitiveness",
                    ratings: ratingsArray,
                });

                console.log("Competitiveness ratings saved successfully");
            } catch (error) {
                console.error("Failed to save competitiveness ratings:", error);
            }
        }
    };

    return (
        <PlayerRatingPage
            pageTitle="Player Competitiveness Rating"
            ratingQuestion={<>Rate how <b>competitive</b> each player was.</>}
            ratingLabels={ratingLabels}
            players={players}
            onRatingsSubmit={handleRatingsSubmit}
            onNextClicked={onNextClicked}
            ratingType="competitiveness"
            gameActions={gameActions}
            game={game}
            gameResults={gameResults}
            currentPlayerIndex={getCurrentPlayerIndex(gameResults)}
            dbBotCondition={dbBotCondition}
        />
    );
}

const CollaborationPage: React.FC<FormComponentProps> = ({ onNextClicked, gameResults, gameActions, game, gameId }) => {
    // Use real achievements if available, otherwise fallback to mock data
    const achievements = gameResults?.achievements || {
        0: { stars: 7, locks: 2, unlocks: 1 },
        1: { stars: 4, locks: 1, unlocks: 3 },
        2: { stars: 3, locks: 3, unlocks: 0 },
        3: { stars: 2, locks: 0, unlocks: 2 },
    };

    const players = [
        { id: 1, name: "Player 1", playerIndex: 0, achievements: achievements[0] },
        { id: 2, name: "Player 2", playerIndex: 1, achievements: achievements[1] },
        { id: 3, name: "Player 3", playerIndex: 2, achievements: achievements[2] },
        { id: 4, name: "Player 4", playerIndex: 3, achievements: achievements[3] },
    ];
    const ratingLabels = [
        "Not at all Collaborative",
        "Slightly Collaborative",
        "Moderately Collaborative",
        "Very Collaborative",
        "Extremely Collaborative",
    ];

    const saveSurveyRatings = useMutation(api.game.saveSurveyRatings);

    // Get dbBotCondition from user profile
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const handleRatingsSubmit = async (ratings: RatingsState, ratingType: string) => {
        console.log("Collaboration ratings:", ratings, "Type:", ratingType);

        if (gameId) {
            try {
                // Convert ratings to the format expected by the mutation
                const ratingsArray = Object.entries(ratings).map(([playerId, rating]) => {
                    // Find the player index from the players array
                    const player = players.find(p => p.id === Number(playerId));
                    return {
                        targetPlayerIndex: player?.playerIndex || 0,
                        rating,
                    };
                });

                await saveSurveyRatings({
                    gameId,
                    ratingType: "collaboration",
                    ratings: ratingsArray,
                });

                console.log("Collaboration ratings saved successfully");
            } catch (error) {
                console.error("Failed to save collaboration ratings:", error);
            }
        }
    };

    return (
        <PlayerRatingPage
            pageTitle="Player Collaboration Rating"
            ratingQuestion={<>Rate how <b>collaborative</b> each player was.</>}
            ratingLabels={ratingLabels}
            players={players}
            onRatingsSubmit={handleRatingsSubmit}
            onNextClicked={onNextClicked}
            ratingType="collaboration"
            gameActions={gameActions}
            game={game}
            gameResults={gameResults}
            currentPlayerIndex={getCurrentPlayerIndex(gameResults)}
            dbBotCondition={dbBotCondition}
        />
    );
}

const HarmIntentionPage: React.FC<FormComponentProps> = ({ onNextClicked, gameResults, gameActions, game, gameId }) => {
    // Use real achievements if available, otherwise fallback to mock data
    const achievements = gameResults?.achievements || {
        0: { stars: 7, locks: 2, unlocks: 1 },
        1: { stars: 4, locks: 1, unlocks: 3 },
        2: { stars: 3, locks: 3, unlocks: 0 },
        3: { stars: 2, locks: 0, unlocks: 2 },
    };

    const players = [
        { id: 1, name: "Player 1", playerIndex: 0, achievements: achievements[0] },
        { id: 2, name: "Player 2", playerIndex: 1, achievements: achievements[1] },
        { id: 3, name: "Player 3", playerIndex: 2, achievements: achievements[2] },
        { id: 4, name: "Player 4", playerIndex: 3, achievements: achievements[3] },
    ];
    const ratingLabels = [
        "Strongly Disagree",
        "Disagree",
        "Neutral",
        "Agree",
        "Strongly Agree",
    ];

    const saveSurveyRatings = useMutation(api.game.saveSurveyRatings);
    const markSurveyCompleted = useMutation(api.game.markSurveyCompleted);

    // Get dbBotCondition from user profile
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const handleRatingsSubmit = async (ratings: RatingsState, ratingType: string) => {
        console.log("Harm intention ratings:", ratings, "Type:", ratingType);

        if (gameId) {
            try {
                // Convert ratings to the format expected by the mutation
                const ratingsArray = Object.entries(ratings).map(([playerId, rating]) => {
                    // Find the player index from the players array
                    const player = players.find(p => p.id === Number(playerId));
                    return {
                        targetPlayerIndex: player?.playerIndex || 0,
                        rating,
                    };
                });

                // Save the actual ratings
                await saveSurveyRatings({
                    gameId,
                    ratingType: "harm-intention",
                    ratings: ratingsArray,
                });

                // Mark survey completion for synchronization
                await markSurveyCompleted({
                    gameId,
                    completionType: "harm-intention-completed",
                });

                console.log("Harm intention ratings saved and completion marked successfully");
            } catch (error) {
                console.error("Failed to save harm intention ratings:", error);
            }
        }
    };

    return (
        <PlayerRatingPage
            pageTitle="Player Harm Intention Rating"
            ratingQuestion={<>This player <b>intended to harm</b> other players.</>}
            ratingLabels={ratingLabels}
            players={players}
            onRatingsSubmit={handleRatingsSubmit}
            onNextClicked={onNextClicked}
            ratingType="harm-intention"
            gameActions={gameActions}
            game={game}
            gameResults={gameResults}
            currentPlayerIndex={getCurrentPlayerIndex(gameResults)}
            dbBotCondition={dbBotCondition}
        />
    );
}

// Waiting page component for synchronization
const WaitingPage: React.FC<FormComponentProps> = ({ onNextClicked, gameId, gameResults }) => {
    const [dots, setDots] = React.useState("");
    const [timeElapsed, setTimeElapsed] = React.useState(0);
    const [hasTimedOut, setHasTimedOut] = React.useState(false);
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    // Check survey completion status
    const completionStatus = useQuery(
        api.game.checkSurveyCompletion,
        gameId ? {
            gameId,
            completionType: "extra-reward-distribution-completed"
        } : "skip"
    );

    // Add mutation for marking completion for replaced players
    const markCompletionForReplacedPlayers = useMutation(api.game.markCompletionForReplacedPlayersPublic);

    // Mark completion for replaced players when needed
    React.useEffect(() => {
        if (completionStatus?.hasReplacedPlayers && gameId) {
            // Check if any replaced players haven't been marked as completed yet
            const replacedPlayerIndices = completionStatus.replacedPlayerIndices;
            const completedPlayers = completionStatus.completedPlayers;

            const uncompletedReplacedPlayers = replacedPlayerIndices.filter(
                playerIndex => !completedPlayers.includes(playerIndex)
            );

            if (uncompletedReplacedPlayers.length > 0) {
                // Mark completion for replaced players
                markCompletionForReplacedPlayers({
                    gameId,
                    completionType: "extra-reward-distribution-completed",
                }).catch(error => {
                    console.error("Failed to mark completion for replaced players:", error);
                });
            }
        }
    }, [completionStatus?.hasReplacedPlayers, completionStatus?.replacedPlayerIndices, completionStatus?.completedPlayers, gameId, markCompletionForReplacedPlayers]);

    // Animate dots
    React.useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => {
                if (prev.length >= 3) return "";
                return prev + ".";
            });
        }, 500);

        return () => clearInterval(interval);
    }, []);

    // Track elapsed time and handle timeout
    React.useEffect(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            setTimeElapsed(elapsed);

            if (elapsed >= WAITING_THRESHOLD && !hasTimedOut) {
                setHasTimedOut(true);
            }
        }, 1000); // Update every second

        return () => clearInterval(interval);
    }, [hasTimedOut]);

    // Auto-advance when all players are ready OR timeout occurs
    React.useEffect(() => {
        if (completionStatus?.allCompleted || hasTimedOut) {
            // Small delay to show the completion message
            const timer = setTimeout(() => {
                onNextClicked();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [completionStatus?.allCompleted, hasTimedOut, onNextClicked]);

    if (!completionStatus) {
        return (
            <div className="max-w-2xl mx-auto my-10 bg-white rounded-xl p-8 shadow-lg font-sans text-center">
                <div className="text-lg text-gray-600">Loading...</div>
            </div>
        );
    }

    const { allCompleted, completedPlayers, humanPlayerIndices } = completionStatus;
    const remainingTime = Math.max(0, WAITING_THRESHOLD - timeElapsed);
    const remainingSeconds = Math.ceil(remainingTime / 1000);

    return (
        <div className="max-w-4xl mx-auto my-10 bg-white rounded-xl p-8 shadow-lg font-sans text-center">
            <div className="mb-8">
                <div className="text-6xl mb-6">⏳</div>
                <h1 className="text-4xl font-bold text-gray-800 mb-4">
                    {allCompleted ? "Everyone's Ready!" :
                        hasTimedOut ? "Proceeding Anyway..." :
                            `Waiting for other players${dots}`}
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed">
                    {allCompleted
                        ? "All players have completed their surveys. Proceeding to results..."
                        : hasTimedOut
                            ? "Timeout reached. Moving to results with available data..."
                            : "Please wait while other players finish their survey responses."
                    }
                </p>

                {/* Timeout countdown */}
                {!allCompleted && !hasTimedOut && (
                    <div className="mt-4 text-lg text-orange-600">
                        Will proceed automatically in {remainingSeconds} seconds
                    </div>
                )}
            </div>

            {/* Progress indicator */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
                <h2 className="text-2xl font-semibold text-gray-800 mb-6">Survey Progress</h2>
                <div className="flex justify-center space-x-8">
                    {humanPlayerIndices.map(playerIndex => {
                        const isCompleted = completedPlayers.includes(playerIndex);
                        const isCurrentPlayer = playerIndex === getCurrentPlayerIndex(gameResults);
                        const isReplaced = completionStatus.replacedPlayerIndices.includes(playerIndex);

                        return (
                            <div key={playerIndex} className="flex flex-col items-center">
                                <div className="mb-2">
                                    {getPlayerSymbol(
                                        playerIndex,
                                        false,
                                        "large",
                                        isCurrentPlayer,
                                        gameResults?.achievements?.[playerIndex],
                                        dbBotCondition
                                    )}
                                </div>
                                <div className={`text-lg font-semibold ${isCompleted ? 'text-green-600' : hasTimedOut ? 'text-gray-500' : 'text-orange-500'}`}>
                                    {isCompleted ? "✓ Done" : hasTimedOut ? "⏰ Timed Out" : "⏳ Working..."}
                                </div>
                                {isReplaced && (
                                    <div className="text-xs text-gray-500 mt-1">(Replaced by Bot)</div>
                                )}
                            </div>
                        );
                    })}
                    {[1, 3].map(playerIndex => {
                        return (
                            <div key={playerIndex} className="flex flex-col items-center">
                                <div className="mb-2">
                                    {getPlayerSymbol(
                                        playerIndex,
                                        false,
                                        "large",
                                        false,
                                        gameResults?.achievements?.[playerIndex],
                                        dbBotCondition
                                    )}
                                </div>
                                <div className={`text-lg font-semibold text-green-600`}>
                                    {"✓ Done"}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {(allCompleted || hasTimedOut) && (
                <div className={`border rounded-xl p-6 ${allCompleted ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className={`text-2xl mb-2 ${allCompleted ? 'text-green-600' : 'text-orange-600'}`}>
                        {allCompleted ? '🎉' : '⏰'}
                    </div>
                    <h3 className={`text-xl font-semibold mb-2 ${allCompleted ? 'text-green-800' : 'text-orange-800'}`}>
                        {allCompleted ? 'All Set!' : 'Timeout Reached!'}
                    </h3>
                    <p className={allCompleted ? 'text-green-700' : 'text-orange-700'}>
                        {allCompleted
                            ? 'Redirecting to the final results page in a moment...'
                            : 'Proceeding to results with available survey data...'
                        }
                    </p>
                </div>
            )}
        </div>
    );
};

const GameResultsPage: React.FC<FormComponentProps> = ({ onNextClicked, gameResults, gameActions, game, gameId }) => {
    // Use real achievements if available, otherwise fallback to mock data
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const achievements = gameResults?.achievements || {
        0: { stars: 7, locks: 2, unlocks: 1 },
        1: { stars: 4, locks: 1, unlocks: 3 },
        2: { stars: 3, locks: 3, unlocks: 0 },
        3: { stars: 2, locks: 0, unlocks: 2 },
    };

    const currentPlayerIndex = getCurrentPlayerIndex(gameResults);

    // Fetch distribution data from database
    const distributions = useQuery(api.game.getDistributions, gameId ? { gameId } : "skip");

    // Helper function to convert database distributions to matrix format
    const buildDistributionMatrix = () => {
        // Initialize empty matrix
        const matrix: Record<number, Record<number, number>> = {
            0: { 0: 0, 1: 0, 2: 0, 3: 0 },
            1: { 0: 0, 1: 0, 2: 0, 3: 0 },
            2: { 0: 0, 1: 0, 2: 0, 3: 0 },
            3: { 0: 0, 1: 0, 2: 0, 3: 0 },
        };

        // Fill matrix with database data if available
        if (distributions) {
            distributions.forEach(distribution => {
                const distributorIndex = distribution.distributorPlayerIndex;
                distribution.distributions.forEach(dist => {
                    const recipientIndex = dist.recipientPlayerIndex;
                    const points = dist.pointsGiven;
                    matrix[distributorIndex][recipientIndex] = points;
                });
            });
        }

        // If no distributions data at all, return mock data for testing
        if (!distributions || distributions.length === 0) {
            return {
                0: { 0: 0, 1: 8, 2: 6, 3: 4 },
                1: { 0: 20, 1: 0, 2: 0, 3: 0 },
                2: { 0: 0, 1: 0, 2: 0, 3: 5 },
                3: { 0: 0, 1: 0, 2: 5, 3: 0 },
            };
        }

        return matrix;
    };

    const distributionMatrix = buildDistributionMatrix();

    // Helper function to check if a player completed their distribution
    const hasPlayerCompletedDistribution = (playerIndex: number) => {
        if (!distributions) return false;

        // Get all distributions for this player as distributor
        const playerDistributions = distributions.filter(
            distribution => distribution.distributorPlayerIndex === playerIndex
        );

        // Check if player has completed both phases:
        // 1. Team reward distribution (isTeamReward: true)
        // 2. Other team distribution (isTeamReward: false)
        const hasTeamReward = playerDistributions.some(dist => dist.isTeamReward === true);
        const hasOtherTeamReward = playerDistributions.some(dist => dist.isTeamReward === false);

        return hasTeamReward && hasOtherTeamReward;
    };

    // Calculate total scores (this would include base game points + bonus points from distributions)
    // Calculate base scores as the proportion of stars out of total stars, scaled to 100
    const totalStars = achievements[0].stars + achievements[1].stars + achievements[2].stars + achievements[3].stars;
    const baseScores = {
        0: totalStars > 0 ? Math.round((achievements[0].stars / totalStars) * 100) : 0,
        1: totalStars > 0 ? Math.round((achievements[1].stars / totalStars) * 100) : 0,
        2: totalStars > 0 ? Math.round((achievements[2].stars / totalStars) * 100) : 0,
        3: totalStars > 0 ? Math.round((achievements[3].stars / totalStars) * 100) : 0,
    };

    // Mock bonus points for demonstration (these would come from the distribution phases)
    const bonusPoints = {
        0: distributionMatrix[0][0] + distributionMatrix[0][1] + distributionMatrix[0][2] + distributionMatrix[0][3],
        1: distributionMatrix[1][0] + distributionMatrix[1][1] + distributionMatrix[1][2] + distributionMatrix[1][3],
        2: distributionMatrix[2][0] + distributionMatrix[2][1] + distributionMatrix[2][2] + distributionMatrix[2][3],
        3: distributionMatrix[3][0] + distributionMatrix[3][1] + distributionMatrix[3][2] + distributionMatrix[3][3],
    };

    const finalScores = {
        0: baseScores[0] + bonusPoints[0],
        1: baseScores[1] + bonusPoints[1],
        2: baseScores[2] + bonusPoints[2],
        3: baseScores[3] + bonusPoints[3],
    };

    // Create sorted player list for leaderboard
    const playerList = [
        { playerIndex: 0, baseScore: baseScores[0], bonusPoints: bonusPoints[0], finalScore: finalScores[0], achievements: achievements[0] },
        { playerIndex: 1, baseScore: baseScores[1], bonusPoints: bonusPoints[1], finalScore: finalScores[1], achievements: achievements[1] },
        { playerIndex: 2, baseScore: baseScores[2], bonusPoints: bonusPoints[2], finalScore: finalScores[2], achievements: achievements[2] },
        { playerIndex: 3, baseScore: baseScores[3], bonusPoints: bonusPoints[3], finalScore: finalScores[3], achievements: achievements[3] },
    ].sort((a, b) => b.finalScore - a.finalScore);

    // Determine team standings
    const team1Score = finalScores[0] + finalScores[1];
    const team2Score = finalScores[2] + finalScores[3];
    const winnerTeam = gameResults?.winnerTeam || (team1Score > team2Score ? 1 : 2);

    // Add state for survey responses
    const [fairnessRatings, setFairnessRatings] = React.useState<Record<number, string>>({});
    const [generosityRatings, setGenerosityRatings] = React.useState<Record<number, string>>({});
    const [reasoningResponses, setReasoningResponses] = React.useState<Record<number, string>>({});
    const [isSubmittingSurvey, setIsSubmittingSurvey] = React.useState(false);
    const [validationError, setValidationError] = React.useState<string>('');

    // Add time tracking for quick submission prevention
    const [startTime, setStartTime] = React.useState<number | null>(null);
    const [hasBeenWarned, setHasBeenWarned] = React.useState(false);
    const [showQuickSubmitWarning, setShowQuickSubmitWarning] = React.useState(false);

    // Add notification state for new distribution data
    const [prevDistributionCount, setPrevDistributionCount] = React.useState(0);
    const [showNotification, setShowNotification] = React.useState(false);
    const [notificationMessage, setNotificationMessage] = React.useState("");

    // Track distribution data changes and show notifications (more visible, error fixed)
    React.useEffect(() => {
        if (distributions) {
            // Count only the players who have completed their distribution
            const completedCount = [0, 1, 2, 3].filter(idx => hasPlayerCompletedDistribution(idx)).length;

            // If we have more completed distributions than before, show notification
            if (prevDistributionCount > 0 && completedCount > prevDistributionCount) {
                setNotificationMessage(
                    `🎉 New bonus points are available from the second user! Results have been updated.`
                );
                setShowNotification(true);

                // Auto-hide notification after 8 seconds (increased for better visibility)
                setTimeout(() => {
                    setShowNotification(false);
                }, 8000);
            }

            // Update previous count
            setPrevDistributionCount(completedCount);
        }
    }, [distributions, prevDistributionCount, hasPlayerCompletedDistribution]);

    // Set start time when component mounts and there are ratings to be done
    React.useEffect(() => {
        const playersRequiringRatings = [0, 1, 2, 3].filter(playerIndex => hasPlayerCompletedDistribution(playerIndex));
        if (startTime === null && playersRequiringRatings.length > 0) {
            setStartTime(Date.now());
        }
    }, [startTime, hasPlayerCompletedDistribution]);

    // Add mutation for saving survey ratings
    const saveSurveyRatings = useMutation(api.game.saveSurveyRatings);

    // Get list of players who have completed distribution and need ratings
    const getPlayersRequiringRatings = () => {
        return [0, 1, 2, 3].filter(playerIndex => hasPlayerCompletedDistribution(playerIndex));
    };

    // Validation function to check if all required ratings are completed
    const areAllRatingsCompleted = () => {
        const playersRequiringRatings = getPlayersRequiringRatings();

        // If no players have completed distribution yet, allow proceeding
        if (playersRequiringRatings.length === 0) {
            return true;
        }

        // Check that all players who completed distribution have both fairness and generosity ratings
        const allFairnessCompleted = playersRequiringRatings.every(playerIndex =>
            fairnessRatings[playerIndex] && fairnessRatings[playerIndex].trim() !== ''
        );

        const allGenerosityCompleted = playersRequiringRatings.every(playerIndex =>
            generosityRatings[playerIndex] && generosityRatings[playerIndex].trim() !== ''
        );

        // Check that all players who completed distribution have reasoning responses with at least one word
        const allReasoningCompleted = playersRequiringRatings.every(playerIndex => {
            const response = reasoningResponses[playerIndex];
            return response && response.trim().split(/\s+/).filter(word => word.length > 0).length >= 1;
        });

        return allFairnessCompleted && allGenerosityCompleted && allReasoningCompleted;
    };

    const handleContinue = async () => {
        // Clear any previous validation errors
        setValidationError('');

        // Check if user is submitting too quickly (less than 5 seconds)
        if (startTime && !hasBeenWarned) {
            const timeSpent = Date.now() - startTime;
            if (timeSpent < 10000) { // Less than 5 seconds
                setShowQuickSubmitWarning(true);
                return;
            }
        }

        // Validate that all required ratings are completed
        if (!areAllRatingsCompleted()) {
            const playersRequiringRatings = getPlayersRequiringRatings();
            const missingFairness = playersRequiringRatings.filter(playerIndex =>
                !fairnessRatings[playerIndex] || fairnessRatings[playerIndex].trim() === ''
            );
            const missingGenerosity = playersRequiringRatings.filter(playerIndex =>
                !generosityRatings[playerIndex] || generosityRatings[playerIndex].trim() === ''
            );
            const missingReasoning = playersRequiringRatings.filter(playerIndex => {
                const response = reasoningResponses[playerIndex];
                return !response || response.trim().split(/\s+/).filter(word => word.length > 0).length < 1;
            });

            let errorMessage = 'Please complete all required ratings before proceeding:\n';
            if (missingFairness.length > 0) {
                errorMessage += `Missing fairness ratings for Player ${missingFairness.map(p => p + 1).join(', Player ')}\n`;
            }
            if (missingGenerosity.length > 0) {
                errorMessage += `Missing generosity ratings for Player ${missingGenerosity.map(p => p + 1).join(', Player ')}\n`;
            }
            if (missingReasoning.length > 0) {
                errorMessage += `Missing reasoning responses for Player ${missingReasoning.map(p => p + 1).join(', Player ')}`;
            }

            setValidationError(errorMessage);

            // Scroll to the first missing rating
            const firstMissingPlayer = missingFairness.length > 0 ? missingFairness[0] :
                missingGenerosity.length > 0 ? missingGenerosity[0] :
                    missingReasoning.length > 0 ? missingReasoning[0] : undefined;
            if (firstMissingPlayer !== undefined) {
                const element = document.querySelector(`[data-player-ratings="${firstMissingPlayer}"]`);
                if (element) {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }
            return;
        }

        // Check if gameId is available for saving survey data
        if (gameId) {
            setIsSubmittingSurvey(true);

            try {
                // Save fairness ratings if any exist
                const fairnessEntries = Object.entries(fairnessRatings);
                if (fairnessEntries.length > 0) {
                    await saveSurveyRatings({
                        gameId,
                        ratingType: "fairness",
                        ratings: fairnessEntries.map(([playerIndex, rating]) => ({
                            targetPlayerIndex: Number(playerIndex),
                            rating,
                        })),
                    });
                }

                // Save generosity ratings if any exist
                const generosityEntries = Object.entries(generosityRatings);
                if (generosityEntries.length > 0) {
                    await saveSurveyRatings({
                        gameId,
                        ratingType: "generosity",
                        ratings: generosityEntries.map(([playerIndex, rating]) => ({
                            targetPlayerIndex: Number(playerIndex),
                            rating,
                        })),
                    });
                }

                // Save reasoning responses as additional feedback for fairness ratings
                const reasoningEntries = Object.entries(reasoningResponses).filter(([_, response]) => response.trim());
                if (reasoningEntries.length > 0) {
                    for (const [playerIndex, reasoning] of reasoningEntries) {
                        await saveSurveyRatings({
                            gameId,
                            ratingType: "fairness", // Associate reasoning with fairness for now
                            ratings: [], // No ratings, just feedback
                            additionalFeedback: `Player ${Number(playerIndex)} distribution reasoning: ${reasoning}`,
                        });
                    }
                }

                console.log("Survey responses saved successfully");
            } catch (error) {
                console.error("Failed to save survey responses:", error);
                // Don't block the user, continue anyway
            } finally {
                setIsSubmittingSurvey(false);
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNextClicked();
    };

    // Create a function to render distribution details for a single player
    const renderPlayerDistributionDetails = (playerIndex: number) => {
        const player = playerList.find(p => p.playerIndex === playerIndex);
        if (!player) return null;

        const isCurrentPlayer = player.playerIndex === currentPlayerIndex;
        const isTeam1 = player.playerIndex === 0 || player.playerIndex === 1;

        // What this player gave to others
        const givenToOthers = Object.entries(distributionMatrix[player.playerIndex] || {})
            .filter(([recipientIndex, points]) => Number(recipientIndex) !== player.playerIndex && Number(points) > 0)
            .map(([recipientIndex, points]) => ({ recipientIndex: Number(recipientIndex), points: Number(points) }));

        // What this player received from others
        const receivedFromOthers = Object.entries(distributionMatrix)
            .filter(([giver, distributions]) => {
                const dist = distributions as Record<number, number>;
                return dist[player.playerIndex] > 0;
            })
            .map(([giver, distributions]) => {
                const dist = distributions as Record<number, number>;
                return { giverIndex: Number(giver), points: dist[player.playerIndex] };
            });

        const totalGiven = givenToOthers.reduce((sum, item) => sum + item.points, 0);
        const totalReceived = receivedFromOthers.reduce((sum, item) => sum + item.points, 0);

        // Handle rating changes
        const handleFairnessRating = (value: string) => {
            // Set start time on first interaction
            if (startTime === null) {
                setStartTime(Date.now());
            }
            setFairnessRatings(prev => ({ ...prev, [player.playerIndex]: value }));
            // Don't clear validation error automatically - only clear on form submit
        };

        const handleGenerosityRating = (value: string) => {
            // Set start time on first interaction
            if (startTime === null) {
                setStartTime(Date.now());
            }
            setGenerosityRatings(prev => ({ ...prev, [player.playerIndex]: value }));
            // Don't clear validation error automatically - only clear on form submit
        };

        const handleReasoningChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            // Set start time on first interaction
            if (startTime === null) {
                setStartTime(Date.now());
            }
            setReasoningResponses(prev => ({ ...prev, [player.playerIndex]: e.target.value }));
            // Don't clear validation error automatically - only clear on form submit
        };

        // Check if this player has required ratings
        const hasFairnessRating = fairnessRatings[player.playerIndex] && fairnessRatings[player.playerIndex].trim() !== '';
        const hasGenerosityRating = generosityRatings[player.playerIndex] && generosityRatings[player.playerIndex].trim() !== '';
        const hasReasoningResponse = reasoningResponses[player.playerIndex] &&
            reasoningResponses[player.playerIndex].trim().split(/\s+/).filter(word => word.length > 0).length >= 1;
        const hasIncompleteRatings = !hasFairnessRating || !hasGenerosityRating || !hasReasoningResponse;

        return (
            <div key={player.playerIndex} data-player-ratings={player.playerIndex} className={`border-2 rounded-lg p-2 shadow-md ${hasIncompleteRatings && validationError ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-gray-50'}`}>
                {/* Header Row */}
                <div className="flex items-center justify-center mb-4 border-b border-gray-200 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="text-lg font-semibold text-gray-700">Bonus given by Player {player.playerIndex + 1}</div>
                        {/* Player icon with achievement badges */}
                        <div className="relative">
                            {getPlayerSymbol(player.playerIndex, false, "medium", isCurrentPlayer, achievements[player.playerIndex], dbBotCondition)}
                        </div>
                        {/* <div className="text-lg font-semibold text-gray-700">gave to others:</div> */}
                    </div>
                </div>

                {/* Distribution Details */}
                <div className="mb-4">


                    {/* Recipients in a row */}
                    <div className="flex justify-center items-end gap-8 mb-6">
                        {[0, 1, 2, 3]
                            // .filter(recipientIndex => recipientIndex !== player.playerIndex) // Don't show self
                            .map(recipientIndex => {
                                const points = (distributionMatrix[player.playerIndex] as Record<number, number>)?.[recipientIndex] || 0;
                                const isTeam1 = recipientIndex === 0 || recipientIndex === 1;
                                const playerTeam = player.playerIndex === 0 || player.playerIndex === 1 ? 1 : 2;
                                const recipientTeam = isTeam1 ? 1 : 2;
                                const isSameTeam = playerTeam === recipientTeam;

                                // Determine point type and total available
                                let pointType = "";
                                let totalAvailable = 0;
                                let pointColor = "";

                                // Determine if recipient is on winning team or losing team
                                const winnerTeam = gameResults?.winnerTeam || 1;
                                const isRecipientOnWinnerTeam = recipientTeam === winnerTeam;

                                if (isRecipientOnWinnerTeam) {
                                    // Distributing to winner team - 20 points available
                                    pointType = "winner points";
                                    totalAvailable = 20;
                                    pointColor = "text-green-600";
                                } else {
                                    // Distributing to loser team - 10 points available
                                    pointType = "loser points";
                                    totalAvailable = 10;
                                    pointColor = "text-green-600";
                                }

                                return (
                                    <div key={recipientIndex} className="flex flex-col items-center min-h-40 mx-2">
                                        {/* Arrow pointing down to recipient */}
                                        <div className="text-gray-400 text-2xl mb-2">↓ </div>

                                        {/* Recipient player symbol */}
                                        <div className="mb-3">
                                            {getPlayerSymbol(recipientIndex, false, "medium", recipientIndex === currentPlayerIndex, gameResults?.achievements?.[recipientIndex], dbBotCondition)}
                                        </div>

                                        {/* Points given */}
                                        <div className={`text-xl font-bold ${pointColor} mb-1`}>
                                            +{points} <span className="text-gray-500 text-sm">/ {totalAvailable}</span>
                                        </div>

                                        {/* Out of total label */}
                                        <div className="text-md text-gray-500 text-center">
                                            {recipientIndex === player.playerIndex ? "self" : ""}
                                        </div>


                                    </div>
                                );
                            })}
                    </div>

                    {/* Total given summary */}
                    {/* <div className="flex items-center justify-center bg-blue-100 rounded px-4 py-2 border-t border-blue-300">
                        <div className="text-sm font-bold text-blue-700">
                            Total Given: +{Object.entries(distributionMatrix[player.playerIndex] || {})
                                .filter(([recipientIndex]) => Number(recipientIndex) !== player.playerIndex)
                                .reduce((sum, [_, points]) => sum + Number(points), 0)} / 30
                        </div>
                    </div> */}
                </div>

                {/* Rating Questions - Only show for players who distributed points */}
                {hasPlayerCompletedDistribution(player.playerIndex) && (
                    <div>
                        <h4 className="text-lg font-semibold text-gray-700 mb-3">Please rate this player's distribution:</h4>
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                            {/* Fairness Question */}
                            <div className={`border-b border-gray-100 ${!hasFairnessRating && validationError ? 'bg-red-50' : ''}`}>
                                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                    <div className={`font-medium text-md text-left ${!hasFairnessRating && validationError ? 'text-red-700' : 'text-gray-700'}`}>
                                        How <b>fair</b> do you think this player's distribution was?<span className="text-red-500 ml-1">*</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-5 gap-0">
                                    {["Very Unfair", "Unfair", "Neutral", "Fair", "Very Fair"].map((label, index) => (
                                        <div key={index} className="p-1 font-medium text-gray-700 text-center text-xs border-r border-gray-200 bg-gray-50">
                                            {label}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-5 gap-0 hover:bg-gray-50 transition-colors">
                                    {["Very Unfair", "Unfair", "Neutral", "Fair", "Very Fair"].map((option) => (
                                        <div key={option} className="p-2 flex justify-center border-r border-gray-200">
                                            <label className="cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={`fairness-${player.playerIndex}`}
                                                    value={option}
                                                    checked={fairnessRatings[player.playerIndex] === option}
                                                    onChange={() => handleFairnessRating(option)}
                                                    className="w-5 h-5 text-lg text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Generosity Question */}
                            <div className={!hasGenerosityRating && validationError ? 'bg-red-50' : ''}>
                                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                    <div className={`font-medium text-md text-left ${!hasGenerosityRating && validationError ? 'text-red-700' : 'text-gray-700'}`}>
                                        How <b>generous</b> do you think this player was?<span className="text-red-500 ml-1">*</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-5 gap-0">
                                    {["Very Selfish", "Selfish", "Neutral", "Generous", "Very Generous"].map((label, index) => (
                                        <div key={index} className="p-1 font-medium text-gray-700 text-center text-xs border-r border-gray-200 bg-gray-50">
                                            {label}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-5 gap-0 hover:bg-gray-50 transition-colors">
                                    {["Very Selfish", "Selfish", "Neutral", "Generous", "Very Generous"].map((option) => (
                                        <div key={option} className="p-2 flex justify-center border-r border-gray-200">
                                            <label className="cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={`generosity-${player.playerIndex}`}
                                                    value={option}
                                                    checked={generosityRatings[player.playerIndex] === option}
                                                    onChange={() => handleGenerosityRating(option)}
                                                    className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Open-ended Question */}
                            <div className="border-t border-gray-200">
                                <div className={`${!hasReasoningResponse && validationError ? 'bg-red-50' : 'bg-gray-50'} px-3 py-3`}>
                                    <div className={`font-medium text-md mb-2 text-left ${!hasReasoningResponse && validationError ? 'text-red-700' : 'text-gray-700'}`}>
                                        Why do you think this user made such distribution?<span className="text-red-500 ml-1">*</span>
                                    </div>
                                    <textarea
                                        name={`reasoning-${player.playerIndex}`}
                                        rows={2}
                                        placeholder="Enter your thoughts here..."
                                        value={reasoningResponses[player.playerIndex] || ''}
                                        onChange={handleReasoningChange}
                                        className={`w-full p-2 border rounded-md text-sm leading-normal resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${!hasReasoningResponse && validationError ? 'border-red-400' : 'border-gray-300'}`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto my-10 bg-white rounded-xl p-8 shadow-lg font-sans">
            {/* Notification for new distribution data */}
            {showNotification && (
                <>
                    {/* Backdrop overlay */}
                    <div className="fixed inset-0 bg-black bg-opacity-30 z-40"></div>

                    {/* Main notification */}
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white text-blue-700 px-8 py-6 rounded-2xl shadow-2xl border border-blue-200 max-w-lg w-full">
                        <div className="text-center max-w-md">
                            <div className="text-4xl mb-3">🎉</div>
                            <div className="text-xl font-bold mb-2">{notificationMessage}</div>
                            <div className="text-sm opacity-90 mb-4">Check the updated rankings and distribution details!</div>
                            <button
                                onClick={() => setShowNotification(false)}
                                className="bg-white text-blue-600 hover:text-blue-800 font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                            >
                                Got it!
                            </button>
                        </div>
                    </div>
                </>
            )}

            <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">🎉 Game Results Are In! 🎉</h1>

            {/* Final Rankings */}
            <div className="mb-8">
                <h2 className="text-2xl font-semibold text-center mb-6 text-gray-700">Individual Rankings</h2>
                <div className="max-w-4xl mx-auto">
                    {(() => {
                        // Calculate final scores using the same logic
                        const initialPoints: Record<number, number> = {
                            0: baseScores[0],
                            1: baseScores[1],
                            2: baseScores[2],
                            3: baseScores[3],
                        };

                        const finalPoints: Record<number, number> = { ...initialPoints };
                        Object.keys(distributionMatrix).forEach(fromPlayer => {
                            Object.keys(distributionMatrix[Number(fromPlayer)]).forEach(toPlayer => {
                                finalPoints[Number(toPlayer)] += distributionMatrix[Number(fromPlayer)][Number(toPlayer)];
                            });
                        });

                        // Create sorted ranking with team-based tiebreaker
                        const ranking = [0, 1, 2, 3]
                            .map(playerIndex => {
                                const isTeam1 = playerIndex === 0 || playerIndex === 1;
                                const playerTeam = isTeam1 ? 1 : 2;
                                const isWinnerTeam = playerTeam === winnerTeam;

                                return {
                                    playerIndex,
                                    finalScore: finalPoints[playerIndex],
                                    initialScore: initialPoints[playerIndex],
                                    bonusReceived: finalPoints[playerIndex] - initialPoints[playerIndex],
                                    isWinnerTeam,
                                    team: playerTeam
                                };
                            })
                            .sort((a, b) => {
                                // Primary sort: by final score (descending)
                                if (a.finalScore !== b.finalScore) {
                                    return b.finalScore - a.finalScore;
                                }
                                // Tiebreaker: winner team players rank higher than loser team players
                                if (a.isWinnerTeam !== b.isWinnerTeam) {
                                    return a.isWinnerTeam ? -1 : 1; // Winner team first
                                }
                                // Final tiebreaker: by player index (for consistency)
                                return a.playerIndex - b.playerIndex;
                            });

                        return (
                            <div className="space-y-3">
                                {ranking.map((player, rank) => {
                                    const isCurrentPlayer = player.playerIndex === currentPlayerIndex;
                                    const rankEmoji = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '🏅';

                                    // Determine if this is the higher ranked human player
                                    const humanPlayers = ranking.filter(p => p.playerIndex === 0 || p.playerIndex === 2);
                                    const isHigherRankedHuman = humanPlayers.length > 0 &&
                                        (player.playerIndex === 0 || player.playerIndex === 2) &&
                                        player.playerIndex === humanPlayers[0].playerIndex;

                                    return (
                                        <div key={player.playerIndex} className={`flex items-center justify-between p-4 rounded-lg border-2 shadow-md ${isCurrentPlayer ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className="text-4xl">{rankEmoji}</div>
                                                <div className="text-xl font-bold text-gray-600 mr-6">#{rank + 1}</div>
                                                {getPlayerSymbol(player.playerIndex, false, "medium", isCurrentPlayer, achievements[player.playerIndex], dbBotCondition)}
                                                {isHigherRankedHuman && (
                                                    <div className="bg-green-100 border border-green-300 rounded-lg px-3 py-1 ml-2 mr-1">
                                                        <div className="text-xs font-semibold text-green-700 flex items-center gap-1">
                                                            <span>💰</span>
                                                            <span>+15% Prolific Bonus!</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-6">
                                                <div className="text-right">
                                                    <div className="text-sm text-gray-500">Initial</div>
                                                    <div className="text-lg font-semibold text-gray-700">{player.initialScore}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm text-gray-500">Bonus</div>
                                                    <div className="text-lg font-semibold text-green-600">+{player.bonusReceived}</div>
                                                </div>
                                                <div className="text-right border-l-2 border-gray-200 pl-4">
                                                    <div className="text-sm text-gray-500">Final Score</div>
                                                    <div className="text-2xl font-bold text-red-500">
                                                        {player.finalScore}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm text-gray-500">Team</div>
                                                    <div className={`text-lg font-semibold ${player.isWinnerTeam ? 'text-yellow-600' : 'text-red-600'}`}>
                                                        {player.isWinnerTeam ? '🏆' : '🥈'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Distribution Details for All Players */}
            <div className="mb-8">
                <h2 className="text-2xl font-semibold text-center mb-6 text-gray-700">Distribution details of all users</h2>

                {/* Team 1 Row */}
                <div className="mb-6">
                    <h3 className="text-xl font-semibold text-center mb-4 text-purple-600">Team 1</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Player 0 */}
                        {hasPlayerCompletedDistribution(0) ? (
                            renderPlayerDistributionDetails(0)
                        ) : (
                            <div className="border-2 rounded-lg p-6 shadow-md border-gray-300 bg-gray-50 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="mb-4 flex justify-center items-center">
                                        {getPlayerSymbol(0, false, "medium", 0 === currentPlayerIndex, achievements[0], dbBotCondition)}
                                    </div>
                                    <div className="text-gray-500 text-lg font-medium">
                                        Player 1 didn't complete distribution yet
                                    </div>
                                    <div className="text-gray-400 text-sm mt-2">
                                        No distribution data available
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Player 1 */}
                        {hasPlayerCompletedDistribution(1) ? (
                            renderPlayerDistributionDetails(1)
                        ) : (
                            <div className="border-2 rounded-lg p-6 shadow-md border-gray-300 bg-gray-50 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="mb-4 flex justify-center items-center">
                                        {getPlayerSymbol(1, false, "medium", false, achievements[1], dbBotCondition)}
                                    </div>
                                    <div className="text-gray-500 text-lg font-medium">
                                        Player 2 didn't complete distribution yet
                                    </div>
                                    <div className="text-gray-400 text-sm mt-2">
                                        No distribution data available
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Team 2 Row */}
                <div className="mb-6">
                    <h3 className="text-xl font-semibold text-center mb-4 text-orange-600">Team 2</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Player 2 */}
                        {hasPlayerCompletedDistribution(2) ? (
                            renderPlayerDistributionDetails(2)
                        ) : (
                            <div className="border-2 rounded-lg p-6 shadow-md border-gray-300 bg-gray-50 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="mb-4 flex justify-center items-center">
                                        {getPlayerSymbol(2, false, "medium", 2 === currentPlayerIndex, achievements[2], dbBotCondition)}
                                    </div>
                                    <div className="text-gray-500 text-lg font-medium">
                                        Player 3 didn't complete distribution yet
                                    </div>
                                    <div className="text-gray-400 text-sm mt-2">
                                        No distribution data available
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Player 3 */}
                        {hasPlayerCompletedDistribution(3) ? (
                            renderPlayerDistributionDetails(3)
                        ) : (
                            <div className="border-2 rounded-lg p-6 shadow-md border-gray-300 bg-gray-50 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="mb-4 flex justify-center items-center">
                                        {getPlayerSymbol(3, false, "medium", false, achievements[3], dbBotCondition)}
                                    </div>
                                    <div className="text-gray-500 text-lg font-medium">
                                        Player 4 didn't complete distribution yet
                                    </div>
                                    <div className="text-gray-400 text-sm mt-2">
                                        No distribution data available
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Continue Button */}
            <div className="text-center">
                <button
                    onClick={handleContinue}
                    disabled={isSubmittingSurvey}
                    className={`font-semibold py-4 px-10 rounded-lg text-lg shadow-lg transition-colors duration-200 ${isSubmittingSurvey
                        ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white transform hover:scale-105'
                        }`}
                >
                    {isSubmittingSurvey ? 'Saving Responses...' : 'Submit'}
                </button>
            </div>

            {/* Quick Submit Warning Modal */}
            {showQuickSubmitWarning && (
                <>
                    {/* Backdrop overlay */}
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50"></div>

                    {/* Warning Modal */}
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full mx-4">
                        <div className="p-8 text-center">
                            <div className="text-6xl mb-4">⚠️</div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Quick Submission Detected</h2>
                            <p className="text-gray-600 leading-relaxed mb-6">
                                You completed this survey very quickly (in less than 5 seconds).
                                Please take time to read the questions carefully and provide thoughtful responses.
                            </p>
                            <p className="text-sm text-gray-500 mb-8">
                                Quality responses help us better understand player behavior and improve the experience for everyone.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={() => {
                                        setShowQuickSubmitWarning(false);
                                        // Scroll to first incomplete section for review
                                        const playersRequiringRatings = getPlayersRequiringRatings();
                                        if (playersRequiringRatings.length > 0) {
                                            const element = document.querySelector(`[data-player-ratings="${playersRequiringRatings[0]}"]`);
                                            if (element) {
                                                element.scrollIntoView({
                                                    behavior: 'smooth',
                                                    block: 'center'
                                                });
                                            }
                                        }
                                    }}
                                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors duration-200"
                                >
                                    Review Questions
                                </button>

                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};



