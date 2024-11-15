import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, WorkspaceLeaf, ItemView, ViewStateResult } from 'obsidian';

interface FMISettings {
	attachmentsFolder: string;
	mySetting: string;
}

const DEFAULT_SETTINGS: FMISettings = {
	attachmentsFolder: '',
	mySetting: 'default'
}

const VIEW_TYPE_RESULTS = "vts-results-view";

class ResultsView extends ItemView {
	private content: string = '';

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RESULTS;
	}

	getDisplayText(): string {
		return "VTS Results";
	}

	async setContent(content: string) {
		this.content = content;
		await this.updateView();
	}

	async updateView() {
		const container = this.containerEl.children[1];
		container.empty();
		
		const headerContainer = container.createDiv({
			cls: 'vts-results-header'
		});
		
		headerContainer.createEl('h2', { text: 'Find Missing Images' });
		
		const copyButton = headerContainer.createEl('button', {
			cls: 'vts-copy-button',
			text: 'Copy Results'
		});
		
		copyButton.addEventListener('click', () => {
			navigator.clipboard.writeText(this.content);
			new Notice('Results copied to clipboard!');
		});
		
		const contentDiv = container.createDiv({
			cls: 'vts-results-content'
		});

		contentDiv.style.fontSize = '0.7em';

		this.content.split('\n').forEach(line => {
			const lineEl = contentDiv.createDiv();
			lineEl.innerHTML = line;
		});
	}
}

export default class FMI extends Plugin {
	settings: FMISettings;
	private resultsView: ResultsView;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SampleSettingTab(this.app, this));
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		this.addCommand({
			id: 'find-broken-image-links',
			name: 'Search',
			callback: () => {
				this.findBrokenImageLinks();
			}
		});

		this.registerView(
			VIEW_TYPE_RESULTS,
			(leaf) => (this.resultsView = new ResultsView(leaf))
		);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_RESULTS);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private extractImageLinks(line: string): string[] {
		const regex = /!?\[\[(.*?\.(jpg|jpeg|png|gif|bmp))(?:\|.*?)?\]\]/gi;
		const matches: string[] = [];
		let match;

		while ((match = regex.exec(line)) !== null) {
			const fullPath = match[1];
			const filename = fullPath.split('/').pop() || '';
			matches.push(filename);
		}
		return matches;
	}

	private async imageExists(imagePath: string): Promise<boolean> {
		return await this.app.vault.adapter.exists(imagePath);
	}

	private async findBrokenImageLinks(): Promise<void> {
		let brokenLinksCount = 0;
		const files = this.app.vault.getMarkdownFiles();
		const attachmentsPath = this.settings.attachmentsFolder;
		let results: string[] = [];

		if (!attachmentsPath) {
			new Notice('Please select an attachments folder in settings first!');
			return;
		}

		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');

				lines.forEach((line, index) => {
					const imageLinks = this.extractImageLinks(line);

					imageLinks.forEach(async (imageFile) => {
						let imagePath = imageFile;

						if (!imagePath.includes('/')) {
							imagePath = `${attachmentsPath}/${imageFile}`;
						}

						const exists = await this.imageExists(imagePath);
						if (!exists) {
							const logMessage = `• "<b>${file.path}</b>" at line ${index + 1}: "<i>${imageFile}</i>"`;
							results.push(logMessage);
							brokenLinksCount++;
						}
					});
				});
			} catch (error) {
				results.push(`Error processing file '${file.path}': ${error}`);
			}
		}

		const view = await this.activateView();
		if (view) {
			await view.setContent(results.join('\n'));
			new Notice(`Total broken links found: ${brokenLinksCount}`);
		}
	}

	async activateView() {
		const { workspace } = this.app;
		
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_RESULTS)[0];
		
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) return null;
			leaf = rightLeaf;
			await leaf.setViewState({
				type: VIEW_TYPE_RESULTS,
				active: true,
			});
		}
		
		workspace.revealLeaf(leaf);
		return this.resultsView;
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: FMI;

	constructor(app: App, plugin: FMI) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Attachments Folder')
			.setDesc('Select the folder where your attachments are stored')
			.addDropdown(dropdown => {
				const folders = this.getFolders();
				
				dropdown.addOption('', '-- Select Folder --');
				
				folders.forEach(folder => {
					dropdown.addOption(folder, folder);
				});

				dropdown.setValue(this.plugin.settings.attachmentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolder = value;
						await this.plugin.saveSettings();
					});
			});
	}

	private getFolders(): string[] {
		const folders: string[] = [];
		
		const files = this.app.vault.getAllLoadedFiles();
		
		files.forEach(file => {
			if (file instanceof TFolder) {
				folders.push(file.path);
			}
		});
		
		return folders.sort();
	}
}
