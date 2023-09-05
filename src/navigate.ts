/**
 * Python code section navigation lib
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cst from './constants';
import {sectionCache, getSectionAt, getPythonEditor} from './ipython';
import {replaceTabWithSpace} from './utility';


// FIXME: use editor.tabSize &| editor.detectIndentation
const tabSize = 4;  // spaces

// === CACHE ===
/**
 * Cache file Section TreeItems
 */
export let sectionItems = new Map<string, SectionItem[]>();

/**
 * Section in .py file.
 */
class SectionItem extends vscode.TreeItem {
    constructor(
        public readonly header: string,
        public readonly level: number,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public _uri: vscode.Uri,
        public position: vscode.Position,
    ) {
        let label = `${header.trim()} -- Level${level}`;
        super(label, collapsibleState);
        this.position = position;
        this._uri = _uri;

        this.tooltip = `Line${position.line}, Col${position.character}`;
        this.resourceUri = _uri;
    }
}

export function updateSectionItems(){
    let editor = getPythonEditor() as vscode.TextEditor;
    let sections = buildSectionItems(editor.document);
    sectionItems.set(editor.document.fileName, sections);
}

export function removeSectionItems(
    fileName: string
){
    sectionItems.delete(fileName);
}

/**
 * Build SectionItem from its cached section position.
 * @param document - an .py file
 * @returns a flat list of `sections` TreeItem
 */
export function buildSectionItems(
    document: vscode.TextDocument,
) {
    let positions = sectionCache.get(document.fileName) as vscode.Position[];
    let sections: SectionItem[] = [];
    for (let position of positions){
        let header = replaceTabWithSpace(
            document.lineAt(position.line).text,
            tabSize,
        );

        let trimHeading = header.trimLeft();
        let sLevel = (header.length - trimHeading.length);  // should be >= 0

        sections.push(
            new SectionItem(
                header,
                sLevel,
                vscode.TreeItemCollapsibleState.None,
                document.uri,
                position,
            ),
        );
    }
    return sections;
}

// === TREE PROVIDER ===
export class SectionTreeProvider implements vscode.TreeDataProvider<SectionItem> {
    constructor(public document: vscode.TextDocument) {}

    // NOTE: adhering to abstract
    getTreeItem(element: SectionItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: SectionItem | undefined): vscode.ProviderResult<SectionItem[]> {
        if (element === undefined) {
            // let editor = getPythonEditor() as vscode.TextEditor;
            let sections = sectionItems.get(this.document.fileName) as SectionItem[];
            return Promise.resolve(sections);
        }
        return Promise.resolve([]);
        // WIP: how to make collapsible
        // if (section === undefined) {  // root

        //     let topSections: SectionItem[] = [];
        //     let topIndices: number[] = [];
        //     let level: number = Infinity;
        //     for (let key of sections.keys()) {
        //         let section = sections[key];
        //         if (section.level <= level) {
        //             topSections.push(section);
        //             topIndices.push(key);
        //             level = section.level;
        //         }
        //     }

        //     for (let ii=0; ii < topIndices.length - 1; ++ii){
        //         if (topIndices[ii + 1] - topIndices[ii] > 1) {
        //             topSections[ii].collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        //         }
        //         topSections[ii].collapsibleState = vscode.TreeItemCollapsibleState.None;
        //     }

        //     return Promise.resolve(topSections);
        // }

        // // Look for subsections
        // let start = section.position;

        // return Promise.resolve([]);
    }
}

/**
 * EXAMPLE
 */
export class NodeDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
    constructor(private workspaceRoot: string) { }

    getTreeItem(element: Dependency): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Dependency): Thenable<Dependency[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No dependency in empty workspace');
            return Promise.resolve([]);
        }

        if (element) {
            return Promise.resolve(
                this.getDepsInPackageJson(
                    path.join(this.workspaceRoot, 'node_modules', element.label, 'package.json')
                )
            );
        } else {
            const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
            if (this.pathExists(packageJsonPath)) {
                return Promise.resolve(this.getDepsInPackageJson(packageJsonPath));
            } else {
                vscode.window.showInformationMessage('Workspace has no package.json');
                return Promise.resolve([]);
            }
        }
    }

    /**
     * Given the path to package.json, read all its dependencies and devDependencies.
     */
    private getDepsInPackageJson(packageJsonPath: string): Dependency[] {
        if (this.pathExists(packageJsonPath)) {
            const toDep = (moduleName: string, version: string): Dependency => {
                if (this.pathExists(path.join(this.workspaceRoot, 'node_modules', moduleName))) {
                    return new Dependency(
                        moduleName,
                        version,
                        vscode.TreeItemCollapsibleState.Collapsed
                    );
                } else {
                    return new Dependency(moduleName, version, vscode.TreeItemCollapsibleState.None);
                }
            };

            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            const deps = packageJson.dependencies
                ? Object.keys(packageJson.dependencies).map(dep =>
                    toDep(dep, packageJson.dependencies[dep])
                )
                : [];
            const devDeps = packageJson.devDependencies
                ? Object.keys(packageJson.devDependencies).map(dep =>
                    toDep(dep, packageJson.devDependencies[dep])
                )
                : [];
            return deps.concat(devDeps);
        } else {
            return [];
        }
    }

    private pathExists(p: string): boolean {
        try {
            fs.accessSync(p);
        } catch (err) {
            return false;
        }
        return true;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | null | void> = new vscode.EventEmitter<Dependency | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

/**
 * EXAMPLE
 */
class Dependency extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        private version: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}-${this.version}`;
        this.description = this.version;
    }

    // iconPath = {
    //     light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    //     dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
    // };
}




