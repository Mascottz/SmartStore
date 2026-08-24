// src/components/ErrorBoundary.jsx
// Catches uncaught render errors and shows a recovery UI instead of a blank screen.
import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-zinc-400 text-sm mb-6">
              An unexpected error occurred. You can try reloading the page or
              going back to the dashboard.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400"
              >
                <RefreshCw className="w-4 h-4" /> Reload page
              </button>
              <button
                onClick={() => {
                  this.handleReset();
                  window.location.href = '/';
                }}
                className="px-5 py-2.5 rounded-2xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:text-white"
              >
                Go to dashboard
              </button>
            </div>
            {import.meta.env.DEV && (
              <pre className="mt-6 text-left text-xs text-red-400 bg-zinc-950 rounded-xl p-4 overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
