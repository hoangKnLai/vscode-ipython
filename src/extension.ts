// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as util from './utility';
import * as ipy from './ipython';
import * as navi from './navigate';


export async function activate(context: vscode.ExtensionContext) {

    // FIXME: Keybinding `when clause`
    vscode.commands.executeCommand("setContext", "ipython.isUse", true);

    // Always make sure Python is available FIRST for creating terminal
    // FIXME: use official ms-python hook instead!?
    let pyExtension = vscode.extensions.getExtension("ms-python.python");
    if (pyExtension === undefined) {
        throw new Error("Failed to activate MS-Python Extension");
    }
    if (!pyExtension.isActive){
        await pyExtension.activate();
    }

    for (let document of vscode.workspace.textDocuments) {
        navi.updateSectionCache(document);
    }
    navi.updateSectionDecor(vscode.window.activeTextEditor as vscode.TextEditor);
    util.updateConfig();

    // === SECTION VIEWER ===
    let treeProvider = new navi.SectionTreeProvider();
    let treeOptions: vscode.TreeViewOptions<navi.SectionItem> = {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    };

    // FUTURE: potential enhancement of tree drag/drop of sections
    vscode.window.createTreeView(
        'ipyNavigator',
        treeOptions,
    );

    // === CALLBACKS ===
    // TODO: move callbacks to various module registerCallbacks()
    vscode.workspace.onDidChangeConfiguration(
        (event) => {
            if (event.affectsConfiguration('ipython')) {
                util.updateConfig();
            }
        }
    );

    vscode.workspace.onDidChangeTextDocument(
        (event) => {
            if (event.contentChanges.length === 0) {
                return;
            }
            navi.updateSectionCache(event.document);
            navi.updateSectionDecor(vscode.window.activeTextEditor as vscode.TextEditor);
            treeProvider.refreshDocument(event.document);
        },
        null,
        context.subscriptions,
    );

    vscode.workspace.onDidOpenTextDocument(
        (document) => {
            navi.updateSectionCache(document);
            treeProvider.refreshDocument(document);
        }
    );

    vscode.workspace.onDidCloseTextDocument(
        document => {
            navi.removeSectionCache(document.fileName);
            treeProvider.removeDocument(document);
        },
    );

    vscode.window.onDidChangeActiveTextEditor(
        (editor) => {
            if (editor === undefined) {
                return;
            }
            navi.updateSectionDecor(editor);
            // treeProvider.refreshDocument(editor.document);
            // treeProvider.refresh();
        },
        null,
        context.subscriptions,
    );

    // === COMMANDS: TREEVIEW ===
    // TODO: move command registration to various module registerCommands()
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.naviRunSection",
            (item: navi.SectionItem) => {
                if(item.position !== undefined && item.document.languageId === 'python'){
                    ipy.runDocumentSection(item.document, item.position);
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.naviRunFile",
            (item: navi.SectionItem) => {
                if (item.document.languageId === 'python') {
                    ipy.runFile(item.document);
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.naviJumpToSection",
            (item: navi.SectionItem) => item.jumpToSection(),
        ),
    );

    // === COMMANDS: EDITOR  ===
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToSectionTagAbove",
            () => navi.moveCursorToSection(false)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.moveToSectionTagBelow",
            () => navi.moveCursorToSection(true)
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
            () => ipy.runFile(undefined, true, false)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithCli",
            () => ipy.runFile(undefined, true)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ipython.runFileWithArgsCli",
            () => ipy.runFile(undefined, true, true)
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
             () => ipy.runSection(true),
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
    // Remove temporary file used
    for (let uri of util.tempfiles) {
        vscode.workspace.fs.delete(uri);
    }
}
