import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider } from './AuthContext';
import './index.css';

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', maxWidth: 600 }}>
          <h1 style={{ color: 'var(--text)' }}>Something went wrong</h1>
          <p style={{ color: 'var(--text-muted)' }}>The app hit an error. Details below may help fix it.</p>
          <pre
            style={{
              background: 'var(--surface)',
              padding: '1rem',
              borderRadius: 8,
              overflow: 'auto',
              fontSize: '0.85rem',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
            Check the browser console (F12) for more. Make sure the backend is running on port 3001.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
