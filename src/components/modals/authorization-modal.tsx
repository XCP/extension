"use client";

import React, { useState, useEffect, useRef, type ReactElement } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/inputs/password-input";

interface AuthorizationModalProps {
  onUnlock: (password: string) => Promise<void>;
  onCancel: () => void;
}

export function AuthorizationModal({ onUnlock, onCancel }: AuthorizationModalProps): ReactElement {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const MIN_PASSWORD_LENGTH = 8;

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleAuthorize = async () => {
    setError(undefined);

    if (!password) {
      setError("Password cannot be empty.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    try {
      await onUnlock(password);
      setPassword("");
    } catch (err) {
      console.error("Authorization error:", err);
      setError("Invalid password or authorization failed. Please try again.");
    }
  };

  const handleCancel = () => {
    setPassword("");
    setError(undefined);
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuthorize();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h1 className="text-xl font-bold mb-5 flex justify-between items-center">
          <span>Authorize Transaction</span>
        </h1>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Please enter your password to authorize this transaction.
        </p>

        {error && (
          <div
            className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <PasswordInput
            name="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={false}
            innerRef={passwordInputRef}
          />

          <div className="flex justify-end gap-3">
            <Button onClick={handleCancel} variant="transparent">
              Cancel
            </Button>
            <Button onClick={handleAuthorize} disabled={!password}>
              Authorize
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
