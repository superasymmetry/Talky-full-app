import { Component } from 'react';

// App-wide fallback generic error page
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in app tree:', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center',
        }}>
          <h1>Something went wrong</h1>
          <p>We hit an unexpected error. Reloading the page usually fixes this.</p>
          <button onClick={() => { window.location.href = '/'; }}>
            Back to home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
