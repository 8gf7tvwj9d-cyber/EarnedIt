"use client";

import { Component, ReactNode } from "react";

type GrowthTreeErrorBoundaryProps = {
  children: ReactNode;
};

type GrowthTreeErrorBoundaryState = {
  hasError: boolean;
};

export class GrowthTreeErrorBoundary extends Component<
  GrowthTreeErrorBoundaryProps,
  GrowthTreeErrorBoundaryState
> {
  state: GrowthTreeErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[Earned] Growth tree failed to render. Showing fallback.", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="growth-tree-card growth-tree-fallback" role="status">
          Tree is resting
        </div>
      );
    }

    return this.props.children;
  }
}
