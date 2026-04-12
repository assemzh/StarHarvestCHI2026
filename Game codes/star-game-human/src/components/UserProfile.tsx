"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function UserProfile() {
    const userProfile = useQuery(api.auth.getUserProfile);
    const user = useQuery(api.auth.loggedInUser);

    if (!user) {
        return <div>Please sign in to view profile information.</div>;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">User Profile Information</h3>

            <div className="space-y-3">
                <div>
                    <span className="text-sm font-medium text-gray-600">User ID:</span>
                    <span className="ml-2 text-sm text-gray-900">{user._id}</span>
                </div>

                {user.email && (
                    <div>
                        <span className="text-sm font-medium text-gray-600">Email:</span>
                        <span className="ml-2 text-sm text-gray-900">{user.email}</span>
                    </div>
                )}

                {user.isAnonymous && (
                    <div>
                        <span className="text-sm font-medium text-gray-600">Account Type:</span>
                        <span className="ml-2 text-sm text-gray-900">Anonymous</span>
                    </div>
                )}

                {userProfile ? (
                    <>
                        {userProfile.prolificId && (
                            <div>
                                <span className="text-sm font-medium text-gray-600">Prolific ID:</span>
                                <span className="ml-2 text-sm text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">
                                    {userProfile.prolificId}
                                </span>
                            </div>
                        )}

                        {userProfile.studyId && (
                            <div>
                                <span className="text-sm font-medium text-gray-600">Study ID:</span>
                                <span className="ml-2 text-sm text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">
                                    {userProfile.studyId}
                                </span>
                            </div>
                        )}

                        {userProfile.sessionId && (
                            <div>
                                <span className="text-sm font-medium text-gray-600">Session ID:</span>
                                <span className="ml-2 text-sm text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">
                                    {userProfile.sessionId}
                                </span>
                            </div>
                        )}

                        {userProfile.referralSource && (
                            <div>
                                <span className="text-sm font-medium text-gray-600">Referral Source:</span>
                                <span className="ml-2 text-sm text-gray-900">{userProfile.referralSource}</span>
                            </div>
                        )}

                        <div>
                            <span className="text-sm font-medium text-gray-600">Profile Created:</span>
                            <span className="ml-2 text-sm text-gray-900">
                                {new Date(userProfile.createdAt).toLocaleString()}
                            </span>
                        </div>

                        <div>
                            <span className="text-sm font-medium text-gray-600">Last Updated:</span>
                            <span className="ml-2 text-sm text-gray-900">
                                {new Date(userProfile.updatedAt).toLocaleString()}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="text-sm text-gray-500 italic">
                        No additional profile information available.
                    </div>
                )}
            </div>
        </div>
    );
} 