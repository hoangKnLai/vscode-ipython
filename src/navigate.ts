/**
 * Python code section navigation lib
 */
import * as path from 'path';
import * as vscode from 'vscode';

import * as cst from './constants';
import * as util from './utility';


// === CACHE ===
export let sectionCache = new Map<string, vscode.Position[]>();


// === CONSTANTS ===
// FIXME: use editor.tabSize &| editor.detectIndentation
export const tabSize = 4;  // spaces

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
class SectionItem extends vscode.TreeItem {
    constructor(
        public document: vscode.TextDocument,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public position: vscode.Position | undefined,
    ) {
        let label: string;
        if (position === undefined) {
            label = path.basename(document.fileName);

        } else {
            let header = util.replaceTabWithSpace(
                document.lineAt(position.line).text,
                tabSize,
            );
            let sectionTag = util.getConfig("SectionTag") as string;
            // let trimHeading = header.trimLeft();
            // let sLevel = (header.length - trimHeading.length);  // should be >= 0
            header = header.trim().replace(sectionTag, '');
            let level = position.character / tabSize;
            label = `|${'-'.repeat(level)}-${header}`;
            // label = header.replace(sectionTag, '').trimEnd();
        }

        super(label, collapsibleState);

        this.position = position;
        this.document = document;

        // this.tooltip = `Line${position.line}, Col${position.character}`;
        this.tooltip = 'click to open';
    }
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
    char = 0
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
    return new RegExp(`(?:^([\\t ]*)${sectionFlag.trim()})`);
}


/**
 * Section containing cursor position in document.
 * @param editor - active python text `editor`
 * @param position - default to `editor.selection.start`
 * @param ignoreLevel - `end` position allows to be of a lower level than `start`
 * @returns range with `start` and `end` of section
 */
export function getSectionAt(
    editor: vscode.TextEditor,
    position: vscode.Position | undefined = undefined,
    ignoreLevel: boolean = false,
) {
    let document = editor.document;
    let docCursor = editor.selection.start;
    if (position !== undefined) {
        docCursor = position;
    }

    // NOTE: should be ascending order or top to bottom of file
    //  - Must find start level before stop
    let positions = sectionCache.get(document.fileName) as vscode.Position[];

    // -- Start Position
    let aboveIndex = positions.reverse().findIndex(  // from cursor to top
        (position) => {
            return position.isBeforeOrEqual(docCursor);
        }
    );

    let start: vscode.Position;
    let level: number;
    if (aboveIndex === -1) {
        start = new vscode.Position(0, 0);  // first line
        level = 0;
    } else {
        start = positions[aboveIndex];
        level = document.lineAt(start.line).firstNonWhitespaceCharacterIndex;
    }

    // -- Find Section at Same Level
    if (ignoreLevel) {
        // FIXME: can be done more efficiently but likely not worth the effort
        level = Infinity;
    }

    let end:vscode.Position;
    let lastLine = document.lineCount - 1;

    // NOTE: reverse() undo prior reverse in finding start position!!
    let belowIndex = positions.reverse().findIndex(  // from start to bottom
        (position) => {
            let currLevel = document.lineAt(position.line).firstNonWhitespaceCharacterIndex;
            return (position.isAfter(start) && currLevel <= level);
        }
    );

    if (belowIndex === -1) {
        end = new vscode.Position(lastLine, lastLine);
    } else {
        end = positions[belowIndex];
    }

    return new vscode.Range(start, end);
}


// === SECTION ===
export function getPythonEditor() {
    return vscode.window.activeTextEditor;
    // return vscode.window.visibleTextEditors;
}



/**
 * Find section tag in current active text editor.
 *
 * @returns positions of section tag in ascending order
 */
export function findSections() {
    let editor = getPythonEditor() as vscode.TextEditor;
    let document = editor.document;
    let sectionFlag = util.getConfig("SectionTag") as string;

    // NOTE: find section tag without capture, gm: global, multiline
    let pattern = new RegExp(`(?:^[\\t ]*${sectionFlag.trim()})`, 'gm');

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
    return positions;
}

/**
 * Decorate section with divider.
 *
 * @param editor - current active python editor
 * @returns - undefined when failed
 */
export function decorateSection(editor: vscode.TextEditor) {
    let positions = sectionCache.get(editor.document.fileName) as vscode.Position[];
    const decors: vscode.DecorationOptions[] = [];
    for (let position of positions){
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
 * Update section cache of active editor.document.
 * @param editor - an active python text editor
 */
export function updateSectionCache(editor: vscode.TextEditor){
    let positions = findSections();
    let key = editor.document.fileName;
    sectionCache.set(key, positions);
}

/**
 * Move cursor to a section
 * @param below - move below or above
 */
export function moveCursorToSection(below: boolean) {
    let editor = getPythonEditor() as vscode.TextEditor;

    let section = getSectionAt(editor, undefined, true);

    if (below) {
        moveAndRevealCursor(editor, section.end.line, section.end.character);
        return;
    }
    let cursor = editor.selection.start;
    if (cursor.line === section.start.line){
        let deltaLine = - 1;
        if (cursor.line + deltaLine < 0) {
            return;
        }
        section = getSectionAt(editor, cursor.translate(deltaLine), true);
    }
    moveAndRevealCursor(editor, section.start.line, section.start.character);
    return;
}


/**
 * Update section decoration.
 * @param editor - current active python editor
 */
export function updateSectionDecor() {
    let editor = getPythonEditor() as vscode.TextEditor;

    updateSectionCache(editor);

    setTimeout(decorateSection, cst.MAX_TIMEOUT);
    decorateSection(editor);
}


// === TREE PROVIDER ===
export class SectionTreeProvider implements vscode.TreeDataProvider<SectionItem> {
    private _onDidChangeTreeDataEmitter: vscode.EventEmitter<SectionItem | undefined | void> = new vscode.EventEmitter<SectionItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<SectionItem | undefined | void> = this._onDidChangeTreeDataEmitter.event;

	refresh(): void {
		this._onDidChangeTreeDataEmitter.fire();
	}

    // NOTE: adhering to abstract
    getTreeItem(element: SectionItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: SectionItem | undefined): vscode.ProviderResult<SectionItem[]> {
        if (element === undefined) {
            // Open files as root
            let sections: SectionItem[] = [];
            for (let editor of vscode.window.visibleTextEditors) {
                sections.push(
                    new SectionItem(
                        editor.document,
                        vscode.TreeItemCollapsibleState.Expanded,
                        undefined,
                    )
                );
            }
            return Promise.resolve(sections);
        }

        // Get section positions and convert each to SectionItem
        if (!element.document.isClosed) {
            let positions = sectionCache.get(element.document.fileName) as vscode.Position[];

            let sections: SectionItem[] = [];
            for(let position of positions) {
                sections.push(
                    new SectionItem(
                        element.document,
                        vscode.TreeItemCollapsibleState.None,
                        position,
                    )
                );
            }
            return Promise.resolve(sections);
        }
        return Promise.resolve([]);
    }
}
