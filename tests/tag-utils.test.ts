import { describe, it, expect } from "vitest";
import {
	normalizeTag,
	basenameFromTag,
	getParentTagLevels,
	extractTagFromHref,
	getTagMetaWithInheritance,
} from "../src/utils/tag-utils";
import type { NotebookNavigatorAPI, TagMetadata } from "../src/notebook-navigator";

// ---------------------------------------------------------------------------
// normalizeTag
// ---------------------------------------------------------------------------
describe("normalizeTag", () => {
	it("strips a leading # from a tag", () => {
		expect(normalizeTag("#status")).toBe("status");
	});

	it("returns the tag unchanged when no leading #", () => {
		expect(normalizeTag("status")).toBe("status");
	});

	it("strips only the first # from a nested tag", () => {
		expect(normalizeTag("#brainsoup/idea")).toBe("brainsoup/idea");
	});

	it("handles an empty string", () => {
		expect(normalizeTag("")).toBe("");
	});

	it("handles a bare #", () => {
		expect(normalizeTag("#")).toBe("");
	});

	it("does not strip # in the middle of a tag", () => {
		expect(normalizeTag("foo#bar")).toBe("foo#bar");
	});
});

// ---------------------------------------------------------------------------
// basenameFromTag
// ---------------------------------------------------------------------------
describe("basenameFromTag", () => {
	it("returns the last segment of a nested tag", () => {
		expect(basenameFromTag("brainsoup/idea")).toBe("idea");
	});

	it("strips # and returns the last segment", () => {
		expect(basenameFromTag("#brainsoup/idea")).toBe("idea");
	});

	it("returns the tag itself for a root-level tag", () => {
		expect(basenameFromTag("status")).toBe("status");
	});

	it("strips # from a root-level tag", () => {
		expect(basenameFromTag("#status")).toBe("status");
	});

	it("handles a deeply nested tag", () => {
		expect(basenameFromTag("a/b/c/d")).toBe("d");
	});

	it("handles an empty string", () => {
		expect(basenameFromTag("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// getParentTagLevels
// ---------------------------------------------------------------------------
describe("getParentTagLevels", () => {
	it("returns an empty array for a single-segment tag", () => {
		expect(getParentTagLevels("status")).toEqual([]);
	});

	it("returns an empty array for a single-segment tag with #", () => {
		expect(getParentTagLevels("#status")).toEqual([]);
	});

	it("returns one parent for a 2-level tag", () => {
		expect(getParentTagLevels("brainsoup/idea")).toEqual(["brainsoup"]);
	});

	it("strips # before computing parents", () => {
		expect(getParentTagLevels("#brainsoup/idea")).toEqual(["brainsoup"]);
	});

	it("returns parents from most to least specific for a 3-level tag", () => {
		expect(getParentTagLevels("a/b/c")).toEqual(["a/b", "a"]);
	});

	it("returns parents for a 4-level tag", () => {
		expect(getParentTagLevels("a/b/c/d")).toEqual(["a/b/c", "a/b", "a"]);
	});

	it("returns an empty array for an empty string", () => {
		expect(getParentTagLevels("")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// extractTagFromHref
// ---------------------------------------------------------------------------
describe("extractTagFromHref", () => {
	it("strips a leading # from an href", () => {
		expect(extractTagFromHref("#status")).toBe("status");
	});

	it("returns the href unchanged when no leading #", () => {
		expect(extractTagFromHref("status")).toBe("status");
	});

	it("strips # from a nested href", () => {
		expect(extractTagFromHref("#brainsoup/idea")).toBe("brainsoup/idea");
	});

	it("handles an empty string", () => {
		expect(extractTagFromHref("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// getTagMetaWithInheritance
// ---------------------------------------------------------------------------
describe("getTagMetaWithInheritance", () => {
	function makeMockApi(
		metaMap: Record<string, TagMetadata | null>,
	): NotebookNavigatorAPI {
		return {
			metadata: {
				getTagMeta(tag: string): TagMetadata | null {
					return metaMap[tag] ?? null;
				},
			},
		} as unknown as NotebookNavigatorAPI;
	}

	it("returns own metadata when the tag has full metadata", () => {
		const api = makeMockApi({
			"brainsoup/idea": { color: "#ff0000", backgroundColor: "#00ff00" },
		});
		expect(getTagMetaWithInheritance(api, "brainsoup/idea")).toEqual({
			color: "#ff0000",
			backgroundColor: "#00ff00",
		});
	});

	it("returns null when no metadata exists at any level", () => {
		const api = makeMockApi({});
		expect(getTagMetaWithInheritance(api, "brainsoup/idea")).toBeNull();
	});

	it("inherits color from a parent when own color is missing", () => {
		const api = makeMockApi({
			brainsoup: { color: "#ff0000" },
		});
		const result = getTagMetaWithInheritance(api, "brainsoup/idea");
		expect(result).toEqual({ color: "#ff0000" });
	});

	it("inherits backgroundColor from a parent when own is missing", () => {
		const api = makeMockApi({
			brainsoup: { backgroundColor: "#00ff00" },
		});
		const result = getTagMetaWithInheritance(api, "brainsoup/idea");
		expect(result).toEqual({ backgroundColor: "#00ff00" });
	});

	it("does not override own color with parent color", () => {
		const api = makeMockApi({
			"brainsoup/idea": { color: "#111111" },
			brainsoup: { color: "#222222", backgroundColor: "#333333" },
		});
		const result = getTagMetaWithInheritance(api, "#brainsoup/idea");
		expect(result).toEqual({
			color: "#111111",
			backgroundColor: "#333333",
		});
	});

	it("walks up multiple parent levels for inheritance", () => {
		const api = makeMockApi({
			a: { color: "#aaa", backgroundColor: "#bbb" },
		});
		const result = getTagMetaWithInheritance(api, "a/b/c");
		expect(result).toEqual({ color: "#aaa", backgroundColor: "#bbb" });
	});

	it("overwrites color from farther parent when nearer parent also has color", () => {
		// NOTE: current implementation does not short-circuit per-property;
		// needsColor / needsBackgroundColor are computed once before the loop.
		// A nearer parent's color gets overwritten by a farther parent's color
		// unless the early-exit condition (both color AND backgroundColor found)
		// fires first. This test documents the actual behavior.
		const api = makeMockApi({
			"a/b": { color: "#near" },
			a: { color: "#far", backgroundColor: "#bg" },
		});
		const result = getTagMetaWithInheritance(api, "a/b/c");
		expect(result).toEqual({ color: "#far", backgroundColor: "#bg" });
	});

	it("stops inheriting once both color and backgroundColor are found", () => {
		const api = makeMockApi({
			"a/b": { color: "#near", backgroundColor: "#nearBg" },
			a: { color: "#far", backgroundColor: "#farBg" },
		});
		const result = getTagMetaWithInheritance(api, "a/b/c");
		// Both found at a/b, so the loop breaks before reaching a
		expect(result).toEqual({ color: "#near", backgroundColor: "#nearBg" });
	});

	it("returns null for a root-level tag with no metadata", () => {
		const api = makeMockApi({});
		expect(getTagMetaWithInheritance(api, "status")).toBeNull();
	});

	it("returns own metadata for a root-level tag with metadata", () => {
		const api = makeMockApi({
			status: { color: "#123" },
		});
		expect(getTagMetaWithInheritance(api, "status")).toEqual({
			color: "#123",
		});
	});

	it("preserves icon from own metadata without inheritance", () => {
		const api = makeMockApi({
			"brainsoup/idea": { icon: "lucide:star" },
			brainsoup: { color: "#fff" },
		});
		const result = getTagMetaWithInheritance(api, "brainsoup/idea");
		expect(result).toEqual({ icon: "lucide:star", color: "#fff" });
	});
});
