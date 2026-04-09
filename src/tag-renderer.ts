import { setIcon, editorLivePreviewField } from "obsidian";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, ViewUpdate, EditorView } from "@codemirror/view";
import type NotebookTagsPlugin from "./main";
import type { NotebookNavigatorAPI } from "./notebook-navigator";

const BASELINE_TAG_CLASS = "basename-tag";

type EmptyableElement = HTMLElement & { empty?: () => void };

interface AppWithPlugins {
	plugins: {
		plugins: Record<string, { api?: NotebookNavigatorAPI }>;
	};
}

function getNotebookNavigatorApi(plugin: NotebookTagsPlugin): NotebookNavigatorAPI | undefined {
	const appWithPlugins = plugin.app as unknown as AppWithPlugins;
	return appWithPlugins?.plugins?.plugins?.["notebook-navigator"]?.api;
}

function normalizeTag(tag: string): string {
	return tag.startsWith("#") ? tag.slice(1) : tag;
}

function basenameFromTag(tag: string): string {
	return tag.slice(tag.lastIndexOf("/") + 1).replaceAll("#", "");
}

function clearElement(element: HTMLElement) {
	const emptyElement = element as EmptyableElement;
	if (typeof emptyElement.empty === "function") {
		emptyElement.empty();
	} else {
		element.textContent = "";
	}
}

function decorateTagElement(element: HTMLElement, rawTag: string, api: NotebookNavigatorAPI) {
	const tag = normalizeTag(rawTag);
	const metadata = api.metadata.getTagMeta(tag);
	const label = basenameFromTag(tag);
	clearElement(element);
	element.classList.add("nm-tagged");

	if (metadata?.icon) {
		element.classList.add("has-icon");
		element.setAttribute("data-icon", metadata.icon);
		setIcon(element, metadata.icon);
		if (metadata.color) {
			element.style.color = metadata.color;
		}
		// Append label as text node after icon to preserve SVG
		element.appendChild(document.createTextNode(label));
	} else {
		element.appendChild(document.createTextNode(label));
	}

	if (metadata?.color) {
		element.style.setProperty("--nm-tag-color", metadata.color);
	} else {
		element.style.removeProperty("--nm-tag-color");
	}

	if (metadata?.backgroundColor) {
		element.style.setProperty("--nm-tag-background", metadata.backgroundColor);
	} else {
		element.style.removeProperty("--nm-tag-background");
	}
}

export function renderMarkdownTags(plugin: NotebookTagsPlugin) {
	plugin.registerMarkdownPostProcessor(async (element) => {
		const api = getNotebookNavigatorApi(plugin);
		if (!api) {
			return;
		}
		await api.whenReady();
		element.querySelectorAll<HTMLAnchorElement>("a.tag").forEach((anchor) => {
			const href = anchor.getAttribute("href") ?? anchor.innerText;
			decorateTagElement(anchor, href, api);
		});
	});
}

export function updatePropertyTagPills(plugin: NotebookTagsPlugin) {
	const api = getNotebookNavigatorApi(plugin);
	const selector = `[data-property-key="tags"] .multi-select-pill-content span:not(.${BASELINE_TAG_CLASS})`;
	document.querySelectorAll<HTMLElement>(selector).forEach((span) => {
		const tagText = span.textContent ?? "";
		span.classList.add(BASELINE_TAG_CLASS);
		span.dataset.tag = tagText;
		if (api?.isStorageReady()) {
			decorateTagElement(span, tagText, api);
		} else {
			span.textContent = basenameFromTag(tagText);
		}
	});

	if (api && !api.isStorageReady()) {
		api.whenReady().then(() => updatePropertyTagPills(plugin)).catch(() => {
			/* ignore */
		});
	}
}

function createTagWidget(tag: string, plugin: NotebookTagsPlugin): HTMLElement {
	const wrapper = document.createElement("span");
	wrapper.className = "tag";
	wrapper.classList.add(BASELINE_TAG_CLASS);
	wrapper.role = "button";
	wrapper.tabIndex = 0;
	wrapper.onclick = (event) => {
		event.preventDefault();
		event.stopPropagation();
		const api = getNotebookNavigatorApi(plugin);
		api?.navigation.navigateToTag(tag).catch(() => {
			/* ignore */
		});
	};

	const api = getNotebookNavigatorApi(plugin);
	const label = basenameFromTag(tag);
	if (api) {
		if (api.isStorageReady()) {
			decorateTagElement(wrapper, tag, api);
		} else {
			wrapper.textContent = label;
			api.whenReady().then(() => decorateTagElement(wrapper, tag, api)).catch(() => {
				/* ignore */
			});
		}
	} else {
		wrapper.textContent = label;
	}

	return wrapper;
}

class FrontmatterTagWidget extends WidgetType {
	constructor(private text: string, private plugin: NotebookTagsPlugin) {
		super();
	}

	public toDOM(): HTMLElement {
		return createTagWidget(this.text, this.plugin);
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
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	public destroy() {
		// no-op
	}

	private buildDecorations(view: EditorView) {
		const builder = new RangeSetBuilder<Decoration>();
		if (!view.state.field(editorLivePreviewField)) {
			return builder.finish();
		}

		const api = getNotebookNavigatorApi(this.plugin);
		if (!this.plugin.settings.enableNotebookTags) {
			return builder.finish();
		}

		try {
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
							const tag = view.state.sliceDoc(hashtagStart, node.to);
							if (api?.isStorageReady()) {
								const metadata = api.metadata.getTagMeta(tag);
								let style = "";
								if (metadata?.color) {
									style += `color: ${metadata.color}; `;
								}
								if (metadata?.backgroundColor) {
									style += `background-color: ${metadata.backgroundColor}; `;
								}
								builder.add(
									hashtagStart - 1,
									node.to,
									Decoration.mark({
										attributes: {
											"data-tag-value": tag,
											style,
										},
										class: `cm-hashtag-inner cm-hashtag cm-meta cm-tag-${tag.replace(/[^a-zA-Z0-9]/g, "-")}`,
									})
								);
							}
						}

						if (node.name === "hmd-frontmatter") {
							const frontmatterStart = node.from;
							const frontmatterEnd = node.to + 1;
							for (const selection of view.state.selection.ranges) {
								if (frontmatterStart <= selection.to && selection.from < frontmatterEnd) {
									return;
								}
							}

							let fieldName = "";
							let cursor = node.node;
							for (let i = 0; i < 20 && cursor; i++) {
								cursor = cursor.prevSibling ?? node.node;
								if (cursor?.name.includes("atom")) {
									fieldName = view.state.sliceDoc(cursor.from, cursor.to);
									break;
								}
							}

							if (fieldName.toLowerCase() !== "tags" && fieldName.toLowerCase() !== "tag") {
								return;
							}

							const tagText = view.state.sliceDoc(node.node.from, node.node.to);
							const tags = tagText.split(" ").filter((text) => text !== "");
							let offset = node.node.from;
							for (const tag of tags) {
								builder.add(offset, offset + tag.length, Decoration.replace({ widget: new FrontmatterTagWidget(tag, this.plugin) }));
								offset += tag.length + 1;
							}
						}
					},
				});
			}
		} catch (error) {
			console.error("Can not build tag decorations", error);
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
