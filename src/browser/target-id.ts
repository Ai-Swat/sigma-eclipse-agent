export type TargetIdResolution =
  | { ok: true; targetId: string }
  | { ok: false; reason: "not_found" | "ambiguous"; matches?: string[] };

export function resolveTargetIdFromTabs(
  input: string,
  tabs: Array<{ targetId: string; cdpTargetId?: string }>,
): TargetIdResolution {
  const needle = input.trim();
  if (!needle) {
    return { ok: false, reason: "not_found" };
  }

  const exact = tabs.find((t) => t.targetId === needle || t.cdpTargetId === needle);
  if (exact) {
    return { ok: true, targetId: exact.targetId };
  }

  const lower = needle.toLowerCase();
  const matches = tabs.flatMap((tab) => {
    const ids = [tab.targetId, tab.cdpTargetId].filter((id): id is string => Boolean(id));
    return ids.some((id) => id.toLowerCase().startsWith(lower)) ? [tab.targetId] : [];
  });
  const uniqueMatches = [...new Set(matches)];

  const only = uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
  if (only) {
    return { ok: true, targetId: only };
  }
  if (uniqueMatches.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: false, reason: "ambiguous", matches: uniqueMatches };
}
