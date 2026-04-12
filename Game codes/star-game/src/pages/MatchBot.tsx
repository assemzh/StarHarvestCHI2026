import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface Bot {
    name: string;
    level: string;
    description: string;
    avatar: string;
    accuracy: string;
}

export function MatchBot() {
    const userProfile = useQuery(api.auth.getUserProfile);
    const dbBotCondition = userProfile?.botCondition || "aware";

    const BOTS: Bot[] = [
        {
            name: dbBotCondition === "unaware" ? "Player N23" : "StarBot Alpha",
            level: "Cautious Counter",
            description: "Perfect match for players like you.",
            avatar: dbBotCondition === "unaware" ? "👤" : "🤖",
            accuracy: "65-75%"
        }
    ];

    const [phase, setPhase] = useState<'explanation' | 'countdown' | 'showing' | 'guessing' | 'result'>('explanation');
    const [countdown, setCountdown] = useState(3);
    const [stars, setStars] = useState<{ x: number, y: number }[]>([]);
    const [actualCount, setActualCount] = useState(0);
    const [userGuess, setUserGuess] = useState("");
    const [matchedBot, setMatchedBot] = useState<Bot | null>(null);
    const navigate = useNavigate();
    const joinQueue = useMutation(api.game.joinQueue);

    // Generate random stars
    useEffect(() => {
        const starCount = Math.floor(Math.random() * 25) + 30; // 30-54 stars
        const newStars = [];
        const usedPositions = new Set<string>();

        for (let i = 0; i < starCount; i++) {
            let x, y;
            let positionKey;

            // Keep generating until we find an unused position
            do {
                x = Math.floor(Math.random() * 10); // 0-9 for grid positions
                y = Math.floor(Math.random() * 10); // 0-9 for grid positions
                positionKey = `${x},${y}`;
            } while (usedPositions.has(positionKey));

            usedPositions.add(positionKey);
            newStars.push({ x, y });
        }

        setStars(newStars);
        setActualCount(starCount);
    }, []);

    // Handle countdown
    useEffect(() => {
        if (phase === 'countdown' && countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else if (phase === 'countdown' && countdown === 0) {
            setPhase('showing');
            // Show stars for 3 seconds
            setTimeout(() => {
                setPhase('guessing');
            }, 3000);
        }
    }, [phase, countdown]);

    const handleStartAssessment = () => {
        setPhase('countdown');
    };

    const handleSubmitGuess = () => {
        const guess = parseInt(userGuess);

        // Since there's only one bot, always select it
        const selectedBot = BOTS[0]; // StarBot Alpha

        setMatchedBot(selectedBot);
        setPhase('result');
    };

    const handlePlayAgain = async () => {
        try {
            const gameId = await joinQueue({ botCondition: dbBotCondition });
            navigate(`/waiting/${gameId}`);
        } catch (error) {
            console.error("Failed to join queue:", error);
            // If joining queue fails, fall back to home page
            navigate('/');
        }
    };

    if (phase === 'explanation') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center max-w-2xl mx-auto px-4">
                    <h1 className="text-4xl font-bold text-gray-800 mb-6">Finding Your Perfect Teammate</h1>
                    <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
                        <p className="text-2xl text-blue-800 mb-8">
                            You'll see a grid of stars <span className="text-4xl font-bold text-blue-600"> 🌟 </span>for a few seconds.
                            Count them carefully, and we'll find a teammate with similar counting skills!
                        </p>
                        <button
                            onClick={handleStartAssessment}
                            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all duration-200 transform hover:scale-105"
                        >
                            Ready!
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'countdown') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-800 mb-8">Star Counting Task</h1>
                    <div className="text-8xl font-bold text-blue-600 mb-4">{countdown}</div>
                    <p className="text-xl text-gray-600">Get ready to count the stars!</p>
                </div>
            </div>
        );
    }

    if (phase === 'showing') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Count the stars!</h2>
                    <div className="inline-grid grid-cols-10 gap-1 bg-gray-200 p-3 rounded-xl shadow-lg aspect-square">
                        {Array.from({ length: 100 }, (_, index) => {
                            const x = index % 10;
                            const y = Math.floor(index / 10);
                            const hasStar = stars.some(star => star.x === x && star.y === y);

                            return (
                                <div
                                    key={index}
                                    className="w-8 h-8 md:w-12 md:h-12 flex items-center justify-center text-sm font-bold rounded bg-white border border-gray-300 shadow-sm"
                                >
                                    {hasStar && (
                                        <div className="text-yellow-500">
                                            <FontAwesomeIcon icon={faStar} className="text-2xl animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 text-lg text-gray-600">
                        Memorize the pattern...
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'guessing') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">How many stars did you see?</h2>
                    <div
                        className="relative bg-gray-100 rounded-lg shadow-lg border-4 border-gray-300 mx-auto mb-6"
                        style={{ width: 400, height: 400 }}
                    >
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-6xl">
                            ?
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm mx-auto">
                        <input
                            type="number"
                            value={userGuess}
                            onChange={(e) => setUserGuess(e.target.value)}
                            placeholder="Enter your guess"
                            className="w-full text-center text-2xl p-3 border-2 border-gray-300 rounded-lg mb-4 focus:border-blue-500 focus:outline-none"
                            min="0"
                            max="100"
                        />
                        <button
                            onClick={handleSubmitGuess}
                            disabled={!userGuess || parseInt(userGuess) < 0}
                            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            Submit Guess
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'result' && matchedBot) {
        const accuracy = Math.abs(actualCount - parseInt(userGuess)) / actualCount;
        const accuracyPercentage = Math.max(0, (1 - accuracy) * 100).toFixed(1);

        // Generate a bot guess that's similar to the user's guess
        const userGuessNum = parseInt(userGuess);
        const botGuess = userGuessNum + 1;

        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-gray-800 mb-6">Meet your new teammate!</h2>

                    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto mb-6">
                        <div className="text-6xl mb-4">{matchedBot.avatar}</div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-2">{matchedBot.name}</h3>
                        {/* <div className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold mb-4">
                            {matchedBot.level}
                        </div> */}
                        <p className="text-gray-600 mb-4">{matchedBot.description}</p>
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                            <div className="text-sm text-green-700 font-medium">✓ Similar Performance Match</div>
                            <div className="text-xs text-green-600 mt-1">This {dbBotCondition === "unaware" ? "player" : "bot"} made a guess close to yours!</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Comparison Results</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                                <div className="text-xl font-bold text-green-600">{userGuess}</div>
                                <div className="text-gray-600">Your Guess</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl font-bold text-purple-600">{botGuess}</div>
                                <div className="text-gray-600">{dbBotCondition === "unaware" ? "Player's" : "Bot's"} Guess</div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handlePlayAgain}
                        className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-all duration-200 transform hover:scale-105"
                    >
                        Next
                    </button>
                </div>
            </div>
        );
    }

    return null;
} 