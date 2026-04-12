import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, useParams } from "react-router";
import { Id } from "../../convex/_generated/dataModel";
import { GuidedTutorial } from "../components/GuidedTutorial";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faRobot } from "@fortawesome/free-solid-svg-icons";

export function WaitingPage() {
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const { gameId } = useParams();
    const navigate = useNavigate();
    const markPlayerDisconnected = useMutation(api.game.markPlayerDisconnected);
    const confirmReady = useMutation(api.game.confirmReady);
    const updateActivity = useMutation(api.game.updatePlayerActivity);
    const manualCleanupStaleGames = useMutation(api.game.manualCleanupStaleGames);
    const game = useQuery(api.game.getGame, gameId ? { gameId: gameId as Id<"games"> } : "skip");
    const botInfo = useQuery(
        api.game.getBotInfo,
        (gameId && game && game._id !== "tutorial_game") ? { gameId: gameId as Id<"games"> } : "skip"
    );
    const [showTutorial, setShowTutorial] = useState(false); // change this to true to show tutorial
    const [cleanupAttempted, setCleanupAttempted] = useState(false);
    const [waitStartTime] = useState(Date.now());
    const [isRedirectingToThankYou, setIsRedirectingToThankYou] = useState(false);
    const [countdown, setCountdown] = useState(60);

    // 5-minute timeout redirect
    useEffect(() => {
        const TIMEOUT_DURATION = 5 * 60 * 1000; // 20 seconds for testing (change to 5 * 60 * 1000 for 5 minutes)

        const timeoutId = setTimeout(async () => {
            // Set flag to prevent home redirect
            setIsRedirectingToThankYou(true);

            // Always navigate to thank-you page after timeout
            try {
                // Clean up game state if it still exists and gameId is available
                if (gameId) {
                    await markPlayerDisconnected({
                        gameId: gameId as Id<"games">,
                        reason: "leave_game"
                    });
                }
            } catch (error) {
                console.error("Failed to mark player disconnected on timeout:", error);
            } finally {
                // Always navigate to thank you page regardless of cleanup success
                navigate("/thank-you");
            }
        }, TIMEOUT_DURATION);

        // Clean up timeout if component unmounts
        return () => clearTimeout(timeoutId);
    }, [gameId, markPlayerDisconnected, navigate]); // Removed game?.status from dependencies

    // Clean up stale games when component loads
    useEffect(() => {
        if (!cleanupAttempted) {
            setCleanupAttempted(true);
            manualCleanupStaleGames().catch(console.error);
        }
    }, [manualCleanupStaleGames, cleanupAttempted]);

    // Insert timeout effect
    useEffect(() => {
        if (!gameId || !game || game.status !== "matched") return;

        // Determine if current player has already confirmed
        const allPlayers = [...game.team1, ...game.team2];
        const currentPlayerId = allPlayers[game.playerIndex];
        const currentReady = game.playersReady?.find(p => p.playerId === currentPlayerId)?.isReady || false;

        if (currentReady) return; // no countdown needed if already confirmed

        // Reset countdown and start timers
        setCountdown(60);
        const interval = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);

        const timeout = setTimeout(async () => {
            try {
                await markPlayerDisconnected({
                    gameId: gameId as Id<"games">,
                    reason: "leave_game",
                });
            } catch (error) {
                console.error("Failed to mark player disconnected after confirm timeout:", error);
            } finally {
                navigate("/thank-you");
            }
        }, 60000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [game?.status, game?.playersReady, gameId, markPlayerDisconnected, navigate, game?.playerIndex]);

    // Helper function to get player icon and color (same logic as GameBoard)
    const getPlayerIcon = (playerIndex: number) => {
        // Players 0 and 2 are users, players 1 and 3 are bots
        const isBot = playerIndex === 1 || playerIndex === 3;
        const isTeam1 = playerIndex === 0 || playerIndex === 1;

        return {
            icon: isBot ? faRobot : faUser,
            color: isTeam1 ? "text-purple-500" : "text-orange-500",
            borderColor: isTeam1 ? "border-purple-500" : "border-orange-500",
            teamName: isTeam1 ? "Purple Team" : "Orange Team",
            isBot: dbBotCondition === "unaware" ? false : isBot,
        };
    };

    // Helper function to render player symbol
    const getPlayerSymbol = (playerIndex: number) => {
        // Check if bots should be displayed with card suits instead of user/robot icons
        const shouldUseSuitSymbols = dbBotCondition === "unaware";

        const { icon, color, borderColor, isBot } = getPlayerIcon(playerIndex);
        const isTeam1 = playerIndex === 0 || playerIndex === 1;

        // Team 1 gets circles, Team 2 gets squares
        const containerClasses = `w-12 h-12 bg-white border-4 ${borderColor} ${isTeam1 ? "rounded-full" : ""} flex items-center justify-center shadow-sm`;

        if (shouldUseSuitSymbols) {
            // Use card suits for unaware condition
            const suitSymbols = ["♠", "♥", "♦", "♣"]; // spades, hearts, diamonds, clubs
            const suitColors = ["text-purple-500", "text-purple-500", "text-orange-500", "text-orange-500"]; // traditional card colors

            return (
                <div className={containerClasses}>
                    <span className={`text-2xl font-bold ${suitColors[playerIndex]}`}>
                        {suitSymbols[playerIndex]}
                    </span>
                </div>
            );
        } else {
            // Use original user/robot icons for aware condition
            return (
                <div className={containerClasses}>
                    <FontAwesomeIcon icon={icon} className={`text-lg ${color}`} />
                </div>
            );
        }
    };

    // Redirect to game when it starts
    useEffect(() => {
        if (game && game.status === "active") {
            navigate(`/game/${gameId}`);
        }
    }, [game?.status, gameId, navigate]);

    // Activity tracking
    useEffect(() => {
        if (!gameId || !game) return;

        const activityInterval = setInterval(() => {
            updateActivity({ gameId: gameId as Id<"games"> }).catch(console.error);
        }, 15000);

        updateActivity({ gameId: gameId as Id<"games"> }).catch(console.error);

        return () => clearInterval(activityInterval);
    }, [gameId, game?.status, updateActivity]);

    // Window close detection
    useEffect(() => {
        if (!gameId) return;

        const handleBeforeUnload = () => {
            if (navigator.sendBeacon) {
                const data = JSON.stringify({ gameId, reason: "window_close" });
                navigator.sendBeacon('/api/player-disconnect', data);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [gameId]);

    const handleConfirmReady = async () => {
        if (!gameId) return;
        try {
            await confirmReady({ gameId: gameId as Id<"games"> });
        } catch (error) {
            console.error("Failed to confirm ready:", error);
        }
    };

    const handleLeaveQueue = async () => {
        if (gameId) {
            try {
                await markPlayerDisconnected({
                    gameId: gameId as Id<"games">,
                    reason: "leave_game"
                });
                navigate("/");
            } catch (error) {
                console.error("Failed to leave game:", error);
            }
        }
    };

    const handleTutorialComplete = () => {
        setShowTutorial(false);
    };

    const handleShowTutorial = () => {
        setShowTutorial(true);
    };

    // Show tutorial if requested
    if (showTutorial) {
        return <GuidedTutorial onComplete={handleTutorialComplete} />;
    }

    // Show confirmation screen when players are matched
    if (game && game.status === "matched") {
        // Validate that we actually have two human players before showing matched screen
        const allPlayers = [...game.team1, ...game.team2];
        const humanPlayers = allPlayers.filter(playerId =>
            playerId !== "bot1" && playerId !== "bot2" && playerId !== "bot3" &&
            !playerId.startsWith("bot_replacement_")
        );

        // If we don't have 2 human players, this is likely a stale matched game
        if (humanPlayers.length < 2) {
            console.warn("Matched game found but doesn't have 2 human players:", {
                gameId,
                humanPlayers,
                allPlayers,
                game
            });

            // Try to clean up and redirect
            markPlayerDisconnected({
                gameId: gameId as Id<"games">,
                reason: "leave_game"
            }).then(() => {
                navigate("/");
            }).catch(console.error);

            return (
                <div className="flex justify-center items-center min-h-[200px]">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                        <p className="text-gray-600">Cleaning up game state...</p>
                    </div>
                </div>
            );
        }

        // Find current user's ready state and other player's ready state
        const currentPlayerIndex = game.playerIndex;
        const currentPlayerId = allPlayers[currentPlayerIndex];

        const currentPlayerReady = game.playersReady?.find(p => p.playerId === currentPlayerId)?.isReady || false;
        const otherPlayerReady = game.playersReady?.find(p => p.playerId !== currentPlayerId)?.isReady || false;
        const bothPlayersReady = game.playersReady?.every(p => p.isReady) || false;

        return (
            <div className="text-center">
                <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
                    <div className="mb-6">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <div className="text-2xl">🎉</div>
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-gray-800">Players Matched!</h2>
                        <p className="text-gray-600 mb-4">
                            We found another team for you to play with. Here's how your teams will look:
                        </p>
                    </div>

                    {/* Player Preview Section */}
                    <div className="mb-6 bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4 text-gray-700">Your Team Setup</h3>
                        <div className="flex justify-center gap-8">
                            {/* Team 1 - Purple */}
                            <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-purple-200">
                                <div className="text-sm font-bold text-purple-600 mb-3">Purple Team</div>
                                <div className="flex flex-col gap-3">
                                    {[0, 1].map(playerIndex => {
                                        const { isBot } = getPlayerIcon(playerIndex);
                                        const isCurrentPlayer = playerIndex === currentPlayerIndex;
                                        return (
                                            <div key={playerIndex} className="flex items-center gap-2">
                                                <div className="relative flex flex-col items-center">
                                                    <div className="flex items-center justify-center w-full h-full">
                                                        {getPlayerSymbol(playerIndex)}
                                                    </div>
                                                    {isCurrentPlayer && (
                                                        <div className="current-player-indicator top-10 absolute z-10 text-red-500 text-lg font-bold animate-bounce mt-0.5">
                                                            ▲
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-sm">
                                                    <div className={`font-medium ${isCurrentPlayer ? 'text-blue-600' : 'text-gray-700'}`}>
                                                        {isCurrentPlayer ? 'You' : isBot ? 'Bot' : 'Player'}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {isBot ? '🤖' : '👤'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="text-gray-400 text-2xl flex items-center">vs</div>

                            {/* Team 2 - Orange */}
                            <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-orange-200">
                                <div className="text-sm font-bold text-orange-600 mb-3">Orange Team</div>
                                <div className="flex flex-col gap-3">
                                    {[2, 3].map(playerIndex => {
                                        const { isBot } = getPlayerIcon(playerIndex);
                                        const isCurrentPlayer = playerIndex === currentPlayerIndex;
                                        return (
                                            <div key={playerIndex} className="flex items-center gap-2">
                                                <div className="relative flex flex-col items-center">
                                                    <div className="flex items-center justify-center w-full h-full">
                                                        {getPlayerSymbol(playerIndex)}
                                                    </div>
                                                    {isCurrentPlayer && (
                                                        <div className="current-player-indicator top-10 absolute z-10 text-red-500 text-lg font-bold animate-bounce mt-0.5">
                                                            ▲
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-sm">
                                                    <div className={`font-medium ${isCurrentPlayer ? 'text-blue-600' : 'text-gray-700'}`}>
                                                        {isCurrentPlayer ? 'You' : isBot ? 'Bot' : 'Player'}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {isBot ? '🤖' : '👤'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-4">
                            • Purple team has circles • Orange team has squares
                        </p>
                    </div>

                    {/* Ready status indicators */}
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-gray-700">Ready Status</h3>
                        <div className="flex justify-center items-center space-x-4 mb-3">
                            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg bg-green-100 text-green-800`}>
                                <span className="text-sm font-medium">Your teammate</span>
                                <span>✓</span>
                            </div>
                            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${currentPlayerReady ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                <span className="text-sm font-medium">You</span>
                                {currentPlayerReady ? <span>✓</span> : <span>⏳</span>}
                            </div>
                            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${otherPlayerReady ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                <span className="text-sm font-medium">Opponent 1</span>
                                {otherPlayerReady ? <span>✓</span> : <span>⏳</span>}
                            </div>
                            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg bg-green-100 text-green-800}`}>
                                <span className="text-sm font-medium">Opponent 2</span>
                                <span>✓</span>
                            </div>
                        </div>
                        {bothPlayersReady && (
                            <p className="text-sm text-green-600 font-medium">
                                Both players ready! Starting game...
                            </p>
                        )}
                        {!currentPlayerReady && (
                            <p className="text-sm text-red-600 font-medium mt-2">
                                Please confirm within {countdown} second{countdown !== 1 ? 's' : ''}...
                            </p>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-3">
                        {!currentPlayerReady && (
                            <button
                                onClick={handleConfirmReady}
                                className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                            >
                                I'm Ready to Play!
                            </button>
                        )}
                    </div>

                    {/* Help text */}
                    <p className="text-gray-500 text-xs mt-4">
                        The game will start automatically when both teams confirm they're ready.
                    </p>
                </div>
            </div>
        );
    }

    // Show loading if no game data yet
    if (gameId && game === undefined) {
        return (
            <div className="flex justify-center items-center min-h-[200px]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading game...</p>
                </div>
            </div>
        );
    }

    // Redirect home if no game found (but not if we're redirecting to thank you)
    if (!game && !isRedirectingToThankYou) {
        navigate("/thank-you");
        return null;
    }

    // If redirecting to thank you page, show loading
    if (isRedirectingToThankYou) {
        return (
            <div className="flex justify-center items-center min-h-[200px]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-600">Redirecting...</p>
                </div>
            </div>
        );
    }

    // Return early if no game (safety check)
    if (!game) {
        return null;
    }

    const humanPlayers = [...game.team1, ...game.team2].filter(p =>
        p !== "bot1" && p !== "bot2" && p !== "bot3"
    ).length;

    return (
        <div className="text-center">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
                <div className="mb-6">
                    <div className="animate-pulse">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent"></div>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold mb-2 text-gray-800">Waiting for {dbBotCondition === "unaware" ? "teams" : "players"} to join...</h2>
                    <p className="text-gray-600 mb-4">
                        Looking for players to play with!
                    </p>
                </div>

                {/* Player Count Indicator */}
                <div className="mb-6">
                    <div className="flex justify-center items-center space-x-2 mb-3">
                        <div className="flex space-x-2">
                            {[1, 2].map((i) => (
                                <div
                                    key={i}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${i <= humanPlayers
                                        ? "bg-blue-600 text-white scale-110"
                                        : "bg-gray-200 text-gray-400"
                                        }`}
                                >
                                    {i <= humanPlayers ? "✓" : i}
                                </div>
                            ))}
                        </div>
                    </div>
                    <p className="text-sm text-gray-500">
                        {humanPlayers} {dbBotCondition === "unaware" ? "team" : "players"} joined the queue
                    </p>
                </div>

                {/* Animated Progress Bar */}
                <div className="mb-6">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(humanPlayers / 2) * 100}%` }}
                        ></div>
                    </div>
                </div>

                {/* Game Info */}
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-blue-800 mb-2">Game Setup</h3>
                    <div className="text-sm text-blue-700 space-y-1">
                        <p>• 3 rounds of strategic harvesting</p>
                        <p>• Collect stars to win!</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    {/* Tutorial Button */}
                    {/* <button
                        onClick={handleShowTutorial}
                        className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                    >
                        Review How to Play
                    </button> */}

                    {/* Leave Queue Button */}
                    {/* <button
                        onClick={handleLeaveQueue}
                        className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                    >
                        Leave Queue
                    </button> */}
                </div>
            </div>
        </div>
    );
} 