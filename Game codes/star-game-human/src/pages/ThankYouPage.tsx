import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { EXIT_URL } from "./FormPageTest";


export function ThankYouPage() {
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
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
        <div className="flex justify-center items-center min-h-screen bg-gray-50">
            <div className="text-center max-w-md mx-auto p-8">
                <div className="bg-white rounded-lg shadow-lg p-8">
                    <div className="mb-6">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <div className="text-4xl">🙏</div>
                        </div>
                        <h1 className="text-3xl font-bold mb-4 text-gray-800">
                            Thank you!
                        </h1>
                        <p className="text-gray-600 text-lg mb-6">
                            While we couldn't find other players at this time, we will offer you some compensation for tutorial completion.
                        </p>
                    </div>
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
            </div>
        </div>
    );
} 