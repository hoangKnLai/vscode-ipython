// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// import {PythonExtension} from '@vscode/python-extension';

import * as util from './utility';
import * as ipy from './ipython';
import * as navi from './navigate';


export async function activate(context: vscode.ExtensionContext) {

    // FIXME: Keybinding `when clause`
    await vscode.commands.executeCommand('setContext', 'ipython.isUse', true);

    // NOTE: make sure all configuration are loaded and mapping are done FIRST!
    util.updateConfig();

    // Always make sure Python is available for creating terminal
    // FIXME: use official ms-python hook instead!?
    let pyExtension = vscode.extensions.getExtension('ms-python.python');
    if (pyExtension && !pyExtension.isActive){
        await pyExtension.activate();
    } else {
        console.error('activate: failed to activate MS-Python Extension');
    }

    // === CALLBACKS ===
    util.registerConfigCallbacks(context);
    navi.registerSectionNavigator(context);
    navi.registerSectionFolding(context);
    ipy.registerTerminalCallbacks(context);

    // === COMMANDS ===
    navi.registerCommands(context);
    ipy.registerCommands(context);
}

// this method is called when extension is deactivated
export function deactivate() {
    // NOTE: vscode tear down at closing is along this line
    //  - Immediately stop rendering and attempt tear down in 5secs or less
    //  - No guarantee that any extension deactivate() will be called immediately
    //  or at all at session closure

}
