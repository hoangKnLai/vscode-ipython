// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as ipy from "./ipython";


export function activate(context: vscode.ExtensionContext) {

    // FIXME: Keybinding `when clause`
    vscode.commands.executeCommand("setContext", "ipython.isUse", true);

    // Always make sure Python is available FIRST
    ipy.activatePython();

    // === TRIGGERS ===
    vscode.window.onDidChangeActiveTextEditor(
        () => {
            ipy.updateSectionDecor();
        },
        null,
        context.subscriptions
    );

    vscode.workspace.onDidCloseTextDocument(
        event => {
            ipy.removeSectionCache(event.fileName);
        }
    );

    vscode.workspace.onDidChangeTextDocument(
        event => {
            if (event.contentChanges.length === 0) {
                return;
            }

            ipy.updateSectionDecor();
        },
        null,
        context.subscriptions
    );

    // == Register Command ==
    // NOTE: place in package.json:"command" section for testing
    // {
    //   "category": "IPython",
    //   "command": "ipython._ipytest",
    //   "title": "Testing CODE. DEV ONLY."
    // },
    // context.subscriptions.push(
    //   vscode.commands.registerCommand("ipython._ipytest", () =>
    //     updateSectionDecor(getPythonEditor())
    //   )
    // );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToSectionTagAbove",
            () => ipy.moveCursorToSection(false)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToSectionTagBelow",
            () => ipy.moveCursorToSection(true)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.createTerminal",
            ipy.createTerminal
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFile",
            ipy.runFile
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgs",
            () => ipy.runFile(true, false)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithCli",
            () => ipy.runFile(false, true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgsCli",
            () => ipy.runFile(true, true)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runLineAndAdvance",
            ipy.runLine
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSelections",
            ipy.runSelections
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSection",
            ipy.runSection
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runSectionAndMoveToNext",
             () => ipy.runSection(true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runToLine",
            () => ipy.runCursor(false)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFromLine",
            () => ipy.runCursor(true)
        )
    );
}

// this method is called when extension is deactivated
export function deactivate() {
    // let wsFolders = vscode.workspace.workspaceFolders;  // Assume single workspace
    //   if (wsFolders === undefined){
    //     console.error("Workspace folder not found");
    //     return;
    //   }
    // let ws = wsFolders[0].uri.fsPath;
    // let folder = path.join(ws, ".vscode", "ipython");
    // let uri = vscode.Uri.file(folder);
    // vscode.workspace.fs.delete(uri, {recursive: true, useTrash: false});
}
