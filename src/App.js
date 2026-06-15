import React from 'react';
import KaraokeBarApp from './components/karaoke_queue.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <KaraokeBarApp />
      </ErrorBoundary>
    </div>
  );
}

export default App;