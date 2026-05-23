import { setIcon } from "obsidian";
import type { NotebookNavigatorAPI, TagMetadata } from "../notebook-navigator";
import { normalizeTag, basenameFromTag, getTagMetaWithInheritance } from "./tag-utils";

export function sanitizeLog(value: string): string {
	return value.replace(/[\r\n]/g, "");
}

type EmptyableElement = HTMLElement & { empty?: () => void };

function clearElement(element: HTMLElement): void {
	const emptyElement = element as EmptyableElement;
	if (typeof emptyElement.empty === "function") {
		emptyElement.empty();
	} else {
		element.textContent = "";
	}
}

/**
 * Applies color, background-color, and dataset flags from tag metadata to an element.
 * Shared by both `decorateTagElement` (markdown/editor tags) and `decoratePillElement`
 * (frontmatter property pills) to avoid duplicating CSS property application logic.
 */
export function applyTagStyles(element: HTMLElement, metadata: TagMetadata | null | undefined): void {
	if (metadata?.backgroundColor) {
		element.style.setProperty("--nn-file-tag-custom-bg", metadata.backgroundColor);
		element.dataset.hasBackground = "true";
	} else {
		element.style.removeProperty("--nn-file-tag-custom-bg");
		delete element.dataset.hasBackground;
	}

	if (metadata?.color) {
		element.style.color = metadata.color;
		element.dataset.hasColor = "true";
	} else {
		element.style.removeProperty("color");
		delete element.dataset.hasColor;
	}
}

export interface DecorateTagOptions {
	addNmTaggedClass?: boolean;
}

export function decorateTagElement(
	element: HTMLElement,
	rawTag: string,
	api: NotebookNavigatorAPI,
	options: DecorateTagOptions = {}
): void {
	const { addNmTaggedClass = true } = options;

	try {
		const tag = normalizeTag(rawTag);
		const metadata = getTagMetaWithInheritance(api, tag);
		const label = basenameFromTag(tag);

		clearElement(element);

		if (addNmTaggedClass) {
			element.classList.add("nm-tagged");
		}

		element.setAttribute("data-full-tag", tag);

		applyTagStyles(element, metadata);

		// Wrap icon in a dedicated child span (nn-file-pill-inline-icon) so it
		// gets the correct 12×12 sizing from styles.css, matching NN's structure.
		if (metadata?.icon) {
			element.setAttribute("data-icon", metadata.icon);
			const iconSpan = document.createElement("span");
			iconSpan.className = "nn-file-pill-inline-icon";
			iconSpan.setAttribute("aria-hidden", "true");
			try {
				setIcon(iconSpan, metadata.icon);
			} catch (iconError) {
				console.warn(`Failed to set icon "${sanitizeLog(metadata.icon)}" for tag "${sanitizeLog(tag)}":`, iconError);
			}
			element.appendChild(iconSpan);
		}

		element.appendChild(document.createTextNode(label));
	} catch (error) {
		console.error(`Failed to decorate tag element for "${sanitizeLog(rawTag)}":`, error);
		clearElement(element);
		element.textContent = basenameFromTag(rawTag);
	}
}

export function storeOriginalTagState(element: HTMLElement, tagText: string): void {
	element.dataset.originalTag = tagText;
	if (element.children.length === 0) {
		element.dataset.originalText = element.textContent ?? "";
	}
	element.classList.add("nm-decorated-tag");
}

export function restoreOriginalTagState(element: HTMLElement): void {
	if (element.dataset.originalText !== undefined) {
		element.textContent = element.dataset.originalText;
		delete element.dataset.originalText;
	} else {
		element.textContent = element.dataset.originalTag ?? "";
	}
	delete element.dataset.originalTag;
	delete element.dataset.hasColor;
	delete element.dataset.hasBackground;
	element.style.removeProperty("--nn-file-tag-custom-bg");
	element.style.removeProperty("color");
	element.classList.remove("nm-decorated-tag");
	element.classList.remove("nm-tagged");
}
