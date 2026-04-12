interface ThankYouPageProps {
  onPlayAgain: () => void;
}

export function ThankYouPage({ onPlayAgain }: ThankYouPageProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="text-center max-w-lg mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-xl p-10">
          <div className="text-6xl mb-6">&#127775;</div>
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Thank You!</h1>
          <p className="text-xl text-gray-600 mb-8">
            Thanks for playing Star Harvest! This was a demo game with 3 ingroup bots.
          </p>
          <button
            onClick={onPlayAgain}
            className="bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
