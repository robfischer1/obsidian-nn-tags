import { editorLivePreviewField } from "obsidian";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, ViewUpdate, EditorView } from "@codemirror/view";
import type NotebookTagsPlugin from "./main";
import type { NotebookNavigatorAPI } from "./notebook-navigator";
import { apiManager } from "./utils/api-manager";
import { basenameFromTag, extractTagFromHref } from "./utils/tag-utils";
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
		const selector = `[data-property-key="tags"] .multi-select-pill-content span:not(.${BASELINE_TAG_CLASS})`;

		const metrics: DecoratorMetrics = {
			elementsFound: 0,
			elementsDecorated: 0,
			errorCount: 0,
			duration: 0,
		};
		const start = performance.now();

		document.querySelectorAll<HTMLElement>(selector).forEach((span) => {
			try {
				metrics.elementsFound++;
				const tagText = span.textContent ?? "";
				span.classList.add(BASELINE_TAG_CLASS);
				storeOriginalTagState(span, tagText);

				if (api?.isStorageReady()) {
					decorateTagElement(span, tagText, api);
					metrics.elementsDecorated++;
				} else {
					span.textContent = basenameFromTag(tagText);
					metrics.elementsDecorated++;
				}

				plugin.decoratedElements.add(span);
			} catch (error) {
				metrics.errorCount++;
				console.error(`Failed to decorate property tag "${sanitizeLog(span.textContent ?? "")}":`, error);
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
				if (element.isConnected) {
					restoreOriginalTagState(element);
					cleanedCount++;
				}
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

function createTagWidget(tag: string, plugin: NotebookTagsPlugin): HTMLElement {
	const wrapper = document.createElement("span");
	wrapper.classList.add("nm-tagged", BASELINE_TAG_CLASS);

	const api = apiManager.getApi(plugin);
	const label = basenameFromTag(tag);

	try {
		if (api) {
			if (api.isStorageReady()) {
				decorateTagElement(wrapper, tag, api, { addNmTaggedClass: false });
			} else {
				wrapper.textContent = label;
				api.whenReady()
					.then(() => decorateTagElement(wrapper, tag, api, { addNmTaggedClass: false }))
					.catch((error) => {
						console.error(`Failed to decorate frontmatter tag "${sanitizeLog(tag)}":`, error);
					});
			}
		} else {
			wrapper.textContent = label;
		}
	} catch (error) {
		console.error("Widget creation error:", error);
		wrapper.textContent = label;
	}

	plugin.decoratedElements.add(wrapper);
	return wrapper;
}

class FrontmatterTagWidget extends WidgetType {
	constructor(
		private text: string,
		private plugin: NotebookTagsPlugin
	) {
		super();
	}

	public toDOM(): HTMLElement {
		return createTagWidget(this.text, this.plugin);
	}

	public ignoreEvent(): boolean {
		return true;
	}

	public eq(other: WidgetType): boolean {
		return other instanceof FrontmatterTagWidget && other.text === this.text;
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
