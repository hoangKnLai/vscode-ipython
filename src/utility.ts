/**
 * Convenient utility functions ONLY
 */
import * as vscode from "vscode";
import * as cst from "./constants";

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
export function wait(msec: number) {
    return new Promise((resolve) => setTimeout(resolve, msec));
}