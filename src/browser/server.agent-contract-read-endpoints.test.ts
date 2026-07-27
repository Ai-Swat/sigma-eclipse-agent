import { describe, expect, it } from "vitest";
import {
  installAgentContractHooks,
  postJson,
  startServerAndBase,
} from "./server.agent-contract.test-harness.js";
import {
  getBrowserControlServerTestState,
  getPwMocks,
} from "./server.control-server.test-harness.js";

const state = getBrowserControlServerTestState();
const pwMocks = getPwMocks();

describe("browser research routes", () => {
  installAgentContractHooks();

  it("evaluates readable page content with bounded pagination", async () => {
    const base = await startServerAndBase();
    const result = await postJson<{ targetId: string; result: unknown }>(`${base}/read`, {
      selector: "main",
      maxChars: 1200,
      offset: 400,
    });
    expect(result.targetId).toBe("abcd1234");
    expect(pwMocks.evaluateViaPlaywright).toHaveBeenCalledWith(
      expect.objectContaining({
        cdpUrl: state.cdpBaseUrl,
        targetId: "abcd1234",
        fn: expect.stringContaining("const maxChars = 1200"),
      }),
    );
  });

  it("evaluates structured tables", async () => {
    const base = await startServerAndBase();
    const result = await postJson<{ targetId: string; result: unknown }>(`${base}/table`, {
      index: 1,
      maxRows: 20,
    });
    expect(result.targetId).toBe("abcd1234");
    expect(pwMocks.evaluateViaPlaywright).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: expect.stringContaining("const maxRows = 20"),
      }),
    );
  });

  it("navigates and extracts normalized search results", async () => {
    const base = await startServerAndBase();
    const result = await postJson<{
      targetId: string;
      query: string;
      engine: string;
    }>(`${base}/search`, {
      query: "actual enrollment H. pylori",
      engine: "bing",
      maxResults: 5,
    });
    expect(result.query).toBe("actual enrollment H. pylori");
    expect(result.engine).toBe("bing");
    expect(pwMocks.navigateViaPlaywright).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.bing.com/search?q=actual%20enrollment%20H.%20pylori",
      }),
    );
    expect(pwMocks.evaluateViaPlaywright).toHaveBeenCalledWith(
      expect.objectContaining({
        fn: expect.stringContaining("const limit = 5"),
      }),
    );
  });
});
