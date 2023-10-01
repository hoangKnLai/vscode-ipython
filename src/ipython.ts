/**
 * IPython specifics
 */

import * as path from "path";
import * as vscode from "vscode";

import * as util from "./utility";
import * as cst from "./constants";
import * as navi from "./navigate";

// === CONSTANTS ===
let newLine = util.getNewLine();

//FIXME: consider making configurable?!
export const terminalName = "IPython";

// === FUNCTIONS ===

/**
 * Get current editor.
 *
 * @returns active python text editor
 */
export function getPythonEditor() {
    let editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId !== "python") {
        return;
    }
    return editor;
}


/**
 * Write code to file.
 *
 * @param filename - name of file to write code to
 * @param code - properly formatted code
 * @returns URI to written file
 */
export function writeCodeFile(filename: string, code: string) {
    let fullFileName = path.join(util.WORK_FOLDER, filename);
    let fileUri = vscode.Uri.file(fullFileName);

    util.consoleLog(`Write File: ${fileUri.fsPath}`);
    util.tempfiles.add(fileUri);

    // NOTE: extra newline for indented code at end of file
    let cmd = Buffer.from(code, "utf8");
    vscode.workspace.fs.writeFile(fileUri, cmd);

    // return fullFileName;
    return fileUri;
}


// === TERMINAL ===

/**
 * Format single line or consecutive lines of code to fit ipython terminal.
 *
 * NOTE: always return code with empty newline like newline at end of file.
 *
 * @param document - current active python file
 * @param selection - a selection in python file
 * @returns code - executable on ipython terminal
 */
export function formatCode(
    document: vscode.TextDocument,
    selection: vscode.Selection
) {
    let code = '';
    document.save(); // force saving to properly get text

    if (selection.isSingleLine) {
        let text: string = '';
        if (selection.isEmpty) {
            // Support run line at cursor when empty selection
            text = document.lineAt(selection.start.line).text;
        } else {
            text = document.getText(selection.with());
        }
        code = text.trim() + newLine;
        return code;
    }

    // -- Format & Stack
    let textLines = document.getText(selection.with()).split(newLine);
    const isNotEmpty = (item: string) => item.trim().length > 0;
    let startLine = selection.start.line;
    let startIndex = textLines.findIndex(isNotEmpty);
    if (startIndex !== -1) {
        startLine += startIndex;
    } else {  // all lines and partial lines are whitespaces
        code = '' + newLine;
        return code;
    }

    // NOTE: use first non-empty line and include the whole line even if it is
    // partially selected
    let start = selection.start.with(startLine, 0);
    let range = selection.with(start);

    textLines = document.getText(range).split(newLine);

    textLines = util.leftAdjustTrim(textLines);
    if (textLines.length > 0) {
        code = textLines.join(newLine);

        // let lastIndex = textLines.length - 1;
        // let firstChar = textLines[lastIndex].search(/\S|$/);
        // if (firstChar > 0) { // last line is part of a block
        //     code += newLine;
        // }
    }
    return code + newLine;
}


// == TERMINAL
class IpyTerminal {
    readonly terminal: vscode.Terminal;
    readonly name: string;
    readonly uid: string;

    constructor(
        terminal:vscode.Terminal,
        name: string,
        uid: string
    ) {
        this.terminal = terminal;
        this.name = name;
        this.uid = uid;
    }

    public isEqual(tag: IpyTerminal) {
        return this.uid === tag.uid;
    }
}


/**
 * Set of created IPython terminals
 */
// export let TERMINALS = new Set<vscode.Terminal>();
export let TERMINALS = new Map<vscode.Terminal, IpyTerminal>();


/**
 * Current active IPython terminal
 */
export let ACTIVE_TERMINAL: vscode.Terminal | undefined;

/**
 * Python unqiue file identifier for use with terminal linkage
 */
export let FILE_UID = new Map<vscode.TextDocument, string>();


/**
 * Register terminal related callbacks.
 * @param context of extension
 */
export function registerTerminalCallbacks(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal(
            (terminal) => {
                if (terminal && TERMINALS.has(terminal)) {
                    ACTIVE_TERMINAL = terminal;
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal(
            (terminal) => {
                if (terminal) {
                    TERMINALS.delete(terminal);

                    if (ACTIVE_TERMINAL === terminal) {
                        ACTIVE_TERMINAL = undefined;
                    }
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(
            (document) => {
                if (document.languageId === 'python') {
                    if (!FILE_UID.has(document)) {
                        FILE_UID.set(document, util.createUniqueId());
                    }
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(
            (document) => {
                FILE_UID.delete(document);
            },
        )
    );
}


/**
 * Create an ipython terminal.
 *
 * @param name of the terminal tab. Default 'IPython'.
 * @param uid of the terminal. If undefined, use a random new unique identity.
 * @returns an ipython terminal
 */
export async function createTerminal(
    name: string = 'IPython',
    uid: string | undefined = undefined,
) {
    util.consoleLog('Creating IPython Terminal...');

    // -- Create and Tag IPython Terminal
    await vscode.commands.executeCommand('python.createTerminal');
    util.wait(500); // msec, to help with a race condition of not naming terminal

    let terminal = vscode.window.activeTerminal;
    if (terminal === undefined) {
        console.error('createTerminal: failed to create new ipython terminal');
        return;
    }

    // Launch options
    let cmd = 'ipython ';
    let launchArgs = util.getConfig('LaunchArguments') as string;

    let args = launchArgs.split(' ');
    for (let arg of args) {
        let s = arg.trim();
        if (s.length === 0) {
            continue;
        }
        cmd += s + ' ';
    }

    // Startup options
    // REF: https://ipython.readthedocs.io/en/stable/config/intro.html#command-line-arguments
    let cmds = util.getConfig('StartupCommands') as string[];
    let startupCmd = '';

    for (let c of cmds) {
        let s = c.trim();
        if (s.length === 0) {
            continue;
        }
        startupCmd += '--InteractiveShellApp.exec_lines=' + `'${s}' `;
    }
    cmd += startupCmd;

    util.consoleLog(`Startup Command: ${startupCmd}`);
    await executeSingleLine(terminal, cmd);
    await util.wait(1000);  // may take awhile to startup ipython

    await vscode.commands.executeCommand(
        'workbench.action.terminal.renameWithArg',
        { name: name }
    );

    // TERMINALS.add(terminal);
    if (uid === undefined) {
        uid = util.createUniqueId();
    }
    TERMINALS.set(
        terminal,
        new IpyTerminal(terminal, name, uid)
    );
    ACTIVE_TERMINAL = terminal;

    return terminal;
}

/**
 * Get an existing ipython terminal or create a new one.
 * @param uid of the terminal to retrieve. If undefined, get recent active
 * ipython terminal.
 * @returns an ipython terminal.
 */
export async function getTerminal(uid: string | undefined = undefined) {
    if (ACTIVE_TERMINAL && uid === undefined) {
        return ACTIVE_TERMINAL;
    }

    let activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal && TERMINALS.has(activeTerminal)) {
        let termUid = TERMINALS.get(activeTerminal)?.uid;
        if (termUid && uid && termUid === uid) {
            return activeTerminal;
        }
    }

    let ipyTerminal: IpyTerminal | undefined;
    if (TERMINALS.size > 0) {
        ipyTerminal = TERMINALS.values().next().value as IpyTerminal;
    }

    if (uid && ipyTerminal && uid === ipyTerminal.uid) {
        return ipyTerminal.terminal;
    }

    // No ipython terminal exists
    let terminal = await createTerminal(undefined, uid);
    ACTIVE_TERMINAL = terminal;
    return terminal;
}

// == CODE EXECUTION

/**
 * Execute a block of code.
 *
 * @param terminal - an ipython terminal
 * @param code - block of code
 * @param identity - of block
 */
export async function executeCodeBlock(
    terminal: vscode.Terminal,
    code: string,
    identity: string = '',
) {
    let file = writeCodeFile(cst.CODE_FILE, code);
    let path = vscode.workspace.asRelativePath(file);
    let nExec = 1;  // default to %run -i
    let execMethod = util.getConfig('RunCodeBlockMethod') as string;
    let command = `${execMethod} "${path}"`;

    if (execMethod === '%run -i'){
        command += `  ${identity}`;
    } else {  // assume %load
        nExec = 2;
    }
    terminal.sendText(command, false); // false: no append `newline`
    await execute(terminal, nExec);
}

/**
 * Execute single line command.
 *
 * @param terminal - an ipython terminal
 * @param command - a command
 * @param Promise - executed on terminal
 */
export async function executeSingleLine(
    terminal: vscode.Terminal,
    command: string,
) {
    command = command.trim();

    if (command.length === 0){
        return;
    }

    // NOTE: no newLine in sendText to execute since IPython is trippy
    // with when/how to execute a code line, block, multi-lines/blocks.
    terminal.sendText(command, false); // false: no append `newline`
    await execute(terminal);
}

/**
 * Execute code that are already sent to an ipython terminal.
 *
 * @param terminal - an ipython terminal
 * @param nExec - number of ipython execution
 * @param Promise - executed on terminal
 */
async function execute(
    terminal: vscode.Terminal,
    nExec=1
){
    // Wait for IPython to register command before execution.
    // NOTE: this helps with race condition, not solves it.
    if (nExec === 0) {
        return;
    }

    let execLagMilliSec = util.getConfig("ExecutionLagMilliSec") as number;
    util.consoleLog(`+ Number of Execution: ${nExec}`);
    for (let i = 0; i < nExec; i++) {
        await util.wait(execLagMilliSec);
        util.consoleLog(`- Waited ${execLagMilliSec} msec`);
        terminal.sendText('');
        util.consoleLog(`- Execute ID ${i}`);
    }

    await vscode.commands.executeCommand(
        "workbench.action.terminal.scrollToBottom"
    );
    terminal.show(true);
}

// === COMMANDS ===
/**
 * Run a python file in an ipython terminal.
 *
 * @param isWithArgs - with specific run arguments
 * @param isWithCli - run with command line interface arguments
 * @returns Promise - is ran in terminal
 */
export async function runFile(
    document: vscode.TextDocument | undefined,
    isWithArgs: boolean = false,
    isWithCli: boolean = false,
) {
    if (document === undefined) {
        let editor = getPythonEditor();
        if (editor === undefined) {
            console.error('runFile: failed to get a python editor');
            return;
        }
        await editor.document.save();
        document = editor.document;
    }

    let terminal = await getTerminal();
    if (terminal === undefined) {
        console.error('runFile: failed to get a Terminal');
        return;
    }

    let file = document.fileName;
    let cmd = `"${file}"`;
    if (isWithCli) {
        let args = util.getConfig('CommandLineArguments') as string;
        cmd = cmd + ` ${args}`;
    }
    if (isWithArgs) {
        let args = util.getConfig('RunArguments') as string;
        cmd = `${args} ` + cmd;
    }
    cmd = `%run ` + cmd;

    await executeSingleLine(terminal, cmd);
}

/**
 * Run a selection of python code in an ipython terminal.
 *
 * @returns Promise - is ran in terminal
 */
export async function runSelections() {
    util.consoleLog('IPython run selection...');
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error('runFile: failed to get an editor');
        return;
    }
    let terminal = await getTerminal();
    if (terminal === undefined) {
        console.error('runFile: failed to get a Terminal');
        return;
    }

    let codes:string[] = [];
    for (let select of editor.selections) {
        let code = formatCode(editor.document, select);
        let lines = code.trimEnd().split(newLine);
        for (let line of lines) {
            codes.push(line);
        }
    }
    let isSingleLine = codes.length === 1;
    let code = codes.join(newLine) + newLine;

    util.consoleLog(`IPython Run Line Selection(s):${code}`);
    if (isSingleLine){
        await executeSingleLine(terminal, code);
        return;
    }
    let identity = '# selection(s)';
    await executeCodeBlock(terminal, code, identity);
}

/**
 * Run current line of code and move cursor to next line.
 *
 * @returns Promise - executed in terminal
 */
export async function runLine() {
    util.consoleLog('IPython run a line...');
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error('runFile: Failed to get an editor');
        return;
    }

    if (!editor.selection.isSingleLine && !editor.selection.isEmpty) {
        runSelections();
        return;
    }

    let terminal = await getTerminal();
    if (terminal === undefined) {
        console.error('runFile: Failed to get a Terminal');
        return;
    }

    let cmd = formatCode(editor.document, editor.selection);
    if (cmd !== '') {
        util.consoleLog(`IPython Run Line :${cmd}`);
        await executeSingleLine(terminal, cmd);
    }

    let line = editor.selection.start.line + 1;
    navi.moveAndRevealCursor(editor, line);
}

// /**
//  * Run current section of python code in an ipython terminal.
//  *
//  * @param isNext - move cursor to next section if any
//  * @returns Promise - is ran in terminal
//  */

/**
 *
 * @param document a python text document
 * @param cursor a cursor position in document
 * @param toEnd inclusively from top to end of section or from start of section
 * to end of file. If undefined, run section at cursor.
 * @returns document section range
 */
export async function runDocumentSection(
    document: vscode.TextDocument,
    cursor: vscode.Position,
    toEnd: boolean | undefined = undefined,
) {
    let sectionPositions = navi.SECTIONS.get(document.fileName);
    if (sectionPositions === undefined) {
        console.error('runDocumentSection: failed to retrieve cache');
        return;
    }
    let section = navi.getSectionAt(cursor, sectionPositions, false);
    if (section === undefined) {
        console.error('runDocumentSection: failed to find section');
        return;
    }

    let header = navi.getSectionHeader(
        section.start,
        document,
    );

    let startPosition: vscode.Position;
    let stopPosition: vscode.Position;
    let tag = `${header}`;
    let singleSection = toEnd === undefined;
    if (singleSection) {
        startPosition = section.start;
        stopPosition = section.end;
    } else {  // run to/from section
        startPosition = new vscode.Position(0, 0);  // beginning of file
        stopPosition = section.end;
        tag = `run_to: ${header}`;

        if (toEnd) {  // to bottom
            startPosition = section.start;

            let lastLine = document.lineAt(document.lineCount - 1);
            stopPosition = lastLine.range.end;
            tag = `run_from: ${header}`;
        }
    }

    let sLine = startPosition.line;
    let sChar = startPosition.character;
    let eLine = stopPosition.line;
    let eChar = stopPosition.character;

    // NOTE: default line numbering is 1-indexing
    // FIXME: consider sourcing it from editor options like tabSize
    let lineMarker = `(Line.Col:${sLine + 1}.${sChar}-${eLine + 1}.${eChar})`;

    // let identity = `"# ${tag} ${lineMarker}"`;  // in python CLI as a string
    let identity = `# ${tag} ${lineMarker}`;  // in python CLI as argv

    let selection = new vscode.Selection(startPosition, stopPosition);
    let code = formatCode(document, selection);
    if (code !== '') {
        let terminal = await getTerminal();
        if (terminal) {
            await executeCodeBlock(terminal, code, identity);
        }
    }
    return section;
}

/**
 * Run current section of python code in an ipython terminal.
 *
 * @param isNext - move cursor to next section if any
 * @returns Promise - is ran in terminal
 */
export async function runSection(isNext: boolean) {
    util.consoleLog("IPython run section...");
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error('runFile: Failed to get an editor');
        return;
    }

    let cursor = editor.selection.start;
    let section = await runDocumentSection(editor.document, cursor, undefined);

    if (isNext) {
        if (section === undefined) {
            console.error('runSection: error finding section in document');
        } else {
            navi.moveAndRevealCursor(editor, section.end.line, section.end.character);
        }
    }
}

/**
 * Run code to or from cursor.
 *
 * @param toEnd inclusively from top to line or from line to end of file
 * @returns is ran in terminal
 */
export async function runCursor(toEnd: boolean) {
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error('runFile: Failed to get an editor');
        return;
    }

    let startLine = 0;
    let stopLine = editor.selection.start.line;

    if (toEnd) {  // to bottom
        startLine = editor.selection.start.line;
        stopLine = editor.document.lineCount - 1;
    }

    let startPosition = new vscode.Position(startLine, 0);
    let stopPosition = new vscode.Position(stopLine, 0);
    let selection = new vscode.Selection(startPosition, stopPosition);

    let name = path.basename(editor.document.fileName);
    // NOTE: editor display line is 1-indexing
    let start = selection.start.line + 1;
    let end = selection.end.line + 1;
    let identity = `# ${name} Line ${start}:${end}`;

    let code = formatCode(editor.document, selection);
    if (code !== '') {
        let terminal = await getTerminal();
        if (terminal) {
            await executeCodeBlock(terminal, code, identity);
        }
    }
}


/**
 * Register commands
 * @param context of extension
 */
export function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.createTerminal",
            createTerminal,
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFile",
            runFile,
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgs",
            () => runFile(undefined, true, false),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithCli",
            () => runFile(undefined, true),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgsCli",
            () => runFile(undefined, true, true),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runLineAndAdvance",
            runLine,
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSelections",
            runSelections
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSection",
            runSection,
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSectionAndMoveToNext",
             () => runSection(true),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runToLine",
            () => runCursor(false),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFromLine",
            () => runCursor(true),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runToSection",
            () => {
                let editor = vscode.window.activeTextEditor;
                if (editor) {
                    let document = editor.document;
                    let cursor = editor.selection.start;
                    runDocumentSection(document, cursor, false);
                }
            },
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFromSection",
            () => {
                let editor = vscode.window.activeTextEditor;
                if (editor) {
                    let document = editor.document;
                    let cursor = editor.selection.start;
                    runDocumentSection(document, cursor, true);
                }
            },
        )
    );
}

