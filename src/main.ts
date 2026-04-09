import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, NotebookTagsSettings, SettingTab } from "./settings";
import { notebookTagPlugin, renderMarkdownTags, updatePropertyTagPills } from "./tag-renderer";

export default class NotebookTagsPlugin extends Plugin {
	settings: NotebookTagsSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.registerEditorExtension(notebookTagPlugin(this));
		renderMarkdownTags(this);

		const refreshPropertyPills = () => updatePropertyTagPills(this);
		this.registerEvent(this.app.workspace.on("layout-change", refreshPropertyPills));
		this.registerEvent(this.app.workspace.on("file-open", refreshPropertyPills));
		refreshPropertyPills();
		this.addSettingTab(new SettingTab(this.app, this));
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<NotebookTagsSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
