import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  buildReadPageFunction,
  buildReadTableFunction,
  buildSearchResultsFunction,
} from "../src/browser/content-extraction.js";

type EvalTask = {
  id: string;
  kind: "read" | "table" | "search";
  html: string;
  request?: Record<string, unknown>;
  expected: string;
};

const root = path.resolve(import.meta.dirname, "..");
const tasksPath = path.join(root, "test", "fixtures", "browser-reading", "tasks.json");
const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8")) as EvalTask[];
const executablePath =
  process.env.BROWSER_READING_EVAL_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const results: Array<{
  id: string;
  passed: boolean;
  toolCalls: number;
  compacted: boolean;
  elapsedMs: number;
}> = [];

try {
  for (const task of tasks) {
    const started = performance.now();
    await page.setContent(task.html, { waitUntil: "domcontentloaded" });
    const request = task.request ?? {};
    const fn =
      task.kind === "read"
        ? buildReadPageFunction(request)
        : task.kind === "table"
          ? buildReadTableFunction(request)
          : buildSearchResultsFunction(request.maxResults);
    const output = await page.evaluate((fnBody) => {
      // Same invocation semantics as evaluateViaPlaywright.
      // eslint-disable-next-line no-eval
      const candidate = eval(`(${fnBody})`) as () => unknown;
      return candidate();
    }, fn);
    const serialized = JSON.stringify(output);
    results.push({
      id: task.id,
      passed: serialized.includes(task.expected),
      toolCalls: 1,
      compacted: false,
      elapsedMs: Math.round(performance.now() - started),
    });
  }
} finally {
  await browser.close();
}

const passed = results.filter((result) => result.passed).length;
const report = {
  generatedAt: new Date().toISOString(),
  taskCount: results.length,
  passed,
  passRate: passed / results.length,
  totalToolCalls: results.reduce((sum, result) => sum + result.toolCalls, 0),
  compactionCount: results.filter((result) => result.compacted).length,
  results,
};
const outputPath = process.env.BROWSER_READING_EVAL_OUTPUT;
if (outputPath) {
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report, null, 2));
if (passed !== results.length) {
  process.exitCode = 1;
}
