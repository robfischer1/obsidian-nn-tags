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
import { livePreviewState, editorLivePreviewField } from "obsidian";

import { DEFAULT_SETTINGS, SettingTab, PluginSettings } from "./settings";
import registerPostProcessor, { getNNApi, applyNNMeta } from "./registerPostProcessor";

const BASETAG = "basename-tag";

/** Create a custom tag node from text content (can include #). */
const createTagNode = (text: string, readingMode: boolean, plugin: NotebookTags): HTMLElement => {
	const node = document.createElement("a");
	node.className = `tag ${BASETAG}`;
	node.target = "_blank";
	node.rel = "noopener";
	node.href = readingMode ? `${text}` : `#${text}`;

	const vaultStr = encodeURIComponent(plugin.app.vault.getName());
	const queryStr = `tag:${encodeURIComponent(text)}`;
	node.dataset.uri = `obsidian://search?vault=${vaultStr}&query=${queryStr}`;
	node.onclick = () => window.open(node.dataset.uri);

	const nn = getNNApi(plugin);
	if (nn?.isStorageReady()) {
		applyNNMeta(node, text, nn);
	} else {
		node.textContent = text.slice(text.lastIndexOf("/") + 1).replaceAll("#", "");
	}

	return node;
};

/** Create a tag node in the type of widget from text content. */
class TagWidget extends WidgetType {
	constructor(private text: string, private readingMode: boolean, private plugin: NotebookTags) {
		super();
	}

	toDOM(_view: EditorView): HTMLElement {
		return createTagNode(this.text, this.readingMode, this.plugin);
	}
}

class editorPlugin implements PluginValue {
	decorations: DecorationSet;
	view: EditorView;

	constructor(view: EditorView, private plugin: NotebookTags) {
		this.decorations = this.buildDecorations(view);
		this.view = view;
	}

	update(update: ViewUpdate): void {
		if (
			update.view.composing ||
			update.view.plugin(livePreviewState)?.mousedown
		) {
			this.decorations = this.decorations.map(update.changes);
		} else if (update.selectionSet || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		if (!view.state.field(editorLivePreviewField)) { return builder.finish(); }

		for (const { from, to } of view.visibleRanges) {
			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node) => {
					if (node.name.contains("hashtag-end")) {
						const extendedFrom = node.from - 1;
						const extendedTo = node.to + 1;
						for (const range of view.state.selection.ranges) {
							if (extendedFrom <= range.to && range.from < extendedTo) return;
						}
						const text = view.state.sliceDoc(node.from, node.to);
						builder.add(node.from - 1, node.to, Decoration.replace({
							widget: new TagWidget(text, false, this.plugin),
						}));
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

		return builder.finish();
	}
}

const rerenderProperty = (plugin: NotebookTags) => {
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
};

function makeEditorExtension(plugin: NotebookTags) {
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

export default class NotebookTags extends Plugin {
	public settings: PluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.registerEditorExtension(makeEditorExtension(this));

		registerPostProcessor(this);

		const rerender = () => rerenderProperty(this);
		this.registerEvent(this.app.workspace.on("layout-change", rerender));
		this.registerEvent(this.app.workspace.on("file-open", rerender));

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
