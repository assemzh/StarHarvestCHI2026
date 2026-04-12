import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate } from "react-router";
import { GuidedTutorial } from "../components/GuidedTutorial";

export function HomePage() {
    const [isJoining, setIsJoining] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false); //change this to true for tutorial
    const [hasTutorialCompleted, setHasTutorialCompleted] = useState(false);
    const joinQueue = useMutation(api.game.joinQueue);
    const lobbyStats = useQuery(api.game.getLobbyStats);
    const navigate = useNavigate();

    // Check if user has seen tutorial on component mount
    useEffect(() => {
        const hasSeenTutorial = localStorage.getItem('starHarvestTutorialSeen');
        if (!hasSeenTutorial) {
            setShowTutorial(true);
            setHasTutorialCompleted(false);
        } else {
            setHasTutorialCompleted(true);
        }
    }, []);

    const handleJoinQueue = async () => {
        try {
            setIsJoining(true);
            console.log("Starting joinQueue...");
            const gameId = await joinQueue();
            console.log("joinQueue successful, gameId:", gameId);
            console.log("Navigating to waiting page...");
            navigate(`/waiting/${gameId}`);
        } catch (error) {
            console.error("Failed to join queue:", error);
            // TODO: Add user-facing error message
        } finally {
            setIsJoining(false);
        }
    };

    const handleTutorialComplete = () => {
        setShowTutorial(false);
        setHasTutorialCompleted(true);
        // Mark tutorial as seen
        localStorage.setItem('starHarvestTutorialSeen', 'true');
        // Navigate to match-bot page instead of joining queue
        navigate('/match-bot');
    };

    const handleShowTutorial = () => {
        setShowTutorial(true);
    };

    const handleFindTeammate = () => {
        navigate('/match-bot');
    };

    const handleSkipAndPlay = (e?: React.MouseEvent) => {
        // Prevent default behavior to avoid any form submission
        e?.preventDefault();

        console.log("handleSkipAndPlay called");

        // Only allow if tutorial has been completed
        if (!hasTutorialCompleted) {
            console.log("Tutorial not completed, returning early");
            return;
        }
        // Mark tutorial as seen even if skipped
        localStorage.setItem('starHarvestTutorialSeen', 'true');
        console.log("Calling handleJoinQueue...");
        handleJoinQueue();
    };

    // Show tutorial if requested
    if (showTutorial) {
        return <GuidedTutorial onComplete={handleTutorialComplete} />;
    }

    return (
        <div className="text-center mt-10">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Ready to Play?</h2>


                {/* Lobby Stats */}
                {lobbyStats && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600">{lobbyStats.playersWaiting}</div>
                                <div className="text-gray-600">Waiting</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600">{lobbyStats.activeGames}</div>
                                <div className="text-gray-600">Active Games</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tutorial Button */}
                <button
                    type="button"
                    onClick={handleShowTutorial}
                    className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-all duration-200 transform hover:scale-105 mb-4"
                >
                    1. Tutorial
                </button>

                {/* Find Teammate Button */}
                <button
                    type="button"
                    onClick={handleFindTeammate}
                    className="w-full bg-purple-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-600 transition-all duration-200 transform hover:scale-105 mb-4"
                >
                    2. Find Teammate
                </button>

                {/* Play Button */}
                <button
                    type="button"
                    onClick={handleSkipAndPlay}
                    disabled={isJoining || !hasTutorialCompleted}
                    className={`w-full px-6 py-3 rounded-lg font-semibold transition-all duration-200 transform ${!hasTutorialCompleted
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                        : isJoining
                            ? 'bg-blue-400 text-white cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                        } ${!hasTutorialCompleted || isJoining ? 'transform-none' : ''}`}
                >
                    {isJoining ? (
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                            Joining...
                        </div>
                    ) : !hasTutorialCompleted ? (
                        "Complete Tutorial First"
                    ) : (
                        "3. Find Opponent"
                    )}
                </button>

                {/* Help Text */}
                <p className="text-gray-500 text-sm mt-4">
                    {!hasTutorialCompleted
                        ? "Please complete the tutorial before playing. Click 'Tutorial' to learn the game rules!"
                        : "Ready to play? Click 'Find Opponent' to start matchmaking!"
                    }
                </p>
            </div>
        </div>
    );
} 