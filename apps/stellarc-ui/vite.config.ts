import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageJson from "../../package.json";

/**
 * Optionally serve the dev server over TLS to get HTTP/2 multiplexing.
 *
 * Vite serves every source module as its own request in dev (~250 on the board
 * route). Over HTTP/1.1 the browser only opens 6 connections per origin, so most
 * of those modules queue: measured 121 of 250 requests waiting, ~16s cumulative
 * queue time, each stalling ~330ms before its request was even sent. Over HTTP/2
 * the same 48 warm module requests took 1.17s instead of 8.61s.
 *
 * OFF by default, because `basicSsl()` issues a self-signed certificate and
 * module scripts fail closed on certificate errors — the browser lets you click
 * through the warning for the top-level document, then every `import` dies with
 * "Loading failed for the module with source ...". A blank app is worse than a
 * slow one.
 *
 * To actually use this you need a certificate the browser trusts:
 *   mkcert -install && mkcert localhost
 * then point server.https at the generated key/cert instead of basicSsl().
 * On WSL that also means installing the CA into the Windows/Firefox trust store,
 * which is why it isn't the default.
 */
const useDevHttps = process.env.KANEO_DEV_HTTPS === "1";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base: "/",
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      // Keep co-located route tests out of the generated route tree.
      routeFileIgnorePattern: "\\.test\\.tsx?$",
    }),
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    ...(useDevHttps ? [basicSsl()] : []),
  ],
  server: {
    host: true,
    hmr: true,
    port: 5173,
    allowedHosts: ["kaneo.entelechia.cloud", "kaneo.k3s.home"],
    // The Kubernetes ingress routes kaneo.entelechia.cloud to this Vite dev
    // server. Proxy API traffic locally so browser requests remain same-origin
    // while the API runs on the host's port 1337.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
        ws: true,
      },
      "/.well-known/oauth-protected-resource/api/mcp": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
      "/.well-known/oauth-authorization-server/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
    },
  },
  // `vite preview` serves the production build (a handful of bundled, hashed
  // assets) instead of the dev server's ~250 individual module requests. That
  // matters a lot here because the app is reached through Cloudflare, where
  // every request costs ~130ms.
  preview: {
    host: true,
    port: 5173,
    allowedHosts: ["kaneo.entelechia.cloud", "kaneo.k3s.home"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
        ws: true,
      },
      "/.well-known/oauth-protected-resource/api/mcp": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
      "/.well-known/oauth-authorization-server/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // `@pierre/diffs` imports `codeToHtml` from shiki's top-level entry, which
    // statically re-exports every bundled language grammar. Prebundling it made
    // the dev server eagerly build ~80 language chunks (emacs-lisp 764K, cpp
    // 612K, wasm 608K, ...) into node_modules/.vite/deps, so a cold reload
    // downloaded them all — hundreds of requests and tens of MB before the app
    // rendered anything. It is only used on the repo routes, so leaving it
    // unbundled keeps it off the startup path.
    exclude: ["better-auth", "@pierre/diffs", "@pierre/diffs/react"],
  },
  ssr: {
    noExternal: ["better-auth"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
      "@kaneo/libs": path.resolve(
        __dirname,
        "../../packages/contracts/src/legacy/libs/index.ts",
      ),
      "@kaneo/permissions": path.resolve(
        __dirname,
        "../../packages/contracts/src/legacy/permissions/index.ts",
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the vendor half of the entry chunk.
         *
         * The entry was 1,180 kB because React, TanStack Router/Query, the
         * editor and the app's own code all landed in one file that every
         * route blocks on. React and TanStack change independently from the app,
         * so splitting those stable foundations avoids invalidating them on each
         * release. Editor code stays with its lazy feature chunks so it is not
         * preloaded on routes that never open an editor.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "vendor-react";
          }
          if (id.includes("@tanstack")) return "vendor-tanstack";
          if (id.includes("shiki") || id.includes("@shikijs")) {
            return undefined; // keep shiki's per-language chunks intact
          }

          /**
           * KFL-86: stable libraries that ship once and change only on a
           * deliberate dependency bump. Keeping them out of the app entry
           * chunk lets browsers reuse the cached copy across releases instead
           * of re-downloading ~100 KB because an app string changed.
           */
          if (id.includes("i18next")) return "vendor-i18n"; // core + react-i18next
          if (id.includes("zod")) return "vendor-zod";
          if (id.includes("immer")) return "vendor-immer";

          return undefined;
        },
      },
    },
    commonjsOptions: {
      include: [/better-auth/, /node_modules/],
      transformMixedEsModules: true,
    },
    target: "esnext",
  },
});
