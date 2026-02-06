import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                An unexpected error occurred. This is usually temporary — try refreshing the page.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={this.handleRetry}
                className="bg-fox-orange hover:bg-fox-orange/90 gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="gap-2 border-white/10"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Button>
            </div>
            {this.state.error && (
              <details className="text-left mt-4">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground overflow-auto max-h-32 border border-white/5">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
