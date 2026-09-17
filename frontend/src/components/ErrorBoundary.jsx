import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center space-y-4 max-w-sm">
            <p className="text-gray-200 font-medium">Something went wrong</p>
            <p className="text-gray-500 text-sm">
              Try refreshing the page. If this keeps happening, come back later.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-medium text-sm px-4 py-2 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}