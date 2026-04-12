import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, useParams } from "react-router";
import { Id } from "../../convex/_generated/dataModel";
import { GameBoard } from "../components/GameBoard";
import FormPageTest from "../pages/FormPageTest";

export function GamePage() {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const markPlayerDisconnected = useMutation(api.game.markPlayerDisconnected);
    const game = useQuery(api.game.getGame, gameId ? { gameId: gameId as Id<"games"> } : "skip");
    const [countdown, setCountdown] = useState<string | null>(null);

    // Redirect if game is not active
    useEffect(() => {
        if (game && game.status === "waiting") {
            navigate(`/waiting/${gameId}`);
        }
    }, [game?.status, gameId, navigate]);

    // Window close detection
    useEffect(() => {
        if (!gameId) return;

        const handleBeforeUnload = () => {
            if (navigator.sendBeacon) {
                const data = JSON.stringify({ gameId, reason: "window_close" });
                navigator.sendBeacon('/api/player-disconnect', data);
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                markPlayerDisconnected({
                    gameId: gameId as Id<"games">,
                    reason: "window_close"
                }).catch(console.error);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [gameId, markPlayerDisconnected]);

    // Add countdown effect when resting phase ends
    useEffect(() => {
        if (game?.isResting && game.restingPhaseEndTime) {
            const timeUntilEnd = game.restingPhaseEndTime - Date.now();

            // Start countdown 4 seconds before resting phase ends
            const countdownStart = timeUntilEnd - 4000;

            if (countdownStart > 0) {
                // Schedule countdown start
                const startTimeout = setTimeout(() => {
                    // Start countdown sequence
                    setCountdown("3");

                    const sequence = [
                        { time: 1000, text: "2" },
                        { time: 2000, text: "1" },
                        { time: 3000, text: "GO!" },
                        { time: 4000, text: null },
                    ];

                    sequence.forEach(({ time, text }) => {
                        setTimeout(() => setCountdown(text), time);
                    });
                }, countdownStart);

                return () => clearTimeout(startTimeout);
            }
        }
    }, [game?.isResting, game?.restingPhaseEndTime]);

    const handleLeaveGame = async () => {
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

    // Redirect home if no game found
    if (!game) {
        navigate("/");
        return null;
    }

    // Check if we should show forms - this logic moved from GameBoard
    const gameStatus = game.status;
    const isTutorialMode = game._id === "tutorial_game";

    const shouldShowForms = gameStatus === "awaiting_form_submission" ||
        gameStatus === "experiment_finished" ||
        (gameStatus === undefined && !isTutorialMode);

    // Show form page if needed
    if (shouldShowForms) {
        return <FormPageTest gameId={game._id} />;
    }

    return (
        <div className="w-full h-full flex flex-col">
            {countdown && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="text-white text-7xl font-bold">
                        {countdown}
                    </div>
                </div>
            )}
            <GameBoard game={game} onLeaveGame={handleLeaveGame} />
        </div>
    );
}