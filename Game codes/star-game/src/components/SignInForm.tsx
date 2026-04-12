"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function SignInForm({
  prolificId,
  studyId,
  sessionId,
  botCondition,
}: {
  prolificId: string;
  studyId: string;
  sessionId: string;
  botCondition: "aware" | "unaware";
}) {
  const { signIn } = useAuthActions();
  const saveUserProfile = useMutation(api.auth.saveUserProfile);
  const [submitting, setSubmitting] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [adminMode, setAdminMode] = useState<"signIn" | "signUp">("signIn");

  return (
    <div className="max-w-6xl mx-auto mt-10 mb-10 ml-auto mr-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to Star Harvest!
          </h2>
          <p className="text-gray-600">
            Please read the following consent before proceeding and agree to participate in the study.
          </p>
        </div>

        {/* Consent Info Box */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3 text-left">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 text-left">
              <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
                Research Participation Consent

              </h4>
              <div className="max-h-64 overflow-y-auto text-md text-blue-800 space-y-3 pr-2 text-left">
                <p>
                  <strong>Purpose:</strong>
                  <br />
                  We would like to invite you to participate in a web-based
                  online experiment. The experiment is part of a research
                  program whose purpose is to study the collaboration in teams.
                </p>

                <p>
                  <span className="underline">You must be at least 18 years old to participate
                    in these experiments.</span>
                </p>

                <p>
                  The decision to participate in this research
                  project is <span className="underline">voluntary</span>. Even if you begin the web-based experiment, you
                  can stop at any time by closing your browser.
                </p>

                <p>
                  <strong>Risks and discomforts:</strong>
                  <br />
                  The risks and discomforts associated the participation in this study are no greater than those ordinarily encountered in daily life or during the practice of routine social activities.
                </p>

                <p>
                  <strong>Payment:</strong>
                  <br />You will be compensated for good faith participation in this
                  experiment with <em><span className="text-red-500">$4</span></em>.
                  Participants who rank higher in the game will receive a <em><span className="text-red-500">15% bonus</span></em> .
                  Submitted HITs will be <span className="underline">rejected</span> if they are completed in a manner that appears to be random, incomplete, or otherwise negligent. We anticipate that
                  it will take about <em><span>15-20</span> minutes</em> to complete this
                  task. However, you will only be rewarded for completing
                  the task, not for the length of time you participate.
                </p>

                <p>
                  <strong>Privacy:</strong>
                  <br />
                  Your part in this study is anonymized to the
                  researchers. Researchers at the HKUST
                  may have access to anonymized experimental research
                  records. However, because of the nature of electronic
                  systems, it is possible that respondents could be
                  identified by some electronic record associated with the
                  response. Neither the researcher nor anyone involved with
                  this study will be capturing those data. Any reports or
                  publications based on this research will use only group
                  data and will not identify you or any individual as being
                  affiliated with this project.
                </p>

                <p>
                  <strong>Contact:</strong>
                  <br />
                  If you have any questions about this study,
                  you may contact <a href="mailto:azhunis@connect.ust.hk" className="text-blue-600 hover:underline">azhunis@connect.ust.hk</a>.
                </p>

                <p>
                  <strong>By clicking
                    below you are indicating that you consent to participate in this study.</strong>
                </p>

                {/* Consent Agreement Checkbox */}
                <div className="mb-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentAgreed}
                      onChange={(e) => setConsentAgreed(e.target.checked)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-md text-red-800">
                      I have read and agreed to the consent
                    </span>
                  </label>
                </div>

              </div>
              <span className="ml-1 text-blue-500 flex items-center justify-center">
                <svg className="w-4 h-4 inline-block animate-bounce" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ marginTop: '2px', marginLeft: '2px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                Scroll down
                <svg className="w-4 h-4 inline-block animate-bounce" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ marginTop: '2px', marginLeft: '2px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          </div>
        </div>



        {!showAdminForm ? (
          <>
            {/* Anonymous sign in */}
            <button
              className={`w-full px-4 py-3 rounded border-2 font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-2 ${consentAgreed && !submitting
                ? 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow'
                : 'border-gray-100 text-gray-400 cursor-not-allowed bg-gray-50'
                }`}
              disabled={!consentAgreed || submitting}
              onClick={() => {
                if (!consentAgreed) {
                  toast.error("Please agree to the consent before proceeding");
                  return;
                }
                console.log("Attempting anonymous sign in...");
                setSubmitting(true);
                void signIn("anonymous", {
                  prolificId: prolificId,
                  studyId: studyId,
                  sessionId: sessionId,
                  botCondition: botCondition || "unaware",
                }).then(async () => {
                  console.log("Anonymous sign in successful!", { prolificId, studyId, sessionId });
                  // Add a small delay to ensure authentication state is propagated
                  await new Promise(resolve => setTimeout(resolve, 500));

                  // Save all URL parameters to the database with retry logic
                  if (prolificId || studyId || sessionId || botCondition) {
                    let attempts = 0;
                    const maxAttempts = 3;

                    while (attempts < maxAttempts) {
                      try {
                        await saveUserProfile({
                          prolificId: prolificId || undefined,
                          studyId: studyId || undefined,
                          sessionId: sessionId || undefined,
                          referralSource: "prolific",
                          botCondition: botCondition || "unaware",
                        });
                        console.log("User profile saved with parameters:", { prolificId, studyId, sessionId });
                        break; // Success, exit retry loop
                      } catch (profileError) {
                        attempts++;
                        console.warn(`Failed to save user profile (attempt ${attempts}/${maxAttempts}):`, profileError);

                        if (attempts < maxAttempts) {
                          // Wait a bit longer before retrying
                          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                        } else {
                          console.error("Failed to save user profile after all attempts:", profileError);
                          // Don't block the user if profile saving fails, just log it
                          toast.error("Profile data couldn't be saved, but you can continue");
                        }
                      }
                    }
                  }
                }).catch((error) => {
                  console.error("Anonymous sign in failed:", error);
                  toast.error("Failed to sign in anonymously");
                }).finally(() => {
                  setSubmitting(false);
                });
              }}
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting experiment...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  Start the experiment
                </>
              )}
            </button>

            {/* Small admin sign in button */}
            {/* <div className="mt-6 text-center">
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowAdminForm(true)}
              >
                Admin Access
              </button>
            </div> */}
          </>
        ) : (
          <>
            {/* Admin form */}
            <div className="mb-4">
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                onClick={() => setShowAdminForm(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            <p className="text-red-600 text-left mb-4">
              * If you are participant, please go back to the main page
            </p>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              Admin {adminMode === "signIn" ? "Sign In" : "Registration"}
            </h3>



            {/* Toggle between Sign In and Sign Up */}
            <div className="flex mb-4">
              <button
                type="button"
                className={`flex-1 py-2 px-4 text-sm font-medium ${adminMode === "signIn"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  } rounded-l-md transition-colors`}
                onClick={() => setAdminMode("signIn")}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-4 text-sm font-medium ${adminMode === "signUp"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  } rounded-r-md transition-colors`}
                onClick={() => setAdminMode("signIn")}
              >
                Register
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitting(true);
                const formData = new FormData(e.target as HTMLFormElement);
                formData.set("flow", adminMode);

                void signIn("password", formData)
                  .then(() => {
                    toast.success(
                      adminMode === "signIn"
                        ? "Signed in successfully!"
                        : "Admin account created successfully!"
                    );
                  })
                  .catch((error) => {
                    console.error("Auth error:", error);
                    let toastTitle = "";
                    if (error.message.includes("Invalid password")) {
                      toastTitle = "Password must be at least 8 characters long";
                    } else if (error.message.includes("InvalidAccountId")) {
                      toastTitle = "Account not found. Try registering first.";
                    } else if (error.message.includes("already exists")) {
                      toastTitle = "Account already exists. Try signing in.";
                    } else {
                      toastTitle = `Failed to ${adminMode === "signIn" ? "sign in" : "register"}. ${error.message}`;
                    }
                    toast.error(toastTitle);
                  })
                  .finally(() => {
                    setSubmitting(false);
                  });
              }}
            >
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="email"
                  name="email"
                  placeholder="Enter email"
                  defaultValue=""
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password {adminMode === "signUp" && <span className="text-gray-500">(min 8 characters)</span>}
                </label>
                <input
                  id="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="password"
                  name="password"
                  placeholder="Enter password"
                  minLength={8}
                  required
                />
              </div>

              <button
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {adminMode === "signIn" ? "Signing in..." : "Registering..."}
                  </span>
                ) : (
                  adminMode === "signIn" ? "Sign In as Admin" : "Register Admin"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
