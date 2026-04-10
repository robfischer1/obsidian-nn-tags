import { debounce, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, NotebookTagsSettings, SettingTab } from "./settings";
import { notebookTagPlugin, renderMarkdownTags, updatePropertyTagPills, cleanupPropertyTagPills } from "./tag-renderer";
import { apiManager } from "./utils/api-manager";

export default class NotebookTagsPlugin extends Plugin {
	settings: NotebookTagsSettings = DEFAULT_SETTINGS;
	decoratedElements = new Set<HTMLElement>();

	async onload() {
		await this.loadSettings();
		this.registerEditorExtension(notebookTagPlugin(this));
		renderMarkdownTags(this);

		const debouncedRefresh = debounce(
			() => updatePropertyTagPills(this),
			300,
			true
		);

		this.registerEvent(this.app.workspace.on("layout-change", debouncedRefresh));
		this.registerEvent(this.app.workspace.on("file-open", debouncedRefresh));
		debouncedRefresh();
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload(): void {
		cleanupPropertyTagPills(this);
		apiManager.clearCache();
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<NotebookTagsSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
