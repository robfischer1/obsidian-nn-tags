import { editorLivePreviewField, setIcon } from "obsidian";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, ViewUpdate, EditorView } from "@codemirror/view";
import type NotebookTagsPlugin from "./main";
import type { NotebookNavigatorAPI } from "./notebook-navigator";
import { apiManager } from "./utils/api-manager";
import { normalizeTag, basenameFromTag, extractTagFromHref, getTagMetaWithInheritance } from "./utils/tag-utils";
import { decorateTagElement, storeOriginalTagState, restoreOriginalTagState } from "./utils/dom-utils";

const BASELINE_TAG_CLASS = "basename-tag";

interface DecoratorMetrics {
	elementsFound: number;
	elementsDecorated: number;
	errorCount: number;
	duration: number;
}

function sanitizeLog(value: string): string {
	return value.replace(/[\r\n]/g, "");
}

function logMetrics(context: string, metrics: DecoratorMetrics): void {
	if (metrics.duration > 100) {
		console.warn(`${sanitizeLog(context)} took ${metrics.duration.toFixed(2)}ms:`, metrics);
	} else if (metrics.errorCount > 0) {
		console.debug(`${sanitizeLog(context)}:`, metrics);
	}
}

function shouldSkipRange(nodeFrom: number, nodeTo: number, selections: readonly { from: number; to: number }[]) {
	return selections.some((selection) => nodeFrom <= selection.to && selection.from < nodeTo);
}

// Rebuilds the label (and optional icon) inside .multi-select-pill-content.
function setPillLabel(pill: HTMLElement, label: string, iconId?: string): void {
	const content = pill.querySelector<HTMLElement>(".multi-select-pill-content");
	if (!content) return;
	content.textContent = "";
	if (iconId) {
		const iconSpan = document.createElement("span");
		iconSpan.className = "nn-file-pill-inline-icon";
		iconSpan.setAttribute("aria-hidden", "true");
		try { setIcon(iconSpan, iconId); } catch { /* ignore unknown icon */ }
		content.appendChild(iconSpan);
	}
	content.appendChild(document.createTextNode(label));
}

// Applies NN metadata to a .multi-select-pill element.
// Color/background are set on the pill wrapper; label is rebuilt inside pill-content.
function decoratePillElement(pill: HTMLElement, rawTag: string, api: NotebookNavigatorAPI): void {
	const tag = normalizeTag(rawTag);
	const metadata = getTagMetaWithInheritance(api, tag);
	const label = basenameFromTag(tag);

	if (metadata?.backgroundColor) {
		pill.style.setProperty("--nn-file-tag-custom-bg", metadata.backgroundColor);
		pill.dataset.hasBackground = "true";
	} else {
		pill.style.removeProperty("--nn-file-tag-custom-bg");
		delete pill.dataset.hasBackground;
	}

	if (metadata?.color) {
		pill.style.color = metadata.color;
		pill.dataset.hasColor = "true";
	} else {
		pill.style.removeProperty("color");
		delete pill.dataset.hasColor;
	}

	setPillLabel(pill, label, metadata?.icon ?? undefined);
}

export function renderMarkdownTags(plugin: NotebookTagsPlugin) {
	plugin.registerMarkdownPostProcessor(async (element) => {
		try {
			const api = apiManager.getApi(plugin);
			if (!api) {
				console.debug("Markdown processor: Notebook Navigator API not available");
				return;
			}

			await api.whenReady();

			const metrics: DecoratorMetrics = {
				elementsFound: 0,
				elementsDecorated: 0,
				errorCount: 0,
				duration: 0,
			};
			const start = performance.now();

			element.querySelectorAll<HTMLAnchorElement>("a.tag").forEach((anchor) => {
				try {
					metrics.elementsFound++;
					const href = anchor.getAttribute("href") ?? anchor.innerText;
					const tag = extractTagFromHref(href);
					decorateTagElement(anchor, tag, api);
					storeOriginalTagState(anchor, tag);
					plugin.decoratedElements.add(anchor);
					metrics.elementsDecorated++;
				} catch (error) {
					metrics.errorCount++;
					console.error("Failed to decorate markdown tag:", error);
				}
			});

			metrics.duration = performance.now() - start;
			logMetrics("Markdown tag rendering", metrics);
		} catch (error) {
			console.error("Markdown post-processor error:", error);
		}
	});
}

export function updatePropertyTagPills(plugin: NotebookTagsPlugin) {
	try {
		const api = apiManager.getApi(plugin);
		const selector = `[data-property-key="tags"] .multi-select-pill:not(.${BASELINE_TAG_CLASS})`;

		const metrics: DecoratorMetrics = {
			elementsFound: 0,
			elementsDecorated: 0,
			errorCount: 0,
			duration: 0,
		};
		const start = performance.now();

		document.querySelectorAll<HTMLElement>(selector).forEach((pill) => {
			try {
				metrics.elementsFound++;
				const tagText = pill.querySelector(".multi-select-pill-content span")?.textContent
					?? pill.querySelector(".multi-select-pill-content")?.textContent
					?? "";
				if (!tagText) return;

				pill.classList.add(BASELINE_TAG_CLASS);
				storeOriginalTagState(pill, tagText);

				if (api?.isStorageReady()) {
					decoratePillElement(pill, tagText, api);
					metrics.elementsDecorated++;
				} else {
					setPillLabel(pill, basenameFromTag(tagText));
					metrics.elementsDecorated++;
				}

				plugin.decoratedElements.add(pill);
			} catch (error) {
				metrics.errorCount++;
				console.error(`Failed to decorate property tag "${sanitizeLog(pill.textContent ?? "")}":`, error);
			}
		});

		if (api && !api.isStorageReady()) {
			api.whenReady()
				.then(() => updatePropertyTagPills(plugin))
				.catch((error) => {
					console.error("API ready promise rejected:", error);
				});
		}

		metrics.duration = performance.now() - start;
		logMetrics("Property pill decoration", metrics);
	} catch (error) {
		console.error("Property pill update error:", error);
	}
}

export function cleanupPropertyTagPills(plugin: NotebookTagsPlugin): void {
	try {
		let cleanedCount = 0;
		plugin.decoratedElements.forEach((element) => {
			try {
				if (!element.isConnected) return;
				if (element.classList.contains("multi-select-pill")) {
					const originalTag = element.dataset.originalTag ?? "";
					const content = element.querySelector<HTMLElement>(".multi-select-pill-content");
					if (content) content.textContent = originalTag;
					delete element.dataset.originalTag;
					delete element.dataset.hasColor;
					delete element.dataset.hasBackground;
					element.style.removeProperty("--nn-file-tag-custom-bg");
					element.style.removeProperty("color");
					element.classList.remove(BASELINE_TAG_CLASS);
				} else {
					restoreOriginalTagState(element);
				}
				cleanedCount++;
			} catch (error) {
				console.error("Failed to restore tag element:", error);
			}
		});
		plugin.decoratedElements.clear();
		console.debug(`Cleaned up ${cleanedCount} decorated tag elements`);
	} catch (error) {
		console.error("Cleanup error:", error);
	}
}

class HashtagWidget extends WidgetType {
	constructor(
		private tag: string,
		private plugin: NotebookTagsPlugin
	) {
		super();
	}

	public toDOM(): HTMLElement {
		const wrapper = document.createElement("span");
		wrapper.classList.add("nm-tagged", BASELINE_TAG_CLASS);
		wrapper.setAttribute("data-tag", this.tag);
		wrapper.setAttribute("aria-label", `Tag: ${this.tag}`);

		const api = apiManager.getApi(this.plugin);

		if (api?.isStorageReady()) {
			this.applyDecoration(wrapper, api);
		} else if (api) {
			wrapper.textContent = basenameFromTag(this.tag);
			api.whenReady()
				.then(() => {
					if (wrapper.isConnected) {
						this.applyDecoration(wrapper, api);
					}
				})
				.catch((error) => {
					console.error(`Failed to decorate hashtag widget for "${sanitizeLog(this.tag)}":`, error);
				});
		} else {
			wrapper.textContent = basenameFromTag(this.tag);
		}

		return wrapper;
	}

	public ignoreEvent(): boolean {
		return true;
	}

	private applyDecoration(wrapper: HTMLElement, api: NotebookNavigatorAPI): void {
		try {
			decorateTagElement(wrapper, this.tag, api, { addNmTaggedClass: false });
		} catch (error) {
			console.error("Decoration failed:", error);
			wrapper.textContent = basenameFromTag(this.tag);
		}
	}

	public eq(other: WidgetType): boolean {
		return other instanceof HashtagWidget && other.tag === this.tag;
	}
}

class TagDecorations {
	public decorations = new RangeSetBuilder<Decoration>().finish();
	private view: EditorView;
	private plugin: NotebookTagsPlugin;

	constructor(view: EditorView, plugin: NotebookTagsPlugin) {
		this.view = view;
		this.plugin = plugin;
		this.decorations = this.buildDecorations(view);
	}

	public update(update: ViewUpdate) {
		if (update.docChanged || update.selectionSet || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	public destroy() {
		// Cleanup handled by plugin onunload
	}

	private buildDecorations(view: EditorView) {
		const builder = new RangeSetBuilder<Decoration>();

		try {
			if (!view.state.field(editorLivePreviewField)) {
				return builder.finish();
			}

			if (!this.plugin.settings.enableNotebookTags) {
				return builder.finish();
			}

			for (const range of view.visibleRanges) {
				let hashtagStart = 0;

				syntaxTree(view.state).iterate({
					from: range.from,
					to: range.to,
					enter: (node) => {
						if (node.type.name.includes("hashtag-begin")) {
							hashtagStart = node.to;
						}

						if (node.type.name.includes("hashtag-end")) {
							try {
								const tag = view.state.sliceDoc(hashtagStart, node.to);
								const extendedFrom = hashtagStart - 1;
								const extendedTo = node.to + 1;

								if (shouldSkipRange(extendedFrom, extendedTo, view.state.selection.ranges)) {
									return;
								}

								builder.add(
									hashtagStart - 1,
									node.to,
									Decoration.replace({
										widget: new HashtagWidget(tag, this.plugin),
									}),
								);
							} catch (error) {
								console.error("Failed to decorate hashtag:", error);
							}
						}
					},
				});
			}
		} catch (error) {
			console.error("Error building decorations:", error);
		}

		return builder.finish();
	}
}

export function notebookTagPlugin(plugin: NotebookTagsPlugin) {
	return ViewPlugin.fromClass(
		class extends TagDecorations {
			constructor(view: EditorView) {
				super(view, plugin);
			}
		},
		{
			decorations: (instance) => instance.decorations,
		}
	);
}
