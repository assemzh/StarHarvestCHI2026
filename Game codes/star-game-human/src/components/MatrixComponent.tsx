import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// NEW: Define the type for the matrix data
type MatrixValues = {
    [rowPlayerId: string]: {
        [colPlayerId: string]: string | number; // Content of the cell, e.g., "Lock", "Unlock", count
    };
};

// Define the MatrixCell component type
interface MatrixCellProps {
    rowPlayerId: string;
    colPlayerId: string;
    value: string | number; // The actual data for the cell
}

const MatrixCell: React.FC<MatrixCellProps> = ({ rowPlayerId, colPlayerId, value }) => {
    const isSelf = rowPlayerId === colPlayerId;

    return (
        <td
            style={{
                textAlign: "center",
                background: isSelf ? "#f5f5f5" : undefined, // Keep self-cell styling
            }}
        >
            {value} {/* Display the passed value directly */}
        </td>
    );
};

// Define the PlayerMatrixRow component type
interface PlayerMatrixRowProps {
    rowPlayerId: string;
    columnPlayerIds: string[]; // Ordered list of player IDs for columns
    matrixValues: MatrixValues;
}

const PlayerMatrixRow: React.FC<PlayerMatrixRowProps> = ({
    rowPlayerId,
    columnPlayerIds,
    matrixValues,
}) => {
    // Simple display of player ID (could be enhanced to show player names if we fetch game data)
    const displayName = rowPlayerId.startsWith("bot") ? rowPlayerId : `Player ${rowPlayerId.slice(-4)}`;

    return (
        <tr key={rowPlayerId}>
            {/* Row header: player name */}
            <td style={{ fontWeight: "bold", textAlign: "center" }}>
                <div style={{ fontSize: 12 }}>{displayName}</div>
            </td>
            {/* Matrix cells for this row */}
            {columnPlayerIds.map((colPlayerId) => {
                // Get the value from matrixValues.
                // Fallback to empty string if an interaction is not defined.
                const cellValue = matrixValues[rowPlayerId]?.[colPlayerId] ?? "";
                return (
                    <MatrixCell
                        key={colPlayerId}
                        rowPlayerId={rowPlayerId}
                        colPlayerId={colPlayerId}
                        value={cellValue} // Pass the specific value for this cell
                    />
                );
            })}
        </tr>
    );
};

// Define the PlayerMatrix component type
interface PlayerMatrixProps {
    rowPlayerIds: string[]; // Ordered list of player IDs for rows
    columnPlayerIds: string[]; // Ordered list of player IDs for columns
    matrixValues: MatrixValues;
}

const PlayerMatrix: React.FC<PlayerMatrixProps> = ({
    rowPlayerIds,
    columnPlayerIds,
    matrixValues,
}) => {
    return (
        <tbody>
            {/* Render matrix rows */}
            {rowPlayerIds.map((rowPlayerId) => (
                <PlayerMatrixRow
                    key={rowPlayerId}
                    rowPlayerId={rowPlayerId}
                    columnPlayerIds={columnPlayerIds}
                    matrixValues={matrixValues}
                />
            ))}
        </tbody>
    );
};

// Define props for the main MatrixComponent
interface MatrixComponentProps {
    gameId: Id<"games">; // Make gameId required since we need real data
}

export default function MatrixComponent({ gameId }: MatrixComponentProps) {

    const interactionStats = useQuery(api.game.getPlayerInteractionStats, { gameId });

    // Loading state
    if (interactionStats === undefined) {
        return <div style={{ textAlign: "center", padding: 20 }}>Loading interaction stats...</div>;
    }

    // No data available
    if (!interactionStats || Object.keys(interactionStats).length === 0) {
        return <div style={{ textAlign: "center", padding: 20 }}>No interaction data available for this game.</div>;
    }

    // Extract all player IDs from the interaction stats
    const allPlayerIds = Object.keys(interactionStats);

    // For now, we'll just order them as they come from the stats
    // You could enhance this to determine actual winners/losers from the game data
    const rowPlayerIds: string[] = allPlayerIds;
    const columnPlayerIds: string[] = allPlayerIds;

    return (
        <div style={{ maxWidth: 800, margin: "0 auto", background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px #0001" }}>
            <h2 style={{ textAlign: "center" }}>Player Interaction Matrix</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
                <thead>
                    <tr>
                        <th></th> {/* Top-left empty cell */}
                        {/* Column headers (player IDs) */}
                        {columnPlayerIds.map((playerId) => {
                            const displayName = playerId.startsWith("bot") ? playerId : `Player ${playerId.slice(-4)}`;
                            return (
                                <th key={playerId} style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 12 }}>{displayName}</div>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <PlayerMatrix
                    rowPlayerIds={rowPlayerIds}
                    columnPlayerIds={columnPlayerIds}
                    matrixValues={interactionStats}
                />
            </table>
        </div>
    );
}