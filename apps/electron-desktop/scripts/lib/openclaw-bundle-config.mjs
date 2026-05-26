import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "electron",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_EXTERNALS_PATH = path.join(here, "openclaw-bundle-generated-externals.json");

// Manual policy: packages known to be unsafe or undesirable to inline.
export const ESBUILD_EXTERNALS_POLICY = [
  // Native modules
  "sharp",
  "@img/*",
  "@napi-rs/*",
  "@lydell/*",
  "node-pty",
  "sqlite3",
  "better-sqlite3",
  "sqlite-vec",
  "@discordjs/opus",
  "koffi",
  "@silvia-odwyer/*",
  "@mariozechner/clipboard-*",
  "@reflink/*",
  "@node-llama-cpp/*",
  "ffmpeg-static",
  // CJS packages with internal require() paths that break when bundled
  "jiti",
  "yaml",
  "chromium-bidi",
  "grammy",
  "@grammyjs/*",
  "qs",
  "rimraf",
  // Large runtime deps kept external (complex module structure / size)
  "zod",
  "@sinclair/typebox",
  "ajv",
  "undici",
  "express",
  "ws",
  "commander",
  "markdown-it",
  "music-metadata",
  "google-auth-library",
  "nostr-tools",
  "@lancedb/*",
  "@vector-im/*",
  "@matrix-org/*",
  "@microsoft/agents-hosting",
  "@larksuiteoapi/*",
  "@opentelemetry/*",
  "@twurple/*",
  "@urbit/aura",
  "link-preview-js",
  "jimp",
  "bufferutil",
  "utf-8-validate",
  "canvas",
  "@snazzah/davey",
];

function normalizeExternalList(list) {
  return [...new Set((list || []).map((v) => String(v).trim()).filter(Boolean))].sort();
}

export function readGeneratedExternals() {
  try {
    const raw = fs.readFileSync(GENERATED_EXTERNALS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.externals)) {
      return [];
    }
    return normalizeExternalList(parsed.externals);
  } catch {
    return [];
  }
}

export function writeGeneratedExternals(nextExternals) {
  const payload = {
    externals: normalizeExternalList(nextExternals),
  };
  fs.writeFileSync(GENERATED_EXTERNALS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function resolveEsbuildExternals(options = {}) {
  const generated = readGeneratedExternals();
  const additional = Array.isArray(options.additional) ? options.additional : [];
  return normalizeExternalList([...ESBUILD_EXTERNALS_POLICY, ...generated, ...additional]);
}

// Keep backwards compatibility with existing imports.
export const ESBUILD_EXTERNALS = resolveEsbuildExternals();

// Explicit package pruning from the deployed pnpm store.
export const PRUNE_PREFIXES = ["node-llama-cpp", "@node-llama-cpp+", "koffi@", "typescript@"];

export const PRUNE_LINK_NAMES = ["node-llama-cpp", "koffi", "typescript"];
export const PRUNE_SCOPED_NAMES = ["@node-llama-cpp"];

// Keep-list that protects fragile runtime deps from aggressive tree pruning.
export const ALWAYS_KEEP_PACKAGES = [
  "jiti",
  "yaml",
  "file-type",
  "music-metadata",
  "strtok3",
  "token-types",
  "undici",
  "express",
  "ws",
  "openai",
  "google-auth-library",
  "@snazzah/davey",
];

export const STRIP_EXTENSIONS = new Set([
  ".d.ts",
  ".d.mts",
  ".d.cts",
  ".map",
  ".md",
  ".markdown",
  ".txt",
  ".ts.map",
]);

export const STRIP_EXACT_NAMES = new Set([
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "README.md",
  "README",
  "README.txt",
  "CHANGELOG.md",
  "CHANGELOG",
  "HISTORY.md",
  "CHANGES.md",
  "AUTHORS",
  "AUTHORS.md",
  "CONTRIBUTORS.md",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.json",
  ".prettierrc.yml",
  ".editorconfig",
  "tsconfig.json",
  "tsconfig.build.json",
  "tslint.json",
  ".npmignore",
  ".gitignore",
  ".gitattributes",
  "Makefile",
  "Gruntfile.js",
  "Gulpfile.js",
  ".travis.yml",
  "appveyor.yml",
  "jest.config.js",
  "karma.conf.js",
  ".zuul.yml",
  ".jshintrc",
  ".babelrc",
  ".nycrc",
  ".istanbul.yml",
]);

export const STRIP_DIR_NAMES = new Set([
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "docs",
  "example",
  "examples",
  ".github",
  ".vscode",
  "coverage",
  "benchmark",
  "benchmarks",
  ".idea",
  ".nyc_output",
]);

// Runtime package checks for post-bundle verification.
export const CRITICAL_RUNTIME_PACKAGES = [
  "express",
  "jiti",
  "yaml",
  "music-metadata",
  "file-type",
  "google-auth-library",
  "@snazzah/davey",
];

// Safe command probes for smoke validation.
export const SMOKE_COMMANDS = [["--help"], ["channels", "--help"]];

export function isSafeMode() {
  const raw = String(process.env.OPENCLAW_BUNDLE_SAFE_MODE || "")
    .trim()
    .toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no") {
    return false;
  }
  return (
    String(process.env.CI || "")
      .trim()
      .toLowerCase() === "true"
  );
}
