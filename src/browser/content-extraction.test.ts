import { describe, expect, it } from "vitest";
import {
  buildReadPageFunction,
  buildReadTableFunction,
  buildSearchResultsFunction,
  searchUrl,
} from "./content-extraction.js";

describe("browser content extraction", () => {
  it("escapes selectors and clamps page limits", () => {
    const fn = buildReadPageFunction({
      selector: 'main[data-name="quoted"]',
      maxChars: 999_999,
      offset: -4,
    });
    expect(fn).toContain(JSON.stringify('main[data-name="quoted"]'));
    expect(fn).toContain("const maxChars = 40000");
    expect(fn).toContain("const offset = 0");
    expect(fn).toContain("hasMore");
    expect(fn).toContain("nextOffset");
  });

  it("preserves table structure and pagination", () => {
    const fn = buildReadTableFunction({ index: 2, maxRows: 5, offset: 10 });
    expect(fn).toContain("const index = 2");
    expect(fn).toContain("const maxRows = 5");
    expect(fn).toContain("const offset = 10");
    expect(fn).toContain("headers, rows");
  });

  it("normalizes common search engine result layouts", () => {
    const fn = buildSearchResultsFunction(7);
    expect(fn).toContain("const limit = 7");
    expect(fn).toContain("li.b_algo");
    expect(fn).toContain("title, url, snippet");
  });

  it("constructs encoded private browser search URLs", () => {
    expect(searchUrl({ query: "actual enrollment H. pylori", engine: "bing" })).toBe(
      "https://www.bing.com/search?q=actual%20enrollment%20H.%20pylori",
    );
  });
});
