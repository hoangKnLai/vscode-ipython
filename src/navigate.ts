/**
 * Python code section navigation lib
 */
import * as path from 'path';
import * as vscode from 'vscode';

// import * as cst from './constants';
import * as util from './utility';


// === CACHE ===
/**
 * Section marker locations in a file
 * @key document.fileName
 * @value starting position of each section marker
 */
export let SECTION_MARKER_POSITIONS = new Map<string, vscode.Position[]>();
// export let FILE_SECTIONS = new Map<string, Map<vscode.Position, Section>>();

// let position = new vscode.Position(0,0);


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

    // TODO: section numbering
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
 * Get the section heading position at or above a position.
 * @param cursorPosition somewhere in a document with `sectionPositions`
 * @param sectionPositions section heading positions in document
 * @returns heading position above `cursorPosition` or start of file position
 */
export function getSectionStart(
    cursorPosition: vscode.Position,
    sectionPositions: vscode.Position[],
) {
    let startOfFile = new vscode.Position(0, 0);
    let found = sectionPositions.slice().reverse().find(
        (position) => {
            return position.isBeforeOrEqual(cursorPosition);
            // return position.line <= cursorPosition.line;
        },
    );

    let start = startOfFile;
    if (found !== undefined) {
        start = found;
    }
    return start;
}


/**
 * Get the section ending position.
 * @param start - a document section start position
 * @param sectionPositions - top to bottom positions of section tag in document
 * @param ignoreLevel - `end` position allows to be of a lower level than `start`
 * @returns `end` position of the section or end of file
 */
export function getSectionEnd(
    start: vscode.Position,
    sectionPositions: vscode.Position[],
    document: vscode.TextDocument,
    ignoreLevel: boolean = false,
) {
    let lineCount = document.lineCount;
    let endOfFile = document.lineAt(lineCount - 1).range.end;
    if (start.line === endOfFile.line) {
        return endOfFile;
    }

    let next = sectionPositions.find(
        (position) => {
            return (
                position.isAfter(start)
                && ((position.character <= start.character) || ignoreLevel)
            );
        }
    );

    let end = endOfFile;
    if (next !== undefined) {
        end = document.lineAt(next.line - 1).range.end;
    }
    return end;
}


/**
 * Wrapper to get section enclosing a position in document.
 * @param cursorPosition - a position in document
 * @param sectionPositions - top to bottom positions of section tag in document
 * @param ignoreLevel - `end` position allows to be of a lower level than `start`
 * @returns range with `start` and `end` of section
 */
export function getSectionAt(
    cursorPosition: vscode.Position,
    sectionPositions: vscode.Position[],
    document: vscode.TextDocument,
    ignoreLevel: boolean = false,
) {

    let lineCount = document.lineCount;
    let endOfFile = document.lineAt(lineCount - 1).range.end;

    let startOfFile = new vscode.Position(0, 0);
    if (sectionPositions.length === 0) {
        return new vscode.Range(startOfFile, endOfFile);
    }

    if (
        cursorPosition.isEqual(endOfFile)
        && !cursorPosition.isEqual(startOfFile)
    ) {
        let lineDelta = Math.max(0, cursorPosition.line - 1);
        cursorPosition = cursorPosition.translate(lineDelta);
    }

    // NOTE: Must find `start` before `end`
    let start = getSectionStart(
        cursorPosition,
        sectionPositions,
    );

    let end = getSectionEnd(
        start,
        sectionPositions,
        document,
        ignoreLevel,
    );
    return new vscode.Range(start, end);
}


// === SECTION ===

export class Section{
    // Attributes
    readonly name: string;
    readonly level: number;
    readonly range: vscode.Range;
    label: number = -1;
    parent: Section | undefined = undefined;
    children: Section[] = [];

    // Constructor
    constructor(
        range: vscode.Range,
        name: string,
    ) {
        this.range = range;
        this.name = name;
        this.level = this.calcTab(range.start);
    }

    // Methods
    calcTab(position: vscode.Position) {
        let tabSize = util.getTabSize();

        // Assume section indented with whitespaces
        return Math.floor(position.character / tabSize);
    }
}


export function makeSections(
    positions: vscode.Position[],
    document: vscode.TextDocument,
) {
    let sections: Section[] = [];
    for (let start of positions) {
        let range = getSectionAt(start, positions, document, false);
        let name = getSectionHeader(start, document);
        let section = new Section(range, name);
        sections.push(section);
    }

    // Formulate a tree of sections
    let root: Section[] = [];
    for (let index of sections.keys()) {
        findSectionParent(sections, index, root);
    }
    return sections;
}


export function findSectionParent(
    sections: Section[],
    index: number,
    root: Section[],
) {
    let section = sections[index];

    if (section.level === 0) {
        section.parent = undefined;  // parent is root
        root.push(section);
        return;
    }

    for (let ii = index - 1; ii >= 0; ii--) {
        let parent = sections[ii];
        if (sections[ii].level < section.level) {
            section.parent = sections[ii];
            parent.children?.push(section);
            break;
        } else if(sections[ii].level === section.level) {
            section.parent = sections[ii].parent;
            parent.children?.push(section);
            break;
        }
    }
}


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

    let positions = SECTION_MARKER_POSITIONS.get(document.fileName);

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
    SECTION_MARKER_POSITIONS.delete(fileName);
}

/**
 * Update section cache of document.
 * @param document - a text file.
 */
export function updateSectionCache(document: vscode.TextDocument) {
    let match = document.languageId.search(util.LANGUAGE_EXPR);
    if (match === -1) {
        return;
    }
    let positions = findSectionPosition(document);
    if (positions === undefined) {
        SECTION_MARKER_POSITIONS.delete(document.fileName);
        return;
    }
    SECTION_MARKER_POSITIONS.set(document.fileName, positions);
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
    let sectionPositions = SECTION_MARKER_POSITIONS.get(editor.document.fileName);

    if (sectionPositions === undefined) {
        console.error('moveCursorToSection: bad sectionCache');
        return;
    }

    let section = getSectionAt(cursor, sectionPositions, editor.document, true);
    if (section === undefined) {
        console.error('moveCursorToSection: Failed to getSectionAt');
        return;
    }

    if (below) {
        let line = section.end.line + 1;
        if (line >= editor.document.lineCount) {
            line = editor.document.lineCount - 1;
        }

        let char = editor.document.lineAt(line).firstNonWhitespaceCharacterIndex;

        moveAndRevealCursor(editor, line, char);
        return;
    }

    if (cursor.line === section.start.line) {
        let deltaLine = - 1;
        if (cursor.line + deltaLine < 0) {
            return;
        }
        section = getSectionAt(
            cursor.translate(deltaLine),
            sectionPositions,
            editor.document,
            true,
        );
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
    } else {  // default to file first line
        header = (startOfFile.isEqual(sectionStart)) ? '(First Section)' : '(Unknown)';
    }
    return header;
}


/**
 * Section Item for use with TreeProvider
 * @document the text file section is found in
 * @position the starting position of a section in document
 */
export class SectionTreeItem extends vscode.TreeItem {
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
export class SectionTreeProvider implements vscode.TreeDataProvider<SectionTreeItem> {
    private _onDidChangeTreeDataEmitter: vscode.EventEmitter<SectionTreeItem | undefined | void> = new vscode.EventEmitter<SectionTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SectionTreeItem | undefined | void> = this._onDidChangeTreeDataEmitter.event;

    private documentNodes = new Map<string, SectionTreeItem>;
    private itemCache = new Map<string, SectionTreeItem[]>;

    constructor() {
        this.cacheSection(undefined);
    }

    // == Abstraction ==
    getTreeItem(element: SectionTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getParent(element: SectionTreeItem): vscode.ProviderResult<SectionTreeItem> {
        if (element.position === undefined) {  // it is a document node
            return undefined;
        }
        let document = element.document;
        return this.documentNodes.get(document.fileName);
    }

    getChildren(element?: SectionTreeItem | undefined): vscode.ProviderResult<SectionTreeItem[]> {
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
        return new SectionTreeItem(
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
            let matchExt = document.languageId.search(util.LANGUAGE_EXPR);
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
    private cacheItem(documentNode: SectionTreeItem): void {
        let document = documentNode.document;

        let positions = SECTION_MARKER_POSITIONS.get(document.fileName);
        if (positions === undefined) {
            return;
        }
        let endOfFile = document.lineAt(document.lineCount - 1).range.end;
        let sections: SectionTreeItem[] = [];
        for (let position of positions) {
            if (position.isEqual(endOfFile)) {
                continue;
            }
            sections.push(
                new SectionTreeItem(
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
            (item: SectionTreeItem) => {
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
    let treeOptions: vscode.TreeViewOptions<SectionTreeItem> = {
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


// == CODE FOLDING
/**
 * Section folding.
 */
export class SectionRangeProvider implements vscode.FoldingRangeProvider {

    provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,  // ok to ignore
        token: vscode.CancellationToken,  // ok to ignore
    ): vscode.ProviderResult<vscode.FoldingRange[]> {

        let sections = SECTION_MARKER_POSITIONS.get(document.fileName);

        if (sections === undefined) {
            return;
        }

        let ranges: vscode.FoldingRange[] = [];
        for (let start of sections) {
            let end = getSectionEnd(start, sections, document, false);

            if (start.line === end.line) {
                continue;
            }
            // NOTE: folding resolution when there is a criss-crossed fold,
            //  then the higher level fold absorb the lower fold
            let range = new vscode.FoldingRange(
                start.line,
                end.line,
                vscode.FoldingRangeKind.Region,
            );
            ranges.push(range);
        }
        return ranges;
    }
}

/**
 * Create the section navigator and register callbacks to the extension
 * @param context of extension
 */
export function registerSectionFolding(context: vscode.ExtensionContext) {

    for (let language of util.LANGUAGES) {
        let selector: vscode.DocumentSelector = {
            scheme: 'file',
            language: language,
        };

        let provider = new SectionRangeProvider();
        vscode.languages.registerFoldingRangeProvider(
            selector,
            provider,
        );
    }
}
