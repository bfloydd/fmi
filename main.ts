import { App, Notice, Plugin, PluginSettingTab, Setting, TFolder, WorkspaceLeaf, ItemView, TFile } from 'obsidian';

interface FMISettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: FMISettings = {
	mySetting: 'default'
}

const VIEW_TYPE_RESULTS = "fmi-results-view";

class ResultsView extends ItemView {
	private content: string = '';

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RESULTS;
	}

	getDisplayText(): string {
		return "FMI Results";
	}

	async setContent(content: string) {
		this.content = content;
		await this.updateView();
	}

	async updateView() {
		const container = this.containerEl.children[1];
		container.empty();
		
		const headerContainer = container.createDiv({
			cls: 'fmi-results-header'
		});
		
		headerContainer.createEl('h2', { text: 'Find Missing Images' });
		
		const copyButton = headerContainer.createEl('button', {
			cls: 'fmi-copy-button',
			text: 'Copy Results'
		});
		
		copyButton.addEventListener('click', () => {
			navigator.clipboard.writeText(this.content);
			new Notice('Results copied to clipboard!');
		});
		
		const contentDiv = container.createDiv({
			cls: 'fmi-results-content'
		});

		if (this.content.includes('---')) {
			const lines = this.content.split('\n');
			
			lines.forEach(line => {
				if (line.startsWith('Summary:')) {
					const summaryEl = contentDiv.createEl('div', {
						cls: 'fmi-results-summary'
					});
					summaryEl.createEl('strong', { text: line });

				} else if (line.includes('"') && !line.startsWith('---')) {
					const [filePath, ...rest] = line.substring(2).split('" line ');
					const lineEl = contentDiv.createDiv();
					lineEl.createSpan({ text: '• ' });
					
					const link = lineEl.createEl('a', {
						cls: 'internal-link',
						text: filePath
					});
					
					link.addEventListener('click', (event) => {
						event.preventDefault();
						const file = this.app.vault.getAbstractFileByPath(filePath.replace(/"/g, ''));
						if (file instanceof TFile) {
							this.app.workspace.getLeaf(false).openFile(file);
						}
					});
					
					const [lineNum, imageText] = rest[0].split(': ');
					lineEl.createSpan({ text: ` line ${lineNum}: ` });
					
					const italicMatch = imageText.match(/"<i>(.*?)<\/i>"/);
					if (italicMatch) {
						lineEl.createSpan({ text: '"' });
						lineEl.createEl('i', { text: italicMatch[1] });
						lineEl.createSpan({ text: '"' });
					}
				}
			});
		} else {
			this.content.split('\n').forEach(line => {
				const lineEl = contentDiv.createDiv();
				lineEl.innerHTML = line;
			});
		}
	}
}

export default class FMI extends Plugin {
	settings: FMISettings;
	private resultsView: ResultsView;

	async onload() {
		await this.loadSettings();

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

	private async findBrokenImageLinks(): Promise<void> {
		let brokenLinksCount = 0;
		const files = this.app.vault.getMarkdownFiles();
		let results: string[] = [];

		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');
				const checksForFile: Promise<void>[] = [];

				lines.forEach((line, index) => {
					const imageLinks = this.extractImageLinks(line);

					const lineChecks = imageLinks.map(async (imageFile) => {
						const exists = await this.imageExistsInVault(imageFile);
						if (!exists) {
							const logMessage = `• "${file.path}" line ${index + 1}: "<i>${imageFile}</i>"`;
							results.push(logMessage);
							brokenLinksCount++;
						}
					});

					checksForFile.push(...lineChecks);
				});

				await Promise.all(checksForFile);

			} catch (error) {
				results.push(`Error processing file '${file.path}': ${error}`);
			}
		}

		const view = await this.activateView();
		if (view) {
			results.push('\n---');
			results.push(`Summary: ${brokenLinksCount} missing ${brokenLinksCount === 1 ? 'image' : 'images'} found`);
			await view.setContent(results.join('\n'));
			new Notice(`Found ${brokenLinksCount} missing ${brokenLinksCount === 1 ? 'image' : 'images'}`);
		}
	}

	private async imageExistsInVault(imageFile: string): Promise<boolean> {
		const allFiles = this.app.vault.getFiles();
		return allFiles.some(file => file.name === imageFile);
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
