import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

export type Highlighter = HighlighterCore;

let shikiHighlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * Languages the shared highlighter loads, as explicit dynamic imports.
 *
 * Importing anything from the top-level `shiki` entry (including
 * `createHighlighter`) is what made a fresh page load pull ~200 language
 * grammars: that entry statically re-exports `langs-bundle-full`, whose every
 * entry holds a live `import()`. Rollup therefore emitted a chunk per language
 * — emacs-lisp (764K), cpp (612K), wasm (608K), wolfram (260K), and so on,
 * ~15 MB on disk — reachable from the app's statically imported editors.
 *
 * `shiki/core` has no bundle attached, so only the grammars named here ship.
 * Add a language by adding a line; nothing else pulls the full set back in.
 */
const LANGUAGE_LOADERS = {
  bash: () => import("@shikijs/langs/bash"),
  clojure: () => import("@shikijs/langs/clojure"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  csv: () => import("@shikijs/langs/csv"),
  cypher: () => import("@shikijs/langs/cypher"),
  dart: () => import("@shikijs/langs/dart"),
  diff: () => import("@shikijs/langs/diff"),
  elixir: () => import("@shikijs/langs/elixir"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  haskell: () => import("@shikijs/langs/haskell"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  makefile: () => import("@shikijs/langs/make"),
  markdown: () => import("@shikijs/langs/markdown"),
  ocaml: () => import("@shikijs/langs/ocaml"),
  perl: () => import("@shikijs/langs/perl"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  r: () => import("@shikijs/langs/r"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  terraform: () => import("@shikijs/langs/terraform"),
  toml: () => import("@shikijs/langs/toml"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} as const;

/**
 * Languages the shared highlighter supports.
 *
 * Exported so UI can answer "can we highlight this?" without importing shiki's
 * `bundledLanguages` (see above for why that is expensive). "text" is always
 * available — it needs no grammar.
 */
export const SHIKI_LANGUAGES = Object.keys(LANGUAGE_LOADERS) as Array<
  keyof typeof LANGUAGE_LOADERS
>;

export type ShikiLanguage = keyof typeof LANGUAGE_LOADERS;

/**
 * Grammars loaded up front, everything else on first use.
 *
 * `langs:` used to be `Object.values(LANGUAGE_LOADERS).map((load) => load())`,
 * which calls all 34 `import()`s while building the highlighter. The imports
 * being dynamic only bought separate *chunks*: opening any editor still
 * downloaded every one of them, including the giants (cpp 626 kB, emacs-lisp
 * 780 kB — TextMate grammars embed each other, so C++ drags in its whole
 * family). Loading a grammar is `highlighter.loadLanguage()` at any time, so
 * the rest are fetched when a code block actually claims that language.
 *
 * This list is the long tail of what people paste into comments; each is small.
 */
const EAGER_LANGUAGES = [
  "bash",
  "css",
  "diff",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "sql",
  "typescript",
  "yaml",
] as const satisfies readonly ShikiLanguage[];

const loadedLanguages = new Set<string>(EAGER_LANGUAGES);
const inFlightLanguages = new Map<string, Promise<void>>();

/**
 * Fired after a lazily-fetched grammar is registered.
 *
 * Highlighting is synchronous (`codeToTokens`), so a view that asked for a
 * language before its grammar arrived rendered it as plain text. Listening for
 * this lets it re-run the same synchronous pass once the grammar is in.
 */
export const SHIKI_LANGUAGE_LOADED_EVENT = "shiki-language-loaded";

export function isShikiLanguageLoaded(language: string) {
  return loadedLanguages.has(language);
}

/**
 * Register a grammar on the shared highlighter, once.
 *
 * Concurrent callers share the in-flight promise so hovering ten C++ blocks
 * fetches one chunk. Unknown languages resolve without doing anything — the
 * caller falls back to `text`.
 */
export function ensureShikiLanguage(language: string): Promise<void> {
  if (loadedLanguages.has(language)) return Promise.resolve();

  const loader = LANGUAGE_LOADERS[language as ShikiLanguage];
  if (!loader) return Promise.resolve();

  const inFlight = inFlightLanguages.get(language);
  if (inFlight) return inFlight;

  const pending = (async () => {
    const highlighter = await getSharedShikiHighlighter();
    const grammar = await loader();
    await highlighter.loadLanguage(grammar);
    loadedLanguages.add(language);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(SHIKI_LANGUAGE_LOADED_EVENT, { detail: { language } }),
      );
    }
  })()
    .catch(() => {
      // A missing grammar must not break the editor; it stays plain text.
    })
    .finally(() => {
      inFlightLanguages.delete(language);
    });

  inFlightLanguages.set(language, pending);
  return pending;
}

/**
 * Make a lazily-loaded grammar look eager to synchronous callers.
 *
 * Callers highlight synchronously (`codeToTokens`) and have no way to await a
 * grammar. Rather than make every call site async, missing grammars render as
 * plain text *and* kick off the fetch, so the next decoration pass (any editor
 * transaction, or a listener on SHIKI_LANGUAGE_LOADED_EVENT) is coloured.
 */
function withLazyLanguages(highlighter: HighlighterCore): HighlighterCore {
  const codeToTokens = highlighter.codeToTokens.bind(highlighter);

  return new Proxy(highlighter, {
    get(target, property, receiver) {
      if (property !== "codeToTokens") {
        return Reflect.get(target, property, receiver);
      }

      return ((code: string, options: Parameters<typeof codeToTokens>[1]) => {
        const lang = (options as { lang?: string })?.lang;
        if (
          typeof lang === "string" &&
          lang !== "text" &&
          !loadedLanguages.has(lang)
        ) {
          void ensureShikiLanguage(lang);
          return codeToTokens(code, { ...options, lang: "text" as never });
        }

        return codeToTokens(code, options);
      }) as typeof codeToTokens;
    },
  });
}

export function getSharedShikiHighlighter() {
  if (!shikiHighlighterPromise) {
    shikiHighlighterPromise = createHighlighterCore({
      themes: [
        import("@shikijs/themes/github-dark"),
        import("@shikijs/themes/github-light"),
      ],
      langs: EAGER_LANGUAGES.map((language) => LANGUAGE_LOADERS[language]()),
      // Oniguruma needs a WASM blob; the JS engine would be smaller but does
      // not support every grammar above.
      engine: createOnigurumaEngine(import("shiki/wasm")),
    }).then(withLazyLanguages);
  }

  return shikiHighlighterPromise;
}
