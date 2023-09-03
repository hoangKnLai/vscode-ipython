// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as ipy from "./ipython";


export function activate(context: vscode.ExtensionContext) {

    // -- FIXME: Keybinding `when clause`
    vscode.commands.executeCommand("setContext", "ipython.isUse", true);

    // Always make sure Python is available FIRST
    ipy.activatePython();

    // === TRIGGERS ===
    vscode.window.onDidChangeActiveTextEditor(editor => {
        ipy.updateCellDecor(editor);
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length === 0) {
            return;
        }
        let editor = ipy.getPythonEditor();
        ipy.updateCellDecor(editor);
    }, null, context.subscriptions);

    // == Register Command ==
    // NOTE: place in package.json:"command" section for testing
    // {
    //   "category": "IPython",
    //   "command": "ipython._ipytest",
    //   "title": "Testing CODE. DEV ONLY."
    // },
    // context.subscriptions.push(
    //   vscode.commands.registerCommand("ipython._ipytest", () =>
    //     updateCellDecor(getPythonEditor())
    //   )
    // );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToCellTagAbove",
            () => ipy.moveCursorToCell(false)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToCellTagBelow",
            () => ipy.moveCursorToCell(true)
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
            () => ipy.runFile(false, true, false)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithCli",
            () => ipy.runFile(false, false, true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgsCli",
            () => ipy.runFile(false, true, true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.resetAndRunFile",
            () => ipy.runFile(true, false, false)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.resetAndRunFileWithArgs",
            () => ipy.runFile(true, true, false)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.resetAndRunFileWithCli",
            () => ipy.runFile(true, false, true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.resetAndRunFileWithArgsCli",
            () => ipy.runFile(true, true, true)
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
            "ipython.runCell",
            ipy.runCell
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runCellAndMoveToNext",
             () => ipy.runCell(true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runToLine",
            () => ipy.runCursor("top")
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFromLine",
            () => ipy.runCursor("bottom")
        )
    );
}

// this method is called when your extension is deactivated
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
