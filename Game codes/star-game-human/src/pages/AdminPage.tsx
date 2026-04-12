import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";

type GameStatus = "waiting" | "matched" | "active" | "game_finished" | "overtime" | "awaiting_form_submission" | "experiment_finished";

export function AdminPage() {
    const [statusFilter, setStatusFilter] = useState<GameStatus | "all">("all");
    const [selectedGameId, setSelectedGameId] = useState<Id<"games"> | null>(null);

    // Check if user is admin first
    const isAdminUser = useQuery(api.admin.isAdmin);

    // Get overall statistics (only if admin)
    const stats = useQuery(api.admin.getGameStatistics, isAdminUser ? {} : "skip");

    // Get filtered games list (only if admin)
    const gamesArgs = statusFilter === "all" ? {} : { status: statusFilter as GameStatus };
    const games = useQuery(api.admin.getAllGames, isAdminUser ? gamesArgs : "skip");

    // Get detailed game info if one is selected (only if admin)
    const gameDetails = useQuery(
        api.admin.getGameDetails,
        isAdminUser && selectedGameId ? { gameId: selectedGameId } : "skip"
    );

    const formatDuration = (ms: number) => {
        const minutes = Math.floor(ms / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    };

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const getStatusColor = (status: GameStatus) => {
        switch (status) {
            case "waiting": return "bg-yellow-100 text-yellow-800";
            case "matched": return "bg-orange-100 text-orange-800";
            case "active": return "bg-green-100 text-green-800";
            case "game_finished": return "bg-gray-100 text-gray-800";
            case "overtime": return "bg-blue-100 text-blue-800";
            case "awaiting_form_submission": return "bg-purple-100 text-purple-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    const getBotStrategyColor = (strategy?: string) => {
        switch (strategy) {
            case "ingroup": return "bg-green-100 text-green-700";
            case "outgroup": return "bg-red-100 text-red-700";
            case "prosocial": return "bg-blue-100 text-blue-700";
            case "antisocial": return "bg-orange-100 text-orange-700";
            case "random": return "bg-gray-100 text-gray-700";
            default: return "bg-gray-50 text-gray-500";
        }
    };

    // Loading state
    if (isAdminUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Checking permissions...</div>
            </div>
        );
    }

    // Not an admin
    if (!isAdminUser) {
        window.location.replace("/");
        return null;
    }

    // Loading admin data
    if (stats === undefined || games === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading admin dashboard...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Game Admin Dashboard</h1>
                <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Admin Access
                </div>
            </div>

            {/* Statistics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Games</h3>
                    <p className="text-3xl font-bold text-blue-600">{stats.totalGames}</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Avg Duration</h3>
                    <p className="text-3xl font-bold text-green-600">
                        {formatDuration(stats.averageGameDuration)}
                    </p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Human Players</h3>
                    <p className="text-3xl font-bold text-purple-600">{stats.totalHumanPlayers}</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Bot Replacements</h3>
                    <p className="text-3xl font-bold text-orange-600">{stats.gamesWithReplacements}</p>
                </div>
            </div>

            {/* Detailed Statistics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Games by Status */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Games by Status</h3>
                    <div className="space-y-2">
                        {Object.entries(stats.gamesByStatus).map(([status, count]) => (
                            <div key={status} className="flex justify-between items-center">
                                <span className="capitalize">{status.replace('_', ' ')}</span>
                                <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusColor(status as GameStatus)}`}>
                                    {count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Games by Bot Strategy */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Bot Strategies</h3>
                    <div className="space-y-2">
                        {Object.entries(stats.gamesByBotStrategy).map(([strategy, count]) => (
                            <div key={strategy} className="flex justify-between items-center">
                                <span className="capitalize">{strategy}</span>
                                <span className={`px-2 py-1 rounded text-sm font-medium ${getBotStrategyColor(strategy)}`}>
                                    {count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Game Outcomes */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Game Outcomes</h3>
                    <div className="space-y-2">
                        {Object.entries(stats.gamesByOutcome).map(([outcome, count]) => (
                            <div key={outcome} className="flex justify-between items-center">
                                <span className="capitalize">{outcome.replace('_', ' ')}</span>
                                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm font-medium">
                                    {count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Recent Activity</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{stats.recentActivity.gamesLast24h}</p>
                        <p className="text-sm text-gray-600">Last 24 hours</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{stats.recentActivity.gamesLast7d}</p>
                        <p className="text-sm text-gray-600">Last 7 days</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600">{stats.recentActivity.gamesLast30d}</p>
                        <p className="text-sm text-gray-600">Last 30 days</p>
                    </div>
                </div>
            </div>

            {/* Games List */}
            <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-gray-700">Games List</h3>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as GameStatus | "all")}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        >
                            <option value="all">All Status</option>
                            <option value="waiting">Waiting</option>
                            <option value="matched">Matched</option>
                            <option value="active">Active</option>
                            <option value="game_finished">Finished</option>
                            <option value="overtime">Overtime</option>
                            <option value="awaiting_form_submission">Awaiting Forms</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bot Strategy</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Round</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Players</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {games.map((game) => (
                                <tr key={game._id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-900">
                                        {game._id.slice(-8)}...
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(game.status)}`}>
                                            {game.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${getBotStrategyColor(game.botStrategy)}`}>
                                            {game.botStrategy || 'unknown'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {game.currentRound}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {game.totalScore.team1} - {game.totalScore.team2}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {game.humanPlayerCount}H / {game.botPlayerCount}B
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {formatDuration(game.duration)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {formatTimestamp(game.createdAt)}
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <button
                                            onClick={() => setSelectedGameId(game._id)}
                                            className="text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Game Details Modal */}
            {selectedGameId && gameDetails && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-900">Game Details</h3>
                                <button
                                    onClick={() => setSelectedGameId(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Game Basic Info */}
                            <div>
                                <h4 className="text-md font-semibold text-gray-700 mb-3">Game Information</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div><strong>ID:</strong> {gameDetails.game._id}</div>
                                    <div><strong>Status:</strong> {gameDetails.game.status}</div>
                                    <div><strong>Bot Strategy:</strong> {gameDetails.game.botStrategy || 'unknown'}</div>
                                    <div><strong>Current Round:</strong> {gameDetails.game.currentRound}</div>
                                    <div><strong>Created:</strong> {formatTimestamp(gameDetails.game.createdAt)}</div>
                                    <div><strong>Players:</strong> {[...gameDetails.game.team1, ...gameDetails.game.team2].join(', ')}</div>
                                </div>
                            </div>

                            {/* Round Scores */}
                            {gameDetails.game.roundScores.length > 0 && (
                                <div>
                                    <h4 className="text-md font-semibold text-gray-700 mb-3">Round Scores</h4>
                                    <div className="space-y-2">
                                        {gameDetails.game.roundScores.map((round, index) => (
                                            <div key={index} className="flex justify-between bg-gray-50 p-2 rounded">
                                                <span>Round {index + 1}</span>
                                                <span>{round.team1} - {round.team2}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions Summary */}
                            <div>
                                <h4 className="text-md font-semibold text-gray-700 mb-3">
                                    Actions Summary ({gameDetails.actions.length} total)
                                </h4>
                                <div className="max-h-48 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Player</th>
                                                <th className="px-3 py-2 text-left">Action</th>
                                                <th className="px-3 py-2 text-left">Result</th>
                                                <th className="px-3 py-2 text-left">Round</th>
                                                <th className="px-3 py-2 text-left">Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {gameDetails.actions.slice(-20).map((action) => (
                                                <tr key={action._id}>
                                                    <td className="px-3 py-2">{action.playerId}</td>
                                                    <td className="px-3 py-2">{action.action}</td>
                                                    <td className="px-3 py-2">{action.result || '-'}</td>
                                                    <td className="px-3 py-2">{action.round}</td>
                                                    <td className="px-3 py-2">{formatTimestamp(action.timestamp)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Distributions */}
                            {gameDetails.distributions.length > 0 && (
                                <div>
                                    <h4 className="text-md font-semibold text-gray-700 mb-3">
                                        Distributions ({gameDetails.distributions.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {gameDetails.distributions.map((dist) => (
                                            <div key={dist._id} className="bg-gray-50 p-3 rounded">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium">{dist.distributorPlayerId}</span>
                                                    <span className="text-sm text-gray-600">
                                                        {dist.totalPointsDistributed}/{dist.totalPointsAvailable} points
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    Type: {dist.distributionType} | Winner: {dist.isWinner ? 'Yes' : 'No'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Survey Ratings */}
                            {gameDetails.surveyRatings.length > 0 && (
                                <div>
                                    <h4 className="text-md font-semibold text-gray-700 mb-3">
                                        Survey Ratings ({gameDetails.surveyRatings.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {gameDetails.surveyRatings.map((rating) => (
                                            <div key={rating._id} className="bg-gray-50 p-3 rounded">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium">{rating.raterPlayerId}</span>
                                                    <span className="text-sm text-gray-600">{rating.ratingType}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 