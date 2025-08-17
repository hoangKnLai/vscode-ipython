/**
 * IPython specifics
 */

import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs"
import * as util from "./utility";
import * as cst from "./constants";
import * as navi from "./navigate";

// === CONSTANTS ===
let newLine = util.getNewLine();

//FIXME: consider making configurable?!
export const terminalName = 'IPy';

// === FUNCTIONS ===

/**
 * Get current editor.
 *
 * @returns active python text editor
 */
export function getPythonEditor() {
    let editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId !== 'python') {
        return;
    }
    return editor;
}


/**
 * Write code to file.
 * @param filename - name of file to write code to
 * @param code - properly formatted code
 * @returns relative path from workspaceFolder to written file
 */
export function writeCodeFile(filename: string, code: string) {
    if (!fs.existsSync(util.WORK_FOLDER)) {
        console.error(`writeCodeFile: invalid workFolder ${util.WORK_FOLDER}`);
        return;
    }
    let fullFileName = path.join(util.WORK_FOLDER, filename);
    let fileUri = vscode.Uri.file(fullFileName);

    util.consoleLog(`Write File: ${fileUri.fsPath}`);

    // NOTE: extra newline for indented code at end of file
    let cmd = Buffer.from(code, "utf8");
    vscode.workspace.fs.writeFile(fileUri, cmd);
    return fileUri.fsPath;
}


// === TERMINAL ===

/**
 * Format selected code to fit ipython terminal.
 * NOTE: always return code with an empty newline at end of file.
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
    }
    return code + newLine;
}


// == TERMINAL
// NOTE: vscode API does not have option to directly extends Terminal
/**
 * IPython wrapper on vscode.Terminal
 */
class IpyTerminal {
    readonly terminal: vscode.Terminal;
    readonly name: string;
    readonly uid: string;

    /**
     *
     * @param terminal a terminal with IPython console activated
     * @param name of the terminal. Should be same as terminal.name if change
     * name command successfully executed.
     * @param uid is the unique identity of the terminal
     */
    constructor(
        terminal: vscode.Terminal,
        name: string,
        uid: string
    ) {
        this.terminal = terminal;
        this.name = name;
        this.uid = uid;
    }

    /**
     *
     * @param ipyTerminal
     * @returns True when uid are the same
     */
    public isEqual(ipyTerminal: IpyTerminal) {
        return this.uid === ipyTerminal.uid;
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
 * Python unique file identifier for use with terminal linkage
 */
export let FILE_UID = new Map<string, string>();


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
        vscode.workspace.onDidCloseTextDocument(
            (document) => {
                FILE_UID.delete(document.fileName);
            },
        )
    );
}


export function attachTerminals(){
    for (let terminal of vscode.window.terminals) {
        if (terminal.name.startsWith(terminalName)) {
            let filename = getFileFromTerminalName(terminal.name);
            addTerminal(terminal, filename);
        }
    }

}


/**
 * Wrapper to create Python and then IPython terminal.
 *
 * @param filename of the terminal tab. Default {@link terminalName}.
 * @param uid of the terminal. If undefined, use a random new unique identity.
 * @returns an ipython terminal
 */
export async function createTerminal(
    filename: string = '',
    uid: string | undefined = undefined,
    extraStartupCmds: string[] | undefined = undefined,
) {
    util.consoleLog('Creating IPython Terminal...');

    // -- Create Python terminal
    await vscode.commands.executeCommand('python.createTerminal');
    util.wait(1000); // msec, to help with a race condition

    // FIXME: this is fragile, perhaps use @vscode/python-extension
    let terminal = vscode.window.terminals[vscode.window.terminals.length - 1];
    if (terminal === undefined) {
        console.error('createTerminal: failed!');
        return;
    }
    let ipyTerminal = await launchIpyTerminal(
        terminal,
        filename,
        uid,
        extraStartupCmds,
    )
    if (ipyTerminal === undefined) {
        console.error('createTerminal: failed to create new IPython terminal');
        return;
    }
    TERMINALS.set(
        terminal,
        ipyTerminal,
    );
    ACTIVE_TERMINAL = terminal;
    return ipyTerminal;
}


/**
 * Create an ipython terminal.
 *
 * @param terminal with activated environment that ipython call can be made to
 * create the IPython terminal. Default to lastest terminal in list.
 * @param filename of the terminal tab. Default {@link terminalName}.
 * @param uid of the terminal. If undefined, use a random new unique identity.
 * @returns an ipython terminal
 */
export async function launchIpyTerminal(
    terminal: vscode.Terminal | undefined = undefined,
    filename?: string,
    uid?: string,
    extraStartupCmds?: string[],
) {
    util.consoleLog('Launching IPython Terminal...');

    if (terminal === undefined) {
        terminal = vscode.window.terminals[vscode.window.terminals.length - 1];
    }
    if (terminal === undefined) {
        console.error('createTerminal: failed to create new ipython terminal');
        return;
    }
    terminal.show(true)  // bring it to current
    let cmd = getLaunchCommand(extraStartupCmds);
    await executeSingleLine(terminal, cmd);
    await util.wait(1000);  // may take awhile to startup ipython
    if (TERMINALS.has(terminal)) {
        return TERMINALS.get(terminal);
    }
    return addTerminal(terminal, filename, uid);
}


export function getLaunchCommand(extraStartupCmds?: string[]) {
    let cmd = 'ipython ';

    // Before script
    let script = util.getConfig('BeforeScript');
    if (script){
        cmd = script + ' && ' + cmd;
    }
    // Launch options
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
    if (extraStartupCmds) {
        cmds = cmds.concat(extraStartupCmds);
    }
    let startupCmd = '';
    for (let c of cmds) {
        let s = c.trim();
        if (s.length === 0) {
            continue;
        }
        // NOTE: "${s}" instead of single quote enable cross platform support
        startupCmd += '--InteractiveShellApp.exec_lines=' + `"${s}" `;
    }
    cmd += startupCmd;
    util.consoleLog(`Startup Command: ${startupCmd}`);
    return cmd;
}

/**
 * Add terminal to ipython terminal list
 *
 * @param terminal with activated environment that ipython can be called to
 * create the IPython terminal. Default to lastest terminal in list.
 * @param filename of the terminal tab. Default {@link terminalName}.
 * @param uid of the terminal. If undefined, use a random new unique identity.
 * @returns an ipython terminal
 */
export async function addTerminal(
    terminal: vscode.Terminal,
    filename?: string,
    uid?: string,
) {
    if (TERMINALS.has(terminal)) {
        return TERMINALS.get(terminal);
    }
    let name = composeTerminalName(filename);
    await vscode.commands.executeCommand(
        'workbench.action.terminal.renameWithArg',
        {name: name},
    );
    if (uid === undefined) {
        uid = util.createUniqueId();
    }
    let ipyTerminal = new IpyTerminal(terminal, name, uid);
    TERMINALS.set(terminal, ipyTerminal);
    if (filename) {
        FILE_UID.set(filename, ipyTerminal.uid);
    }
    ACTIVE_TERMINAL = terminal;
    return ipyTerminal;
}


/**
 * Get an existing ipython terminal.
 * @param uid of the terminal to retrieve. If undefined, get recent active
 * ipython terminal.
 * @returns an ipython terminal.
 */
export async function getTerminal(uid: string | undefined = undefined) {
    if (uid) {
        for (let ipyTerminal of TERMINALS.values()) {
            if (ipyTerminal.uid === uid) {
                return ipyTerminal.terminal;
            }
        }
    }
    if (ACTIVE_TERMINAL) {
        return ACTIVE_TERMINAL;
    }
    if (TERMINALS.size > 0) {
        let ipyTerminal = TERMINALS.values().next().value as IpyTerminal;
        return ipyTerminal.terminal;
    }
    let activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal && TERMINALS.has(activeTerminal)) {
        return activeTerminal;
    }
}

// == CODE EXECUTION

/**
 * Execute a block of code.
 * @param terminal - an ipython terminal
 * @param code - block of code
 * @param identity - of block
 */
export async function executeCodeBlock(
    terminal: vscode.Terminal,
    code: string,
    identity: string = '',
    isWithArgs: boolean = false,
) {
    let file = writeCodeFile(cst.CODE_FILE, code);
    if (file === undefined) {
        console.error(`executeCodeBlock: invalid ${file}`)
        return;
    }
    let nNewLines = 1;
    let execMethod = '%run -i'
    let command = composeIPythonCommand(file, isWithArgs, false, execMethod);
    if (identity) {
        command = `${command} ${identity}`;
    }
    terminal.sendText(command, false);  // false: no append `newline`
    await execute(terminal, nNewLines);
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

    if (command.length === 0) {
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
 * @param nNewLines - number of ipython execution
 * @param Promise - executed on terminal
 */
async function execute(
    terminal: vscode.Terminal,
    nNewLines = 1,
) {
    if (nNewLines === 0) {
        return;
    }
    // Wait for IPython to register command before execution.
    // NOTE: this helps with race condition, not solves it.
    let execLagMilliSec = util.getConfig("ExecutionLagMilliSec") as number;
    util.consoleLog(`+ Number of New Lines: ${nNewLines}`);
    for (let i = 0; i < nNewLines; i++) {
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
 *
 * @param document that new terminal is dedicated to.
 * @returns created {@link IpyTerminal}.
 */
export async function createDedicatedTerminal(
    document: vscode.TextDocument,
    isInDir: boolean = false,
) {
    let uid = FILE_UID.get(document.fileName);

    // Start terminal in file directory
    let extraStartupCmds: string[] | undefined = undefined;
    if (isInDir) {
        let folder = path.dirname(document.fileName);
        extraStartupCmds = [`%cd ${folder}`];
    }
    let ipyTerminal = await createTerminal(document.fileName, uid, extraStartupCmds);
    if (ipyTerminal) {
        return ipyTerminal;
    } else {
        console.error('createDedicatedTerminal: failed to create terminal');
        return;
    }
}


export function composeTerminalName(filename?: string) {
    let name = "";
    if (filename) {
        // let relPath = vscode.workspace.asRelativePath(filename);
        let basename = path.basename(filename);
        let addon = filename.replace(basename, '');
        addon = (addon.length > 0) ? (' ' + addon) : addon;
        name = basename + addon;
    }
    let prefix = `${terminalName}-${TERMINALS.size + 1}`;
    if (name) {
        name = `${prefix}: ${name}`;
    } else {
        name = prefix;
    }
    return name;
}


/**
 * Invert the composeTerminalName process to get the document filename if any
 * @param terminal
 * @returns produce document.fileName if any
 */
export function getFileFromTerminalName(name: string) {
    if (name.startsWith(terminalName)) {
        const regex = `^${terminalName}-\\d+: (.+)`;
        const match = name.match(regex);
        if (match && match.length > 1) {
            let file_folder = match[1].split(" ");
            return path.join(...file_folder.reverse());
        }
    }
}

/**
 * Run a python file in an ipython terminal.
 *
 * @param isWithArgs - with specific run arguments
 * @param isWithCli - run with command line interface arguments
 * @returns Promise - is ran in terminal
 */
export async function runFile(
    document: vscode.TextDocument | undefined,
    isNewDedicatedTerminal: boolean = false,
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
    let terminal: vscode.Terminal | undefined = undefined;
    let uid = FILE_UID.get(document.fileName);
    if (isNewDedicatedTerminal) {
        let ipyTerminal = await createDedicatedTerminal(document);
        if (ipyTerminal) {
            terminal = ipyTerminal.terminal;
        }
    } else {
        terminal = await getTerminal(uid);
        if (terminal === undefined) {
            let ipyTerminal = await createTerminal();
            if (ipyTerminal) {
                terminal = ipyTerminal.terminal;
            }
        }
    }
    if (terminal === undefined) {
        console.error('runFile: failed to get a Terminal');
        return;
    }
    let cmd = composeIPythonCommand(
        document.fileName,
        isWithArgs,
        isWithCli,
        '%run',
    );
    await executeSingleLine(terminal, cmd);
}


/**
 * Compose a command `${command} ${args} "${file}" ${cli}`
 * @param file full path to a file
 * @param isWithArgs to include command arguements
 * @param isWithCli to include file command line interface arguments
 * @param command the specific command
 */
export function composeIPythonCommand(
    file: string,
    isWithArgs: boolean = false,
    isWithCli: boolean = false,
    command: string = '%run',
) {
    let relativeFile = file;
    if (util.getConfig('UseRelativePath') as boolean) {
        relativeFile = vscode.workspace.asRelativePath(file, false);
    }
    relativeFile = `"${relativeFile}"`  // "": for platform compatibility
    let cmd: string[] = [command];
    if (isWithArgs) {
        let args = util.getConfig('RunArguments') as string;
        cmd.push(args);
    }
    cmd.push(relativeFile);
    if (isWithCli) {
        let args = util.getConfig('CommandLineArguments') as string;
        cmd.push(args);
    }
    return cmd.join(' ');
}


/**
 * Run a selection of python code in an ipython terminal.
 * @returns Promise - is ran in terminal
 */
export async function runSelections(isWithArgs: boolean = false) {
    util.consoleLog('IPython run selection...');
    let editor = getPythonEditor();
    if (editor === undefined) {
        console.error('runFile: failed to get an editor');
        return;
    }
    let terminal = await getTerminal();
    if (terminal === undefined) {
        let ipyTerminal = await createTerminal();
        if (ipyTerminal) {
            terminal = ipyTerminal.terminal;
        }
    }
    if (terminal === undefined) {
        console.error('runFile: failed to get a Terminal');
        return;
    }

    let codes: string[] = [];
    for (let select of editor.selections) {
        let code = formatCode(editor.document, select);
        let lines = code.trimEnd().split(newLine);
        for (let line of lines) {
            codes.push(line);
        }
    }
    let isSingleLine = codes.length === 1;
    let code = codes.join(newLine) + newLine;

    if (isSingleLine && !isWithArgs) {
        util.consoleLog(`IPython Run Line Selection(s):${code}`);
        await executeSingleLine(terminal, code);
        return;
    }
    let identity = '# selection(s)';
    await executeCodeBlock(terminal, code, identity, isWithArgs);
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
        let ipyTerminal = await createTerminal();
        if (ipyTerminal) {
            terminal = ipyTerminal.terminal;
        }
    }
    if (terminal === undefined) {
        console.error('runFile: failed to get a Terminal');
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


/**
 * Run current section of python code in an ipython terminal.
 * @param document a python text document
 * @param section of document
 * @param toEnd inclusively from top to end of section or from start of section
 * to end of file. If undefined, run section at cursor.
 * @returns code section that was ran
 */
export async function runDocumentSection(
    document: vscode.TextDocument,
    section: navi.Section,
    toEnd: boolean | undefined = undefined,
) {
    let singleSection = toEnd === undefined;
    if (singleSection) {
        let range = section.range;
        let tag = section.name;
        runDocumentRange(document, range, tag);
        return section.range;
    }

    if (toEnd) { // to bottom
        let lastLine = document.lineAt(document.lineCount - 1);
        let range = section.range.with(undefined, lastLine.range.end);
        let tag = `run_from: ${section.name}`;
        runDocumentRange(document, range, tag);
        return section.range;
    }

    // From top
    let beginOfFile = new vscode.Position(0, 0);
    let range = section.range.with(beginOfFile);
    let tag = `run_to: ${section.name}`;
    runDocumentRange(document, range, tag);
    return section.range;
}


/**
 *
 * @param document a Python .py text document
 * @param range a consecutive set of lines and characters
 * @param tag of this run. E.g., `$ %run -i code.py # tag`
 * @returns
 */
export async function runDocumentRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    tag: string = '',
) {
    if (document.languageId !== 'python') {
        console.error(`runDocumentRange: invalid languageId ${document.languageId}`);
        return;
    }

    let sLine = range.start.line;
    let sChar = range.start.character;
    let eLine = range.end.line;
    let eChar = range.end.character;
    let selectLabel = `(Line.Col:${sLine + 1}.${sChar}-${eLine + 1}.${eChar})`;

    let identity = `# ${tag} ${selectLabel}`;  // in python CLI as argv

    let selection = new vscode.Selection(range.start, range.end);
    let code = formatCode(document, selection);
    if (code !== '') {
        let terminal = await getTerminal();
        if (terminal === undefined) {
            let ipyTerminal = await createTerminal();
            if (ipyTerminal) {
                terminal = ipyTerminal.terminal;
            }
        }
        if (terminal) {
            await executeCodeBlock(terminal, code, identity);
        }
    }
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
    let section = navi.getSectionFrom(
        navi.FILE_SECTION_TREES,
        editor.document,
        cursor,
    );
    if (section === undefined) {
        console.error('runSection: failed to find section');
        return;
    }
    await runDocumentSection(editor.document, section, undefined);

    if (isNext) {
        section.jumpToNext(editor);
        let line = section.range.end.line + 1;
        if (line >= editor.document.lineCount) {
            line = editor.document.lineCount - 1;
        }

        let char = editor.document.lineAt(line).firstNonWhitespaceCharacterIndex;

        navi.moveAndRevealCursor(editor, line, char);
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
        if (terminal === undefined) {
            let ipyTerminal = await createTerminal();
            if (ipyTerminal) {
                terminal = ipyTerminal.terminal;
            }
        }
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
            "ipython.createDedicatedTerminal",
            () => {
                let document = vscode.window.activeTextEditor?.document;
                if (document) {
                    createDedicatedTerminal(document);
                }
            },
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.createDedicatedTerminalInFileDir",
            () => {
                let document = vscode.window.activeTextEditor?.document;
                if (document) {
                    createDedicatedTerminal(document, true);
                }
            },
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.addTerminal",
            () => {
                let terminal = vscode.window.activeTerminal;
                if (terminal){
                    addTerminal(terminal);
                }
            },
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.launchTerminal",
            () => {
                let terminal = vscode.window.activeTerminal;
                if (terminal){
                    launchIpyTerminal(terminal);
                }
            },
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
            "ipython.runFileInDedicatedTerminal",
            () => runFile(undefined, true),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgs",
            () => runFile(undefined, false, true, false),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithCli",
            () => runFile(undefined, false, true),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgsCli",
            () => runFile(undefined, false, true, true),
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
            () => runSelections(false),
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSelectionsWithArgs",
            () => runSelections(true),
        ),
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
                    let section = navi.getSectionFrom(
                        navi.FILE_SECTION_TREES,
                        document,
                        cursor,
                    );
                    if (section) {
                        runDocumentSection(document, section, false);
                    }
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
                    let section = navi.getSectionFrom(
                        navi.FILE_SECTION_TREES,
                        document,
                        cursor,
                    );
                    if (section) {
                        runDocumentSection(document, section, true);
                    }
                }
            },
        )
    );

    // -- navigation and ipython
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ipython.naviRunToSection',
            (item: navi.SectionItem) => {
                if (item === undefined) {
                    console.error('naviRunToSection: found undefined item');
                    return;
                }
                if(item && item.section !== undefined && item.document.languageId === 'python'){
                    runDocumentSection(item.document, item.section, false);
                }
            },
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ipython.naviRunFromSection',
            (item: navi.SectionItem) => {
                if (item === undefined) {
                    console.error('naviRunFromSection: found undefined item');
                    return;
                }
                if(item && item.section !== undefined && item.document.languageId === 'python'){
                    runDocumentSection(item.document, item.section, true);
                }
            },
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ipython.naviRunSection',
            (item: navi.SectionItem) => {
                if(item && item.section && item.document.languageId === 'python'){
                    runDocumentSection(item.document, item.section);
                }
            },
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'ipython.naviRunFile',
            (item: navi.SectionItem) => {
                if (item && item.document && item.document.languageId === 'python') {
                    runFile(item.document);
                }
            },
        ),
    );
}

