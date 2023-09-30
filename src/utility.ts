/**
 * Convenient utility functions ONLY
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

import * as cst from './constants';


// FIXME: as configuration grow, might be worth to create a config.ts
export let config = vscode.workspace.getConfiguration('ipython');
export let WORK_FOLDER:string = '';
export let SECTION_TAG: RegExp = RegExp('');
export let FILE_EXT: RegExp = RegExp('');

// TODO: store temporary files for deletion when deactivated
export let tempfiles = new Set<vscode.Uri>();

/**
 * @returns a unique identifier
 */
export function createUniqueId() {
    let suffix = Math.floor(4294967296 * Math.random()).toString(36);
    let prefix = Date.now().toString(36);
    let uid =  prefix + suffix;
    return uid;
}

/**
 * Add escape characters to string for use with regular expression.
 * @param str a string intended for use in a regular expression
 * @returns string with regular expression special character escaped
 */
export function escapeRegex(str: string) {
    return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}


export function updateConfig() {
    config = vscode.workspace.getConfiguration('ipython');

    let baseDir = config.get('workFolderBase') as string;

    // -- Base directory of work folder
    if (baseDir === '') {
        baseDir = homedir();
    }

    let workFolder: string;
    if (!fs.existsSync(baseDir)) {
        workFolder = path.join(homedir(), cst.RELATIVE_WORKFOLDER);
        vscode.window.showWarningMessage(`ipython: invalid workFolder, default to ${workFolder}`);
    } else {
        workFolder = path.join(baseDir, cst.RELATIVE_WORKFOLDER);
    }
    WORK_FOLDER = workFolder;

    // -- Section Regular Expression
    let tags = config.get('SectionTag') as string[];
    tags = tags.map(
        (item) => {
            // Capture the expression inside /{expression}/, exclude //
            let match = item.match('\/(.+)\/');
            if (match !== null) {
                let expression = match[1];  // captured expression
                return `(${expression})`;
            }
            let literal = escapeRegex(item);
            return `(^[\\t ]*(${literal}))`;
        }
    );
    // NOTE: should be non-capture matching alternates
    //  (^[\\t ]*(literal))|(...)|(expression)|...
    let pattern = tags.join('|');
    SECTION_TAG = RegExp(pattern, 'gm');

    // -- File Extension Regular Expression
    let extensions = config.get('navigatorFileExtension') as string[];
    tags = extensions.map(
        (ext) => `(${escapeRegex(ext)})$`  // end of path string
    );
    pattern = '(?:' + tags.join('|') + ')';
    FILE_EXT = RegExp(pattern);
}

/**
 * Get extension configuration.
 *
 * @param name - configuration name
 * @returns - configuration value
 */
export function getConfig(name: string) {
    return config.get(name);
}

/**
 * Log message to console.
 *
 * @param message - added to console
 */
export function consoleLog(message: string) {
    if (cst.DEBUG) { console.log(message); };
}

/**
 * Find newline used by editor.
 *
 * @returns newLine - current editor newline
 */
export function getNewLine() {
    // \x0A is hex code for `Enter` key which might be better than `\n` ?!
    // let enterKey: string = "\x0A";
    // let enterKey:string = newLine;

    let newLine: string = "\n"; // default to eol === 1
    let editor = vscode.window.activeTextEditor;
    if (editor !== undefined) {
        let eol = editor.document.eol;
        if (eol === 2) {
            newLine = "\r\n";
        }
    }
    return newLine;
}

/**
 *
 * @returns tabSize in number of spaces of active editor.
 * Default is 4, if unresolved.
 */
export function getTabSize() {
    let tabSize = 4;  // spaces

    let editor = vscode.window.activeTextEditor;
    let editorTabSize: string | number | undefined = undefined;
    if (editor) {
        editorTabSize = editor.options.tabSize;
    }
    if (editorTabSize !== undefined && typeof editorTabSize === 'number') {
        tabSize = editorTabSize;
    }
    return tabSize;
}

/**
 * Replace tab with space.
 *
 * @param str - a string
 * @param n - number of spaces
 * @returns str - with tab replaced with spaces
 */
export function replaceTabWithSpace(str: string, n = 4) {
    return str.replace(/\t/gy, " ".repeat(n));
}


/**
 * System wait.
 *
 * @param msec - milliseconds
 * @returns Promise - system waited
 */
export function wait(msec: number = 1000) {
    return new Promise<boolean>(
        (resolve) => setTimeout(
            () => resolve(true),
            msec,
        )
    );
}


/**
 * Remove empty lines, left trim greatest common spaces, trim ends.
 *
 * @param lines - of strings
 * @returns trimLines - trimmed line of string
 */
export function leftAdjustTrim(lines: string[]) {
    lines = lines.filter((item) => item.trim().length > 0);

    let start = 0;
    let isFirst = true;
    let isNewBlock = true;
    let trimLines: string[] = new Array();
    for (let line of lines) {
        // Ensure tab are handled
        line = replaceTabWithSpace(line);
        let begin = line.search(/\S|$/); // index of first non-whitespace
        isNewBlock = begin < start;
        if (isFirst) {
            // First line has hanging spaces
            start = begin;
            isFirst = false;
        }
        if (isNewBlock && !isFirst) {
            start = begin;
        }

        trimLines.push(line.substring(start).trimEnd());
    }
    return trimLines;
}


