import { Plugin } from "obsidian";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { editorLivePreviewField } from 'obsidian';

import { DEFAULT_SETTINGS, SettingTab, PluginSettings } from "./settings";
import registerPostProcessor, { getNNApi, applyNNMeta } from "./registerPostProcessor";

const BASETAG = "basename-tag";

/** Create a custom tag node from text content (can include #). */
const createTagNode = (text: string, readingMode: boolean, plugin: NotebookTagsPlugin): HTMLElement => {
	const node = document.createElement("span");
	node.className = `tag ${BASETAG}`;
	node.role = "button";
	node.tabIndex = 0;

	const nn = getNNApi(plugin);
	const fallbackLabel = text.slice(text.lastIndexOf("/") + 1).replaceAll("#", "");

	node.onclick = (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (nn) {
			nn.navigation.navigateToTag(text).catch(() => {});
		}
	};

	if (nn) {
		if (nn.isStorageReady()) {
			applyNNMeta(node, text, nn);
		} else {
			node.textContent = fallbackLabel;
			nn.whenReady().then(() => applyNNMeta(node, text, nn)).catch(() => {});
		}
	} else {
		node.textContent = fallbackLabel;
	}

	return node;
};

/** Create a tag node in the type of widget from text content. */
class TagWidget extends WidgetType {
	constructor(private text: string, private readingMode: boolean, private plugin: NotebookTagsPlugin) {
		super();
	}

	toDOM(_view: EditorView): HTMLElement {
		return createTagNode(this.text, this.readingMode, this.plugin);
	}
}

class editorPlugin implements PluginValue {
	decorations: DecorationSet;
	view: EditorView;

	constructor(view: EditorView, private plugin: NotebookTagsPlugin) {
		this.decorations = this.buildDecorations(view);
		this.view = view;
	}

	update(update: ViewUpdate): void {
			//@ts-ignore eslint-disable-next-line @typescript-eslint/no-unsafe-member-access 
			if (update.docChanged || update.viewportChanged || update.transactions?.[0]?.annotations?.[0]?.value) {
				this.decorations = this.buildDecorations(update.view);
			}
		}
	buildDecorations(view: EditorView): DecorationSet {			/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */		const builder = new RangeSetBuilder<Decoration>();
		if (!view.state.field(editorLivePreviewField)) { return builder.finish(); }

		try {
			if (this.plugin.settings.enableNotebookTags) {
				for (let { from, to } of view.visibleRanges) {
					let tagTextStart = 0;

					syntaxTree(view.state).iterate({
						from,
						to,
						enter: (node: any) => {
							if (node.type.name.contains("hashtag-begin")) {
								tagTextStart = node.to;
							}

							if (node.type.name.contains("hashtag-end")) {
								let tagId = view.state.sliceDoc(tagTextStart, node.to);
								let nn = getNNApi(this.plugin);

								if (nn && nn.isStorageReady()) {
									const meta = nn.metadata.getTagMeta(tagId);
									let styleText = '';
									if (meta?.color) styleText += `color: ${meta.color}; `;
									if (meta?.backgroundColor) styleText += `background-color: ${meta.backgroundColor}; `;

									builder.add(tagTextStart - 1, node.to, Decoration.mark({
										attributes: {
											"data-tag-value": tagId,
											style: styleText
										},
										class: "cm-hashtag-inner cm-hashtag cm-meta cm-tag-" + tagId.replace(/[^a-zA-Z0-9]/g, '-')
									}));
								}
							}

							if (node.name === "hmd-frontmatter") {
								const extendedFrom = node.from;
								const extendedTo = node.to + 1;
								for (const range of view.state.selection.ranges) {
									if (extendedFrom <= range.to && range.from < extendedTo) return;
								}

								let frontmatterName = "";
								let currentNode = node.node;
								for (let i = 0; i < 20; i++) {
									currentNode = currentNode.prevSibling ?? node.node;
									if (currentNode?.name.contains("atom")) {
										frontmatterName = view.state.sliceDoc(currentNode.from, currentNode.to);
										break;
									}
								}

								if (frontmatterName.toLowerCase() !== "tags" && frontmatterName.toLowerCase() !== "tag") return;

								const contentNode = node.node;
								const content = view.state.sliceDoc(contentNode.from, contentNode.to);
								const tagsArray = content.split(" ").filter((tag) => tag !== "");

								let currentIndex = contentNode.from;
								for (const tag of tagsArray) {
									builder.add(currentIndex, currentIndex + tag.length, Decoration.replace({
										widget: new TagWidget(tag, false, this.plugin),
									}));
									currentIndex += tag.length + 1;
								}
							}
						},
					});
				}
			}
		} catch {
			console.error("Can not build tag decorations");
		}
		/* eslint-enable */

		return builder.finish();
	}
}

const rerenderProperty = (plugin: NotebookTagsPlugin) => {
	const nn = getNNApi(plugin);

	document
		.querySelectorAll<HTMLSpanElement>(
			`[data-property-key="tags"] .multi-select-pill-content span:not(.${BASETAG})`,
		)
		.forEach((node) => {
			const text = node.textContent ?? "";
			node.className = BASETAG;
			node.dataset.tag = text;

			if (nn?.isStorageReady()) {
				applyNNMeta(node, text, nn);
			} else {
				node.textContent = text.slice(text.lastIndexOf("/") + 1);
			}
		});

	if (nn && !nn.isStorageReady()) {
		nn.whenReady().then(() => rerenderProperty(plugin)).catch(() => {});
	}
};

function makeEditorExtension(plugin: NotebookTagsPlugin) {
	return ViewPlugin.fromClass(
		class extends editorPlugin {
			constructor(view: EditorView) { super(view, plugin); }
		},
		{
			decorations: (value) =>
				plugin.settings.enableNotebookTags
					? value.decorations
					: new RangeSetBuilder<Decoration>().finish(),
		}
	);
}

export default class NotebookTagsPlugin extends Plugin {
	public settings: PluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.registerEditorExtension(makeEditorExtension(this));

		registerPostProcessor(this);

		const rerender = () => rerenderProperty(this);
		this.registerEvent(this.app.workspace.on("layout-change", rerender));
		this.registerEvent(this.app.workspace.on("file-open", rerender));
		rerender();

		this.addSettingTab(new SettingTab(this.app, this));
	}

	async loadSettings() {
		const saved = await this.loadData() as Partial<PluginSettings>;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
