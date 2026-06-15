import React from 'react';

// Catches any render/runtime error in the tree and shows a friendly, themed
// recovery screen instead of a blank white page — important for unattended
// venue tablets. Offers Reload, and a "reset this device" escape hatch.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Okibar crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="okibar-app flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="panel p-8 text-center fade-up" style={{ maxWidth: '28rem' }}>
          <div className="text-5xl mb-4">🎤</div>
          <h1 className="h-display text-2xl mb-2">Something went wrong</h1>
          <p className="muted mb-6">The app hit a snag. Reloading usually fixes it — your queue and tabs are saved on the server.</p>
          <div className="flex gap-2 justify-center">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                try {
                  localStorage.removeItem('okibar-device-mode');
                  localStorage.removeItem('okibar-device-table');
                } catch (_) {}
                window.location.href = window.location.origin + '/';
              }}
            >
              Reset this device
            </button>
          </div>
        </div>
      </div>
    );
  }
}
