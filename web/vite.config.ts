import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript; charset=utf-8',
};

function serveRepoStaticDirs(): Plugin {
  const prefixes = ['/data/', '/assets/'];
  return {
    name: 'castlefield-repo-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = (req.url || '/').split('?')[0];
        if (!prefixes.some((p) => rawUrl.startsWith(p))) return next();
        const rel = decodeURIComponent(rawUrl).replace(/^\/+/, '');
        if (rel.includes('..')) return next();
        const target = path.join(REPO_ROOT, rel);
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return next();
        const ext = path.extname(target).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(target).pipe(res);
      });
    },
    writeBundle() {
      // Production build copies runtime assets & data beside dist/
      const copyDir = (srcDir: string, destDir: string) => {
        if (!fs.existsSync(srcDir)) return;
        fs.mkdirSync(destDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          const srcPath = path.join(srcDir, entry.name);
          const destPath = path.join(destDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'review' || entry.name === 'raw' || entry.name === 'blender' || entry.name === 'scripts') continue;
            copyDir(srcPath, destPath);
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.svg' || ext === '.blend' || ext === '.py') continue;
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };
      const distDir = path.resolve(__dirname, 'dist');
      copyDir(path.join(REPO_ROOT, 'data'), path.join(distDir, 'data'));
      copyDir(path.join(REPO_ROOT, 'assets'), path.join(distDir, 'assets'));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    serveRepoStaticDirs(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'キャッスルフィールド v2',
        short_name: 'キャッスル',
        description: 'ちびキャラと城が戦う、王国ファンタジー対戦カードゲーム',
        theme_color: '#3465CC',
        background_color: '#FFF6E0',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/assets/ui/app-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/assets/ui/app-icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/assets\//,
          /^\/data\//,
          /^\/wasm\//,
          /^\/draco\//,
          /\/[^/?]+\.[^/]+$/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/assets/') ||
              url.pathname.startsWith('/data/') ||
              url.pathname.startsWith('/wasm/') ||
              url.pathname.startsWith('/draco/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'castlefield-runtime-assets',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@game': path.resolve(REPO_ROOT, 'js/game'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const norm = id.replace(/\\/g, '/');
          if (norm.includes('preload-helper') || norm.includes('commonjsHelpers')) {
            return 'vendor-react';
          }
          if (!norm.includes('/node_modules/')) return undefined;
          if (
            norm.includes('/node_modules/react/') ||
            norm.includes('/node_modules/react-dom/') ||
            norm.includes('/node_modules/scheduler/') ||
            norm.includes('/node_modules/zustand/')
          ) {
            return 'vendor-react';
          }
          if (
            norm.includes('/node_modules/three/') ||
            norm.includes('/node_modules/@react-three/') ||
            norm.includes('/node_modules/three-stdlib/') ||
            norm.includes('/node_modules/camera-controls/') ||
            norm.includes('/node_modules/maath/') ||
            norm.includes('/node_modules/suspend-react/') ||
            norm.includes('/node_modules/troika-') ||
            norm.includes('/node_modules/react-reconciler/')
          ) {
            return 'vendor-three';
          }
          if (
            norm.includes('/node_modules/motion/') ||
            norm.includes('/node_modules/framer-motion/') ||
            norm.includes('/node_modules/howler/')
          ) {
            return 'vendor-motion';
          }
          if (norm.includes('/node_modules/pixi.js/') || norm.includes('/node_modules/@pixi/')) {
            return 'vendor-pixi';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      allow: [REPO_ROOT],
    },
  },
});
