import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function DebugInfo() {
    const hasCompletedTutorial = useQuery(api.tutorial.hasCompletedTutorial);

    return (
        <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 p-4 rounded text-xs max-w-sm">
            <h3 className="font-bold text-yellow-800 mb-2">Debug Info</h3>
            <div className="space-y-1 text-yellow-700">
                <div>Convex URL: {import.meta.env.VITE_CONVEX_URL ? "✅ Set" : "❌ Missing"}</div>
                <div>Tutorial Status: {hasCompletedTutorial === undefined ? "🔄 Loading..." : hasCompletedTutorial ? "✅ Completed" : "❌ Not completed"}</div>
                <div>Page: {window.location.pathname}</div>
            </div>
        </div>
    );
} 