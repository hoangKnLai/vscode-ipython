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


/**
 * Section in file.
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
            runable = 'runableSection';

            let tabSize = 4;
            let editorTabSize = vscode.window.activeTextEditor?.options.tabSize;
            if (editorTabSize !== undefined && typeof editorTabSize === 'number') {
                tabSize = editorTabSize;
            }
            let text = document.lineAt(position.line).text;

            let pattern = getSectionPattern();

            let startOfFile = new vscode.Position(0, 0);
            let header = '';
            if (matchSectionTag(text)){
                header = text.trim().replace(pattern, '');
            } else {
                header = (startOfFile.isEqual(position))? '(First Section)': '(Unknown)';
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
 * Match section pattern against text.
 * @param text - to find section pattern
 * @returns true when section pattern found in text.
 */
export function matchSectionTag(text: string) {
    let pattern = getSectionPattern();
    return text.match(pattern) !== null;
}

// === FUNCTIONS ===
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
 * @returns pattern - regular expression to find section tag capture tab and space
 * before it in a line
 */
export function getSectionPattern() {
    let sectionFlag = util.getConfig("SectionTag") as string;
    // NOTE: find section tag, capture tab and space before tag in a line
    // return new RegExp(`(?:^([\\t ]*)${sectionFlag.trim()})`);
    // NOTE: find section tag without capture, gm: global, multiline
    return new RegExp(`(?:^[\\t ]*${sectionFlag.trim()})`, 'gm');
}

/**
 * Section containing cursor position in document.
 * @param cursorPosition - default to `editor.selection.start`
 * @param sectionPositions - ascending positions of section tag in document
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
export function getEditor() {
    return vscode.window.activeTextEditor;
    // return vscode.window.visibleTextEditors;
}


/**
 * Find section tag position in current active text editor.
 *
 * @returns positions of section tag in ascending order. Top and bottom of
 * document are considered sections and are inclusive.
 */
export function findSectionPosition(document: vscode.TextDocument) {
    let pattern = getSectionPattern();

    let text = document.getText();
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
 * Decorate section with divider.
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

    for (let position of positions){
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
export function removeSectionCache(fileName: string){
    sectionCache.delete(fileName);
}

/**
 * Update section cache of document.
 * @param document - a text file.
 */
export function updateSectionCache(document: vscode.TextDocument){
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
    let editor = getEditor() as vscode.TextEditor;

    let cursor = editor.selection.start;
    let sectionPositions = sectionCache.get(editor.document.fileName) as vscode.Position[];

    if (sectionPositions === undefined) {
        console.error('moveCursorToSection:: bad cache');
        return;
    }

    let section = getSectionAt(cursor, sectionPositions, true);

    if (below) {
        moveAndRevealCursor(editor, section.end.line, section.end.character);
        return;
    }

    if (cursor.line === section.start.line){
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
export class SectionTreeProvider implements vscode.TreeDataProvider<SectionItem> {
    private _onDidChangeTreeDataEmitter: vscode.EventEmitter<SectionItem | undefined | void> = new vscode.EventEmitter<SectionItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<SectionItem | undefined | void> = this._onDidChangeTreeDataEmitter.event;

	refresh(element: SectionItem | undefined = undefined): void {
		this._onDidChangeTreeDataEmitter.fire(element);
	}

    // NOTE: adhering to abstract
    getTreeItem(element: SectionItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: SectionItem | undefined): vscode.ProviderResult<SectionItem[]> {
        if (element === undefined) {

            // FIXME?!:
            //  Reduce to one tree
            //  in main, dynamically create the tree and store as new doc opens/close

            let sections: SectionItem[] = [];
            for (let document of vscode.workspace.textDocuments) {
                if (!matchSectionTag(document.getText())){
                    continue;
                }

                sections.push(
                    this.createRoot(document)
                );
            }

            return Promise.resolve(sections);
        }

        // Get section positions and convert each to SectionItem
        if (!element.document.isClosed) {

            // NOTE: assume first and last positions are top and bottom of document
            let positions = sectionCache.get(element.document.fileName);
            if (positions === undefined) {
                return Promise.resolve([]);
            }
            let document = element.document;
            let endOfFile = document.lineAt(document.lineCount - 1).range.end;
            let sections: SectionItem[] = [];
            for(let position of positions) {
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
            return Promise.resolve(sections);
        }
        return Promise.resolve([]);
    }

    public refreshDocument(document: vscode.TextDocument) {
        this.refresh(this.createRoot(document));
    }

    public createRoot(document: vscode.TextDocument) {
        return new SectionItem(
            document,
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
        );
    }


}
