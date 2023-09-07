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
        public position: vscode.Position | undefined = undefined,
        public next: SectionItem | undefined = undefined,
        public subsection: SectionItem | undefined = undefined,
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


// function buildSectionTree(
//     document: vscode.TextDocument,
// ) {
//     let lastLine = document.lineCount - 1;
//     let positions = sectionCache.get(document.fileName) as vscode.Position[];
//     let sections: SectionItem[] = [];
//     positions.forEach(
//         (position, index) => {
//             let sectionPositions = positions.slice(index);

//             // Check subsection
//             let rangeSub = getSectionAt(position, sectionPositions, lastLine, true);
//             let collapsibleState = vscode.TreeItemCollapsibleState.None;
//             if (rangeSub.start.character !== rangeSub.end.character) {
//                 collapsibleState =  vscode.TreeItemCollapsibleState.Expanded;
//             }

//             // Check for next secion
//             let rangeNext = getSectionAt(position, sectionPositions, lastLine, false);


//             sections.push(
//                 new SectionItem(
//                     document,
//                     position,
//                     subsect
//                 )
//             )

//         },
//     );
// }



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
    return new RegExp(`(?:^([\\t ]*)${sectionFlag.trim()})`);
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
    // NOTE: Must find `start` before `end`
    // -- Start
    // Exclude bottom of file to avoid cursor locked at bottom
    let start = sectionPositions.slice(0, -1).reverse().find(
        (position) => {
        //    return position.isBeforeOrEqual(cursorPosition);
            return position.line <= cursorPosition.line;
        },
    ) as vscode.Position;

    let end = sectionPositions.find(
        (position) => {
            return (
                position.isAfter(start)
                && (ignoreLevel || position.character <= start.character));
        }
    ) as vscode.Position;

    if (end === undefined) {
        // End of file
        end = sectionPositions[sectionPositions.length - 1];
    }
    return new vscode.Range(start, end);
}


// === SECTION ===
export function getPythonEditor() {
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

    // NOTE: first and last items are beginning and end of file
    let positions = sectionCache.get(document.fileName) as vscode.Position[];

    const decors: vscode.DecorationOptions[] = [];
    // let top = new vscode.Position(0, 0);
    // let bottom = document.lineAt(document.lineCount - 1).range.end;

    // positions = positions.filter(
    //     (position) => {
    //         return position.isAfter(top) && position.isBefore(bottom);
    //     }
    // );

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
 * Update section cache of document.
 * @param document - a text file.
 */
export function updateSectionCache(document: vscode.TextDocument){
    let positions = findSectionPosition(document);
    sectionCache.set(document.fileName, positions);
}

/**
 * Move cursor to a section
 * @param below - move below or above
 */
export function moveCursorToSection(below: boolean) {
    let editor = getPythonEditor() as vscode.TextEditor;

    let cursor = editor.selection.start;
    let sectionPositions = sectionCache.get(editor.document.fileName) as vscode.Position[];
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

            for (let document of vscode.workspace.textDocuments) {
                sections.push(
                    new SectionItem(
                        document,
                        vscode.TreeItemCollapsibleState.Expanded,
                        undefined,
                    )
                );
            }
            return Promise.resolve(sections);
        }

        // Get section positions and convert each to SectionItem
        if (!element.document.isClosed) {

            // NOTE: assume first and last positions are top and bottom of document
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
