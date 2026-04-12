"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

export function AdminRegistration() {
    const { signIn } = useAuthActions();
    const [submitting, setSubmitting] = useState(false);

    return (
        <div className="w-full max-w-md mx-auto p-8">
            <h2 className="text-2xl font-bold mb-6">Create Admin Account</h2>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitting(true);
                    const formData = new FormData(e.target as HTMLFormElement);
                    formData.set("flow", "signUp");

                    signIn("password", formData)
                        .then(() => {
                            toast.success("Admin account created successfully!");
                        })
                        .catch((error) => {
                            toast.error("Failed to create admin account: " + error.message);
                        })
                        .finally(() => {
                            setSubmitting(false);
                        });
                }}
            >
                <div className="mb-4">
                    <label htmlFor="email" className="block text-sm font-medium mb-2">
                        Admin Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        name="email"
                        defaultValue="assem@gmail.com" // Pre-fill with your admin email
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                    />
                </div>

                <div className="mb-6">
                    <label htmlFor="password" className="block text-sm font-medium mb-2">
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        name="password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                    {submitting ? "Creating..." : "Create Admin Account"}
                </button>
            </form>
        </div>
    );
} 