/**
 * Python code section navigation lib
 */
import * as path from 'path';
import * as vscode from 'vscode';

// import * as cst from './constants';
import * as util from './utility';


// === CACHE ===
export let SECTIONS = new Map<string, vscode.Position[]>();


// TODO: add foldable to section
// vscode.FoldingRangeKind.Region

// === CONSTANTS ===
// TODO: make some configurable?
// REF: https://www.dofactory.com/css/
const sectionDecorType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: '1px 0 0 0',
    borderStyle: 'dotted',  // 'groove',  // 'dashed',
    borderColor: 'inherit',  // 'LightSlateGray',
    fontWeight: 'bolder',
    fontStyle: 'italic',
});


// === FUNCTIONS: ===

/**
 * Match section pattern against text.
 * @param text - to find section pattern
 * @returns true when section pattern found in text.
 */
export function matchSectionTag(text: string) {
    let pattern = util.SECTION_TAG;
    // let pattern = getSectionPattern();
    return text.match(pattern) !== null;
}

/**
 * Move the cursor to location and reveal its editor
 *
 * @param editor - a text editor
 * @param line - line number of location
 * @param char - character number of location
 */
export function moveAndRevealCursor(
    editor: vscode.TextEditor,
    line: number,
    char = 0,
) {
    let position = editor.selection.start.with(line, char);
    let selection = new vscode.Selection(position, position);
    editor.selection = selection;
    editor.revealRange(
        selection.with(),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

/**
 * Pattern to look for code section.
 *
 * @returns regular expression to find section tag and capture tab and space
 * before tag in a line.
 */
export function getSectionPattern() {
    let sectionFlag = util.getConfig("SectionTag") as string;
    return new RegExp(`(?:^[\\t ]*${sectionFlag.trim()})`, 'gm');
    // NOTE: find section tag, capture tab and space before tag in a line
    // return new RegExp(`(?:^([\\t ]*)${sectionFlag.trim()})`);
    // NOTE: find section tag without capture, gm: global, multiline
}

/**
 * Section containing cursor position in document.
 * @param cursorPosition - default to `editor.selection.start`
 * @param sectionPositions - top to bottom positions of section tag in document
 * @param ignoreLevel - `end` position allows to be of a lower level than `start`
 * @returns range with `start` and `end` of section
 */
export function getSectionAt(
    cursorPosition: vscode.Position,
    sectionPositions: vscode.Position[],
    ignoreLevel: boolean = false,
) {
    let startOfFile = new vscode.Position(0, 0);

    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        return;
    }
    let lineCount = editor.document.lineCount;
    let endOfFile = editor.document.lineAt(lineCount - 1).range.end;

    if (sectionPositions.length === 0) {
        return new vscode.Range(startOfFile, endOfFile);
    }

    // NOTE: Must find `start` before `end`
    // -- Start
    let start = startOfFile;
    let found = sectionPositions.slice().reverse().find(
        (position) => {
            return position.line <= cursorPosition.line;
        },
    );

    if (found !== undefined) {
        start = found;
    }

    if (start.line === endOfFile.line) {
        return new vscode.Range(start, endOfFile);
    }

    let end = sectionPositions.find(
        (position) => {
            return (
                position.isAfter(start)
                && (ignoreLevel || position.character <= start.character));
        }
    );

    if (end === undefined) {
        end = endOfFile;
    }
    return new vscode.Range(start, end);
}


// === SECTION ===

/**
 * Find section tag position in current active text editor.
 *
 * @returns positions of section tag in ascending order. Top and bottom of
 * document are considered sections and are inclusive.
 */
export function findSectionPosition(document: vscode.TextDocument) {
    let text = document.getText();
    let pattern = util.SECTION_TAG;
    let matches = text.matchAll(pattern);

    let positions: vscode.Position[] = [];
    for (let match of matches) {
        if (match.index === undefined) {
            continue;
        }
        let position = document.positionAt(match.index);
        let character = document.lineAt(position.line).firstNonWhitespaceCharacterIndex;
        position = position.translate(
            undefined,
            character,
        );
        positions.push(position);
    }

    if (positions.length === 0) {
        return positions;
    }

    let start = new vscode.Position(0, 0);
    let end = document.lineAt(document.lineCount - 1).range.end;

    if (start.line < positions[0].line) {
        positions.unshift(start);
    }

    if (end.line > positions[positions.length - 1].line) {
        positions.push(end);
    }

    return positions;
}

/**
 * Decorate section found.
 *
 * @param editor - current active python editor
 * @returns - undefined when failed
 */
export function decorateSection(editor: vscode.TextEditor) {

    if (editor === undefined || editor.document === undefined) {
        console.error('decorateSection: found invalid editor!!');
        return;
    }

    let document = editor.document;
    let decors: vscode.DecorationOptions[] = [];

    let positions = SECTIONS.get(document.fileName);

    if (positions === undefined) {
        editor.setDecorations(sectionDecorType, decors);
        return;
    }

    for (let position of positions) {
        let text = document.lineAt(position.line).text;
        if (!matchSectionTag(text)) {
            continue;
        }
        decors.push({
            range: new vscode.Range(position, position),
        });
    }
    editor.setDecorations(sectionDecorType, decors);
}

/**
 * Remove section position cache.
 * @param fileName - a vscode document.fileName
 */
export function removeSectionCache(fileName: string) {
    SECTIONS.delete(fileName);
}

/**
 * Update section cache of document.
 * @param document - a text file.
 */
export function updateSectionCache(document: vscode.TextDocument) {
    let matchExt = document.fileName.search(util.FILE_EXT);
    if (matchExt === -1) {
        return;
    }
    let positions = findSectionPosition(document);
    if (positions === undefined) {
        SECTIONS.delete(document.fileName);
        return;
    }
    SECTIONS.set(document.fileName, positions);
}

/**
 * Move cursor to a section
 * @param below - move below or above
 */
export function moveCursorToSection(below: boolean) {
    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        console.error('moveCursorToSection: Failed to get an editor');
        return;
    }

    let cursor = editor.selection.start;
    let sectionPositions = SECTIONS.get(editor.document.fileName);

    if (sectionPositions === undefined) {
        console.error('moveCursorToSection: bad sectionCache');
        return;
    }

    let section = getSectionAt(cursor, sectionPositions, true);
    if (section === undefined) {
        console.error('moveCursorToSection: Failed to getSectionAt');
        return;
    }

    if (below) {
        moveAndRevealCursor(editor, section.end.line, section.end.character);
        return;
    }

    if (cursor.line === section.start.line) {
        let deltaLine = - 1;
        if (cursor.line + deltaLine < 0) {
            return;
        }
        section = getSectionAt(cursor.translate(deltaLine), sectionPositions, true);
        if (section === undefined) {
            return;
        }
    }
    moveAndRevealCursor(editor, section.start.line, section.start.character);
    return;
}


/**
 * Update section decoration.
 * @param editor - current active python editor
 */
export function updateSectionDecor(editor: vscode.TextEditor) {

    if (editor === undefined || editor.document === undefined) {
        util.consoleLog('updateSectionDecor: found invalid editor!!');
        return;
    }
    updateSectionCache(editor.document);
    decorateSection(editor);
}


// === TREE PROVIDER ===
/**
 * Get the section header from document.
 * @param sectionStart position in document
 * @param document where section is found
 * @returns section header (i.e., text immediately after section tag and
 * whitespace trimmed)
 */
export function getSectionHeader(
    sectionStart: vscode.Position,
    document: vscode.TextDocument,
) {

    let text = document.lineAt(sectionStart.line).text;

    let pattern = util.SECTION_TAG;

    let startOfFile = new vscode.Position(0, 0);
    let header = '';
    if (matchSectionTag(text)) {
        header = text.replace(pattern, '').trim();
    } else {
        header = (startOfFile.isEqual(sectionStart)) ? '(First Section)' : '(Unknown)';
    }
    return header;
}


/**
 * Section Item for use with TreeProvider
 * @document the text file section is found in
 * @position the starting position of a section in document
 */
export class SectionItem extends vscode.TreeItem {
    constructor(
        public document: vscode.TextDocument,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public position: vscode.Position | undefined = undefined,
    ) {
        let label: string;
        let description: string = '';
        let runable: string | undefined = undefined;
        let tooltip: string | undefined = undefined;
        let uri: vscode.Uri | undefined = undefined;
        let icon: vscode.ThemeIcon | undefined;
        if (position === undefined) {
            label = path.basename(document.fileName);
            let dir = path.dirname(document.uri.path);
            description = vscode.workspace.asRelativePath(dir);
            if (description === dir) {
                description = '';
            }
            tooltip = `Jump to File`;
            uri = document.uri;
            if (document.languageId === 'python') {
                runable = 'runableFile';
            }
            icon = new vscode.ThemeIcon('file');
        } else {
            // FIXME: enumerate these
            if (document.languageId === 'python') {
                runable = 'runableSection';
            }
            let header = getSectionHeader(
                position,
                document,
            );

            let tabSize = util.getTabSize();
            let level = position.character / tabSize;

            // Unicode: https://en.wikibooks.org/wiki/Unicode/List_of_useful_symbols
            let front: string;
            let sectionSymbol = '\u{00A7}';
            let verticalDash = '\u{00A6}';
            let middleDotDot = '\u{22C5}\u{22C5}';
            if (level === 0) {
                // \u{2937}: right arrow curving down
                // \u{22EF}: horz ellipses
                front = `${sectionSymbol} `;
            } else {
                // \u{2192}: right arrow unicode
                let subLevel = `${middleDotDot} `.repeat(level);
                front = `${verticalDash} ${subLevel} ${sectionSymbol}`;
            }
            label = `${front} ${header}` ;

            tooltip = `Jump to Section at L:${position.line}, C:${position.character}`;
        }

        super(label, collapsibleState);

        this.position = position;
        this.document = document;
        this.contextValue = runable;
        this.resourceUri = uri;
        this.iconPath = icon;
        this.tooltip = tooltip;
        this.description = description;
        this.command = {
            command: 'ipython.naviJumpToSection',
            arguments: [this],
            title: 'Jump to ...',
        };
    }

    /**
     * Jump active editor to document section. If document not opened,
     * open document then jump.
     */
    public async jumpToSection() {
        let range: vscode.Range | undefined = undefined;
        if (this.position !== undefined) {
            range = new vscode.Range(this.position, this.position);
        }

        let showOptions: vscode.TextDocumentShowOptions = {
            preserveFocus: false,
            preview: false,
            selection: range,
        };
        await vscode.window.showTextDocument(
            this.document,
            showOptions,
        );
    }
}


/**
 * Section TreeProvider for text files in editors
 */
export class SectionTreeProvider implements vscode.TreeDataProvider<SectionItem> {
    private _onDidChangeTreeDataEmitter: vscode.EventEmitter<SectionItem | undefined | void> = new vscode.EventEmitter<SectionItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SectionItem | undefined | void> = this._onDidChangeTreeDataEmitter.event;

    private documentNodes = new Map<string, SectionItem>;
    private itemCache = new Map<string, SectionItem[]>;

    constructor() {
        this.cacheSection(undefined);
    }

    // == Abstraction ==
    getTreeItem(element: SectionItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getParent(element: SectionItem): vscode.ProviderResult<SectionItem> {
        if (element.position === undefined) {  // it is a document node
            return undefined;
        }
        let document = element.document;
        return this.documentNodes.get(document.fileName);
    }

    getChildren(element?: SectionItem | undefined): vscode.ProviderResult<SectionItem[]> {
        if (element === undefined) {
            let nodes = Array.from(this.documentNodes.values());
            return Promise.resolve(nodes);
        }

        if (element.document === undefined) {
            util.consoleLog('getChildren: Found undefined');
        }

        if (!element.document.isClosed) {
            let sections = this.itemCache.get(element.document.fileName);
            return Promise.resolve(sections);
        }
        return Promise.resolve([]);
    }

    // == Functions ==
    /**
     * Create a view node document.
     * @param document a text document
     * @returns a document view node
     */
    private createDocumentNode(document: vscode.TextDocument) {
        if (document === undefined) {
            util.consoleLog('naviRunSection: Found undefined item');
        }
        return new SectionItem(
            document,
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
        );
    }

    /**
     * Find section in documents and cache the results.
     * @param documents a set of text file
     */
    private cacheSection(documents: readonly vscode.TextDocument[] | undefined): void {
        if (documents === undefined) {
            let editors = vscode.window.visibleTextEditors;
            documents = editors.map(item => item.document);
        }
        for (let document of documents) {
            let matchExt = document.fileName.search(util.FILE_EXT);
            if (matchExt === -1 || !matchSectionTag(document.getText())) {
                continue;
            }

            let docNode = this.documentNodes.get(document.fileName);
            if (docNode === undefined) {
                docNode = this.createDocumentNode(document);
                this.documentNodes.set(document.fileName, docNode);
            }
            this.cacheItem(docNode);
        }
    }

    /**
     * Cache the section nodes of a document.
     * @param documentNode a node representing a document with sections
     */
    private cacheItem(documentNode: SectionItem): void {
        let document = documentNode.document;

        let positions = SECTIONS.get(document.fileName);
        if (positions === undefined) {
            return;
        }
        let endOfFile = document.lineAt(document.lineCount - 1).range.end;
        let sections: SectionItem[] = [];
        for (let position of positions) {
            if (position.isEqual(endOfFile)) {
                continue;
            }
            sections.push(
                new SectionItem(
                    document,
                    vscode.TreeItemCollapsibleState.None,
                    position,
                )
            );
        }
        this.itemCache.set(document.fileName, sections);
        return;
    }

    /**
     * Refresh the tree view from root.
     */
    public refresh(): void {
        this._onDidChangeTreeDataEmitter.fire();
    }

    /**
     * Get a cached document node in tree view
     * @param document a text editor document
     * @returns cached document node
     */
    public getDocumentNode(document: vscode.TextDocument) {
        if (document === undefined) {
            util.consoleLog('SectionItem: Found undefined');
            return;
        }
        return this.documentNodes.get(document.fileName);
    }

    /**
     * WIP: Expand the collapsible document node
     * @param document a text editor document
     */
    public expandDocument(document: vscode.TextDocument) {
        if (document === undefined) {
            util.consoleLog('SectionItem: Found undefined');
            return;
        }
        let docNode = this.documentNodes.get(document.fileName);
        if (docNode) {
            docNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        this.refresh();
    }

    /**
     * Refresh the view of a document. If not cached, caches it and update view.
     * @param document in view
     */
    public refreshDocument(document: vscode.TextDocument) {
        if (document === undefined) {
            util.consoleLog('SectionItem: Found undefined');
            return;
        }
        this.cacheSection([document]);
        this.expandDocument(document);
        this.refresh();
    }

    /**
     * Remove a document from view.
     * @param document in view
     */
    public removeDocument(document: vscode.TextDocument) {
        if (document === undefined) {
            util.consoleLog('SectionItem: Found undefined');
            return;
        }
        this.documentNodes.delete(document.fileName);
        this.itemCache.delete(document.fileName);
        this.refresh();
    }
}


/**
 * Register navigator commands
 * @param context of extension
 */
export function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.naviJumpToSection",
            (item: SectionItem) => {
                if (item) {
                    item.jumpToSection();
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToSectionTagAbove",
            () => moveCursorToSection(false)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToSectionTagBelow",
            () => moveCursorToSection(true)
        )
    );
}


/**
 * Create the section navigator and register callbacks to the extension
 * @param context of extension
 */
export function registerSectionNavigator(context: vscode.ExtensionContext) {
    for (let editor of vscode.window.visibleTextEditors) {
        updateSectionDecor(editor);
    }

    let treeProvider = new SectionTreeProvider();
    let treeOptions: vscode.TreeViewOptions<SectionItem> = {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    };

    // FUTURE: potential enhancement of tree drag/drop of sections
    let treeView = vscode.window.createTreeView(
        'ipyNavigator',
        treeOptions,
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (event.contentChanges.length === 0) {
                    treeProvider.expandDocument(event.document);
                    return;
                }
                updateSectionCache(event.document);
                if (vscode.window.activeTextEditor) {
                    updateSectionDecor(vscode.window.activeTextEditor);
                }
                treeProvider.refreshDocument(event.document);
            },
            null,
            context.subscriptions,
        )
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(
            (document) => {
                updateSectionCache(document);
                treeProvider.refreshDocument(document);
            }
        )
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(
            (document) => {
                removeSectionCache(document.fileName);
                treeProvider.removeDocument(document);
                treeProvider.refresh();
            },
        )
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
                if (editor && editor.document !== undefined) {
                    updateSectionDecor(editor);
                    treeProvider.refreshDocument(editor.document);
                    let docNode = treeProvider.getDocumentNode(editor.document);
                    // NOTE: only change view when `visible` so to avoid hijacking
                    //  current view
                    if (docNode && treeView.visible) {
                        treeView.reveal(
                            docNode,
                            {
                                select: false,
                                focus: false,  // NEVER set to true to not hijack!
                                expand: true,
                            }
                        );
                    }
                }
            },
            null,
            context.subscriptions,
        )
    );
}

