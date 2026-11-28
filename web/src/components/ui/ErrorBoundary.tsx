import { Component, type ErrorInfo, type ReactNode } from 'react';

interface SceneBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface SceneBoundaryState {
  failed: boolean;
}

/** Catches WebGL / GLTF / R3F errors and silently falls back to the 2D prerendered view. */
export class SceneErrorBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  state: SceneBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.warn('[CastleField] 3D scene fell back to 2D:', error);
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

interface AppBoundaryProps {
  children: ReactNode;
}

interface AppBoundaryState {
  errorMessage: string | null;
}

/** Top-level UI recovery screen for unexpected render errors (plain CSS tokens, raster-safe). */
export class AppErrorBoundary extends Component<AppBoundaryProps, AppBoundaryState> {
  state: AppBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: Error): AppBoundaryState {
    return { errorMessage: error?.message || String(error) || '不明なエラー' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CastleField] Unexpected app error:', error, info);
  }

  render(): ReactNode {
    if (this.state.errorMessage === null) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          background: 'linear-gradient(180deg, #98d8ff 0%, #e4f4ff 55%, #f5e6c4 100%)',
          color: '#4a2e1a',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            background: '#fbefd2',
            border: '3px solid #4a2e1a',
            borderRadius: 18,
            padding: 18,
            boxShadow: '0 8px 24px rgba(74, 46, 26, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 18 }}>画面の表示で問題が起きました</strong>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              background: '#fffaf0',
              border: '1.5px solid #c9b075',
              borderRadius: 10,
              padding: 10,
              wordBreak: 'break-word',
            }}
          >
            {this.state.errorMessage}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 46,
              borderRadius: 12,
              border: '2.5px solid #4a2e1a',
              background: 'linear-gradient(180deg, #ffe37a 0%, #ffb833 100%)',
              color: '#4a2e1a',
              fontSize: 15,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            再読み込み
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('castlefield_v2_save_v1');
              } catch {
                // Ignore storage failures
              }
              window.location.reload();
            }}
            style={{
              minHeight: 42,
              borderRadius: 12,
              border: '2px solid #4a2e1a',
              background: '#efe0bd',
              color: '#4a2e1a',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            セーブを初期化して復帰
          </button>
        </div>
      </div>
    );
  }
}
