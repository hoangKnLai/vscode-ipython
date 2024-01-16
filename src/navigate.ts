/**
 * Python code section navigation lib
 */
import * as path from 'path';
import * as vscode from 'vscode';

// import * as cst from './constants';
import * as util from './utility';


// === CACHE ===
// FIXME: replace usage with FILE_SECTION_TREES?
/**
 * Section marker locations in a file
 * @key document.fileName
 * @value starting position of each section marker
 */
export let SECTION_MARKER_POSITIONS = new Map<string, vscode.Position[]>();

// FIXME: replace Section[] with SectionTree[]
// export let FILE_SECTION_TREES = new Map<string, Section[]>();
export let FILE_SECTION_TREES = new Map<string, SectionTree>();

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

    // NOTE: must find `start` before `end`
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

/**
 * Find section tag position in current active text editor.
 *
 * @returns positions of section tag in ascending order. Top of
 * document is considered a section and is included.
 */
export function findSectionPosition(document: vscode.TextDocument) {
    let text = document.getText();
    let pattern = util.SECTION_TAG;
    let matches = text.matchAll(pattern);

    let start = new vscode.Position(0, 0);
    let positions: vscode.Position[] = [];
    positions.push(start);
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
    FILE_SECTION_TREES.delete(fileName);
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
        FILE_SECTION_TREES.delete(document.fileName);
        return;
    }
    SECTION_MARKER_POSITIONS.set(document.fileName, positions);
    FILE_SECTION_TREES.set(document.fileName, new SectionTree(document));
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
 * whitespace trimmed.
 */
export function getSectionHeader(
    sectionStart: vscode.Position,
    document: vscode.TextDocument,
) {
    let lineText =  document.lineAt(sectionStart.line);
    let text = lineText.text;
    let pattern = util.SECTION_TAG;
    let match = text.match(pattern);

    let topOfFile = new vscode.Position(0, 0);
    let isTop = topOfFile.isEqual(sectionStart);

    if (match === null) {
        if (isTop) {
            return 'Top of File';
        } else {
            console.error('getSectionHeader: invalid sectionStart');
            return 'ERROR';
        }
    }

    let tabSize = util.getTabSize();
    let level = Math.floor(lineText.firstNonWhitespaceCharacterIndex / tabSize);

    if (level > 0 && sectionStart.character === 0) {
        // Allow subsection on first line
        return 'Top of File';
    }

    return text.replace(pattern, '').trim();
}


/**
 * Section in a document
 */
export class Section{
    // Attributes
    readonly name: string;
    readonly level: number;
    readonly range: vscode.Range;
    numeric: number[] = [];
    parent: Section | undefined = undefined;
    children: Section[] = [];

    // Constructor
    constructor(
        range: vscode.Range,
        name: string,
    ) {
        this.range = range;
        this.name = name;
        this.level = this.calcLevel();
    }

    /**
     *
     * @param position containing a section marker
     * @returns level of the section as number of tabs
     */
    private calcLevel() {
        let tabSize = util.getTabSize();

        // Assume section indented with whitespaces
        return Math.floor(this.range.start.character / tabSize);
    }

    /**
     * Update children list with current generation
     * @param previous child in list
     * @param current child
     */
    updateChild(previous: Section, current: Section){
        let index = this.children.findIndex(
            (child) => child.isEqual(previous)
        );

        if (index === -1) {
            console.error('Section.updateChild: invalid `previous` child');
            return;
        }

        this.children[index] = current;
    }

    /**
     * @param section
     * @returns `this` and `section` have same `.name` and occupies same area
     * in document
     */
    isEqual(section: Section) {
        let equal = (
            this.range.isEqual(section.range)
            && this.name === section.name
        );
        return equal;
    }

}



/**
 * Section tree item
 */
export class SectionItem extends vscode.TreeItem{
    // NOTE: every node need document for execution and navigation
    /** Document sections belong to */
    readonly document: vscode.TextDocument;
    /**
     * A section of this.document from {@link SectionTree}.
     * If undefined, this is root
     */
    readonly section?: Section;
    /** Parent. Undefined if it is root. */
    parent?: SectionItem;
    /** Children. Empty if None.*/
    children: SectionItem[] = [];

    /**
     * TODO
     */
    constructor(
        document: vscode.TextDocument,
        parent?: SectionItem,
        section?: Section,
        label?: string,
        collapsibleState?: vscode.TreeItemCollapsibleState,
    ) {

        if (section) {
            // FIXME: compose label with section.numeric instead
            // Unicode: https://en.wikibooks.org/wiki/Unicode/List_of_useful_symbols
            let front: string;
            let sectionSymbol = '\u{00A7}';
            let verticalDash = '\u{00A6}';
            let middleDotDot = '\u{22C5}\u{22C5}';
            let level = section.level;
            if (level === 0) {
                // \u{2937}: right arrow curving down
                // \u{22EF}: horz ellipses
                front = `${sectionSymbol} `;
            } else {
                // \u{2192}: right arrow unicode
                let subLevel = `${middleDotDot} `.repeat(level);
                front = `${verticalDash} ${subLevel} ${sectionSymbol}`;
            }
            label = `${front} ${section.name}` ;
        } else {
            // FIXME: shorten with relative path?
            label = path.basename(document.fileName);
        }

        super(label, collapsibleState);

        this.document = document;
        this.section = section;
        this.parent = parent;

        if (section && section.children.length) {
            this.childrenFrom(section);
        }

        let context: string | undefined = undefined;
        let isPython = document.languageId === 'python';
        if (isPython && section === undefined) {
            context = 'runableFile';
        } else if (isPython && section) {
            context = 'runableSection';
        }
        this.contextValue = context;

        this.iconPath = section? undefined: new vscode.ThemeIcon('file');
        this.resourceUri = section? undefined: document.uri;

        let tooltip: string | undefined;
        if (section) {
            let p = section.range.start;
            tooltip = `Jump to Section at L.C:${p.line}.${p.character}`;
        }

        this.tooltip = tooltip;

        // let dir = section? '': path.dirname(document.uri.path);
        // let description = vscode.workspace.asRelativePath(dir);
        // if (description === dir) {
        //     description = '';
        // }
        // this.description = description;

        this.command = {
            command: 'ipython.naviJumpToSection',
            arguments: [this],
            title: 'Jump to ...',
        };
    }

    /**
     * Populate this.children with mimicking section.children
     * @param section
     */
    private childrenFrom(section: Section, parent?: SectionItem) {
        if (parent === undefined) {
            parent = this;
        }

        for (let child of section.children) {
            let item = new SectionItem(
                this.document,
                parent,
                child,
            );

            this.childrenFrom(child, item);

            parent.children.push(item);
        }
    }

    /**
     * Jump active editor to document section. If document not opened,
     * open document then jump.
     */
    public async jumpToSection() {
        let range: vscode.Range | undefined = undefined;
        if (this.section) {
            range = this.section.range;

            let showOptions: vscode.TextDocumentShowOptions = {
                preserveFocus: false,
                preview: false,
                selection: range,
            };
            await vscode.window.showTextDocument(
                this.document,
                showOptions,
            );

            return;
        }
        // Else, show this document
        await vscode.window.showTextDocument(
            this.document,
            undefined,  // ViewColumn
            false,  // preserveFocus
        );
    }
}


/**
 * Tree of sections in a document
 */
export class SectionTree {
    /**
     * Document with sections
     */
    readonly document: vscode.TextDocument;

    /**
     * Sections in order of found in documents
     */
    readonly sections: Section[] = [];

    /**
     * A tree structure of sections
     */
    readonly root: Section[] = [];

    /**
     * @param document an open vscode.TextDocument
     */
    constructor(
        document: vscode.TextDocument,
    ) {
        this.document = document;

        this.formSection();
        this.makeTree();
        this.numberSection();
    }

    /**
     * Formulate sections from `this.document`
     */
    private formSection() {
        let positions = findSectionPosition(this.document);
        for (let start of positions) {
            let range = getSectionAt(start, positions, this.document, false);
            let name = getSectionHeader(start, this.document);
            let section = new Section(range, name);
            this.sections.push(section);
        }
    }


    /**
     * Create a tree from `this.sections`
     */
    private makeTree() {
        for (let index of this.sections.keys()) {
            this.assignParent(index);
        }
    }


    /**
     * @param index of `this.sections` to find and assign parent section or root
     */
    private assignParent(index: number) {
        let section = this.sections[index];

        if (section.level === 0) {
            section.parent = undefined;  // parent is root
            this.root.push(section);
            return;
        }

        for (let ii = index - 1; ii >= 0; ii--) {
            let parent = this.sections[ii];
            if (section.level > this.sections[ii].level) {
                section.parent = this.sections[ii];
                parent.children?.push(section);
                break;
            } else if(section.level === this.sections[ii].level ) {
                section.parent = this.sections[ii].parent;
                parent.children?.push(section);
                break;
            }
        }
    }

    /**
     * Assign section numeric
     */
    private numberSection(node?: Section[]) {
        if (node === undefined) {
            node = this.root;
        }
        for (let [index, section] of node.entries()) {
            if (section.parent === undefined) {
                section.numeric.push(index);
            } else {
                section.numeric = Array.from(section.parent.numeric);
                section.numeric.push(index);
            }

            if (section.children.length) {
                this.numberSection(section.children);
            }
        }
    }

    /**
     *
     * @param position a line.char location in document
     * @param node in the tree. Default to `this.root`.
     * @returns lowest level section containing the position
     */
    getSection(position: vscode.Position, node?: Section[]) {
        if (!this.document.validatePosition(position).isEqual(position)){
            console.error('SectionTree.getSection: invalid `position`');
            return;
        }

        if (node === undefined) {
            node = this.root;
        }

        for (let section of node) {
            // Branch
            if (section.children.length) {
                this.getSection(position, section.children);
            }

            // Leaf
            if (section.range.contains(position)) {
                return section;
            }

        }
    }

    /**
     * Create a SectionItem tree from this tree.
     * @returns root of SectionItemTree
     */
    toTreeItem() {
        let root: SectionItem[] = [];

        for (let section of this.root) {
            root.push(
                new SectionItem(
                    this.document,
                    undefined,
                    section,
                )
            );
        }

        return root;
    }
}


/**
 * Section TreeProvider for text file in editors
 */
export class SectionTreeProvider implements vscode.TreeDataProvider<SectionItem> {
    private _onDidChangeTreeDataEmitter: vscode.EventEmitter<SectionItem | undefined | void> = new vscode.EventEmitter<SectionItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SectionItem | undefined | void> = this._onDidChangeTreeDataEmitter.event;

    private roots = new Map<string, SectionItem>;

    private documentNodes = new Map<string, SectionItem>;
    private itemCache = new Map<string, SectionItem[]>;

    // constructor() {
    //     this.cacheSection(undefined);
    // }

    constructor() {
        this.cacheSection(undefined);
    }

    /**
     * Find section in visible documents and cache the results.
     * @param documents a set of text file
     */
    private cacheSection(
        documents?: readonly vscode.TextDocument[],
    ) {
        if (documents === undefined) {
            let editors = vscode.window.visibleTextEditors;
            documents = editors.map(editor => editor.document);
        }
        for (let document of documents) {
            let tree = FILE_SECTION_TREES.get(document.fileName);

            if (!tree) {
                continue;
            }

            let top = tree.toTreeItem();
            let root = new SectionItem(document);
            root.children = top;
            this.roots.set(document.fileName, root);
        }
    }


    // == Abstraction ==
    getTreeItem(element: SectionItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getParent(element: SectionItem): vscode.ProviderResult<SectionItem> {
        return element.parent;
    }

    getChildren(element?: SectionItem | undefined): vscode.ProviderResult<SectionItem[]> {
        if (element === undefined) {  // querying roots
            let roots = Array.from(this.roots.values());
            return Promise.resolve(roots);
        }

        return element.children;
    }

    /**
     * Refresh the tree view from root.
     */
    public refresh(): void {
        this._onDidChangeTreeDataEmitter.fire();
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
        // this.expandDocument(document);
        this.refresh();
    }

    /**
     * Remove a document from view.
     * @param document
     */
    public removeDocument(document: vscode.TextDocument) {
        this.roots.delete(document.fileName);
        this.refresh();
    }
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
 * Section TreeProvider for text file in editors
 */
export class SectionTreeProviderBACKUP implements vscode.TreeDataProvider<SectionTreeItem> {
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
    // let treeOptions: vscode.TreeViewOptions<SectionTreeItem> = {
    //     treeDataProvider: treeProvider,
    //     showCollapseAll: true,
    // };

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
                // if (event.contentChanges.length === 0) {
                //     treeProvider.expandDocument(event.document);
                //     return;
                // }
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
