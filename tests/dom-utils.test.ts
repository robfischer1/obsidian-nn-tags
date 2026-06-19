import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
	setIcon: vi.fn(),
}));

import { sanitizeLog } from "../src/utils/dom-utils";

describe("sanitizeLog", () => {
	it("strips newlines from a string", () => {
		expect(sanitizeLog("hello\nworld")).toBe("helloworld");
	});

	it("strips carriage returns from a string", () => {
		expect(sanitizeLog("hello\rworld")).toBe("helloworld");
	});

	it("strips mixed CR/LF sequences", () => {
		expect(sanitizeLog("a\r\nb\nc\rd")).toBe("abcd");
	});

	it("returns the string unchanged when no CR/LF present", () => {
		expect(sanitizeLog("clean string")).toBe("clean string");
	});

	it("handles an empty string", () => {
		expect(sanitizeLog("")).toBe("");
	});
});
