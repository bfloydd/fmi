import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder } from 'obsidian';

interface FMISettings {
	attachmentsFolder: string;
	mySetting: string;
}

const DEFAULT_SETTINGS: FMISettings = {
	attachmentsFolder: '',
	mySetting: 'default'
}

export default class FMI extends Plugin {
	settings: FMISettings;

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
	}

	onunload() {
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
							const logMessage = `Broken link found in file '${file.path}' at line ${index + 1}: ${imageFile}`;
							console.log(logMessage);
							const logRegex = /Broken link found in file .* line \d+: (.+)/;
							const match = logRegex.exec(logMessage);
							if (match) {
								const filename = match[1].split('/').pop() || '';
							}
							brokenLinksCount++;
						}
					});
				});
			} catch (error) {
				console.error(`Error processing file '${file.path}':`, error);
			}
		}

		new Notice(`Total broken links found: ${brokenLinksCount}`);
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
