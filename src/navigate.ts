/**
 * Python code section navigation lib
 */
import * as path from 'path';
import * as vscode from 'vscode';

import * as cst from './constants';
import * as util from './utility';
import { getPythonEditor } from './ipython';
import { start } from 'repl';
import { match } from 'assert';


// === CACHE ===
export let sectionCache = new Map<string, vscode.Position[]>();


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

    let editor = getPythonEditor() as vscode.TextEditor;
    let lineCount = editor.document.lineCount;
    let endOfFile = editor.document.lineAt(lineCount - 1).range.end;

    if (sectionPositions.length === 0) {
        return new vscode.Range(startOfFile, endOfFile);
    }

    // NOTE: Must find `start` before `end`
    // -- Start
    let start = sectionPositions.slice().reverse().find(
        (position) => {
            //    return position.isBeforeOrEqual(cursorPosition);
            return position.line <= cursorPosition.line;
        },
    ) as vscode.Position;

    if (start === undefined) {
        start = startOfFile;
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
    let document = editor.document;
    let decors: vscode.DecorationOptions[] = [];

    let positions = sectionCache.get(document.fileName) as vscode.Position[];

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
    sectionCache.delete(fileName);
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
        sectionCache.delete(document.fileName);
        return;
    }
    sectionCache.set(document.fileName, positions);
}

/**
 * Move cursor to a section
 * @param below - move below or above
 */
export function moveCursorToSection(below: boolean) {
    let editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        return;
    }

    let cursor = editor.selection.start;
    let sectionPositions = sectionCache.get(editor.document.fileName);

    if (sectionPositions === undefined) {
        console.error('moveCursorToSection:: bad sectionCache');
        return;
    }

    let section = getSectionAt(cursor, sectionPositions, true);

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
    }
    moveAndRevealCursor(editor, section.start.line, section.start.character);
    return;
}


/**
 * Update section decoration.
 * @param editor - current active python editor
 */
export function updateSectionDecor(editor: vscode.TextEditor) {

    updateSectionCache(editor.document);

    setTimeout(decorateSection, cst.MAX_TIMEOUT);
    decorateSection(editor);
}


// === TREE PROVIDER ===

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
        let runable: string | undefined = undefined;
        let tooltip: string | undefined = undefined;
        let uri: vscode.Uri | undefined = undefined;
        let icon: vscode.ThemeIcon | undefined;
        if (position === undefined) {
            label = path.basename(document.fileName);
            tooltip = 'Click to Expand/Collapse';
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

            // icon = new vscode.ThemeIcon('bookmark');

            let tabSize = 4;
            let editorTabSize = vscode.window.activeTextEditor?.options.tabSize;
            if (editorTabSize !== undefined && typeof editorTabSize === 'number') {
                tabSize = editorTabSize;
            }
            let text = document.lineAt(position.line).text;

            // let pattern = getSectionPattern();
            let pattern = util.SECTION_TAG;

            let startOfFile = new vscode.Position(0, 0);
            let header = '';
            if (matchSectionTag(text)) {
                header = text.trim().replace(pattern, '');
            } else {
                header = (startOfFile.isEqual(position)) ? ' (First Section)' : '(Unknown)';
            }

            let level = position.character / tabSize;
            let front: string;
            if (level === 0) {
                front = `|-`;
            } else {
                front = `|${'--|'.repeat(level)}-`;
            }
            let lineMarker = `  (L:${position.line}, C:${position.character})`;
            label = front + header + lineMarker;
        }

        super(label, collapsibleState);

        this.position = position;
        this.document = document;
        this.contextValue = runable;
        this.resourceUri = uri;
        this.iconPath = icon;
        this.tooltip = tooltip;
    }

    /**
     * Jump active editor to document section. If document not opened,
     * open then jump.
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
 * Section TreeProvider for text files in workspace
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

    getChildren(element?: SectionItem | undefined): vscode.ProviderResult<SectionItem[]> {
        if (element === undefined) {
            let nodes = Array.from(this.documentNodes.values());
            return Promise.resolve(nodes);
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
    private cacheSection(documents: readonly vscode.TextDocument[] | undefined) {
        if (documents === undefined) {
            documents = vscode.workspace.textDocuments;
        }
        for (let document of documents) {
            let matchExt = document.fileName.search(util.FILE_EXT);
            if (matchExt === -1) {
                continue;
            }

            if (!matchSectionTag(document.getText())) {
                continue;
            }
            let docNode = this.createDocumentNode(document);
            this.documentNodes.set(document.fileName, docNode);
            this.cacheItem(docNode);
        }
    }

    /**
     * Cache the section nodes of a document.
     * @param documentNode a node representing a document with sections
     */
    private cacheItem(documentNode: SectionItem) {
        let document = documentNode.document;

        let positions = sectionCache.get(document.fileName);
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

    public expandDocument(document: vscode.TextDocument) {
        let docNode = this.documentNodes.get(document.fileName);
        if (docNode !== undefined) {
            docNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    /**
     * Refresh the view of a document.
     * @param document in view
     */
    public refreshDocument(document: vscode.TextDocument) {
        this.cacheSection([document]);
        this.expandDocument(document);
        this.refresh();
    }

    /**
     * Remove a document from view.
     * @param document in view
     */
    public removeDocument(document: vscode.TextDocument) {
        this.documentNodes.delete(document.fileName);
        this.itemCache.delete(document.fileName);
        this.refresh();
    }
}
