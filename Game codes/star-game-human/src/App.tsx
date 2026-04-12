import { Authenticated, Unauthenticated } from "convex/react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { SignInForm } from "./components/SignInForm";
import { SignOutButton } from "./components/SignOutButton";
import { Toaster } from "sonner";
import { HomePage } from "./pages/HomePage";
import { WaitingPage } from "./pages/WaitingPage";
import { GamePage } from "./pages/GamePage";
import { AdminPage } from "./pages/AdminPage";
import { GuidedTutorial } from "./components/GuidedTutorial";
import { MatchBot } from "./pages/MatchBot";
import { ThankYouPage } from "./pages/ThankYouPage";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import FormPageTest from "./pages/FormPageTest";
import { AdminRegistration } from "./components/AdminRegistration";
import { useEffect } from "react";


function HeaderContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const markPlayerDisconnected = useMutation(api.game.markPlayerDisconnected);

  // Check if current user is admin
  const isAdminUser = useQuery(api.admin.isAdmin);
  const currentUser = useQuery(api.auth.loggedInUser);

  // Show admin registration if no user is logged in
  // if (!currentUser) {
  //   return <AdminRegistration />;
  // }

  const isInGame = location.pathname.startsWith('/game/');
  const isInTutorial = location.pathname === '/tutorial';
  const gameId = params.gameId;

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

  const handleShowTutorial = () => {
    navigate("/tutorial");
  };

  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
      <h2 className="text-xl font-semibold text-primary">Star Harvest</h2>
      <Authenticated>
        <div className="flex gap-3 items-center">
          {/* {!isInTutorial && !isInGame && (
            <button
              onClick={handleShowTutorial}
              className="px-4 py-2 rounded bg-green-600 text-white border border-green-500 font-semibold hover:bg-green-700 transition-colors shadow-sm hover:shadow text-sm"
            >
              How to Play
            </button>
          )} */}
          {!isInTutorial && !isInGame && isAdminUser && (
            <button
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded bg-purple-600 text-white border border-purple-500 font-semibold hover:bg-purple-700 transition-colors shadow-sm hover:shadow text-sm"
            >
              Admin
            </button>
          )}
          {/* {isInGame && gameId && (
            <button
              onClick={handleLeaveGame}
              className="px-4 py-2 rounded bg-gray-600 text-white border border-gray-500 font-semibold hover:bg-gray-700 transition-colors shadow-sm hover:shadow"
            >
              Leave Game
            </button>
          )}
          <SignOutButton /> */}
        </div>
      </Authenticated>
    </header>
  );
}

function Content() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prolificId = searchParams.get("PROLIFIC_PID");
  const studyId = searchParams.get("STUDY_ID");
  const sessionId = searchParams.get("SESSION_ID");

  console.log("URL Parameters:", {
    prolificId,
    studyId,
    sessionId
  });

  const handleTutorialComplete = () => {
    navigate("/match-bot");
  };

  return (
    <div className="flex flex-col gap-8 flex-1">
      <div className="text-center">
        <Authenticated>
          <div className="flex-1 flex flex-col">
            <Routes>
              <Route path="/" element={<GuidedTutorial onComplete={handleTutorialComplete} />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/tutorial" element={<GuidedTutorial onComplete={handleTutorialComplete} />} />
              <Route path="/match-bot" element={<MatchBot />} />
              <Route path="/waiting/:gameId" element={<WaitingPage />} />
              <Route path="/game/:gameId" element={<GamePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/form" element={<FormPageTest />} />
              <Route path="/thank-you" element={<ThankYouPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Authenticated>
        <Unauthenticated>
          <SignInForm
            prolificId={prolificId || ""}
            studyId={studyId || ""}
            sessionId={sessionId || ""}
          />
        </Unauthenticated>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-center" />
      <BrowserRouter>
        <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
          <HeaderContent />
          <Content />
        </div>
      </BrowserRouter>
    </>
  );
}
