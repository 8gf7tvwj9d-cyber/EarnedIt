"use client";

import React from "react";

type AppCrashBoundaryProps = {
  children: React.ReactNode;
  onReset: () => void;
};

type AppCrashBoundaryState = {
  hasError: boolean;
};

export class AppCrashBoundary extends React.Component<
  AppCrashBoundaryProps,
  AppCrashBoundaryState
> {
  state: AppCrashBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[Earned] App render crashed.", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
          <div className="mx-auto max-w-3xl">
            <div className="app-shell rounded-[38px] px-4 py-6 sm:px-6 sm:py-8">
              <div className="panel-soft rounded-[32px] p-6 sm:p-7">
                <h1 className="font-mono text-3xl font-black text-slate-900">
                  EarnedIt needs a quick reset
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-700 sm:text-base">
                  The app hit a loading error while rendering saved local data. Resetting the
                  demo store will bring it back to a clean working state.
                </p>
                <button
                  className="mt-5 rounded-full bg-[#5f8f43] px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(48,35,18,0.16)]"
                  onClick={this.props.onReset}
                  type="button"
                >
                  Reset local demo data
                </button>
              </div>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
