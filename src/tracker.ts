/**
 * Recently used tracker.
 * NOTE: UNFINISHED, DO NOT USE, likely not a good solution
 */
import * as vscode from 'vscode';


// === FILE ===

// package.json option
// "ipython.navigatorMaxActiveFiles": {
//     "type": "integer",
//     "default": 2,
//     "markdownDescription": "Cap navigator number of most recently active file. If 0, remove cap."
// },


export class ActiveDocument {
    /** Maximum number of recent document to track */
    private maxActive: number;

    // documents: vscode.TextDocument[] = [];

    /** Age of documents */
    private age = new Map<string, number>();

    constructor(maxActive: number) {
        this.maxActive = maxActive >= 0? maxActive : 3;
        if (vscode.window.activeTextEditor){
            this.add(vscode.window.activeTextEditor.document);
        }
    }

    set maxActiveDocument(max: number) {
        if (max <= 0) {
            this.age.clear();
            this.maxActive = 0;
            return;
        }
        if (max > this.maxActive) {
            this.maxActive = max;
            return;
        }

        let total = Math.max(
            this.age.size - max,
            0,
        );
        for (let ii = 0; ii < total; ++ii) {
            this.drop();
        }

        this.maxActive = max;
    }


    /** Recently opened */
    public get recent() {
        if (this.maxActive > 0) {
            return new Set(this.age.keys());
        }
        let editors = vscode.window.visibleTextEditors;
        let documents = editors.map(editor => editor.document.fileName);
        return documents;
    }

    add(document: vscode.TextDocument) {
        if (this.age.has(document.fileName)) {
            this.age.set(document.fileName, 0);
            let others = Array.from(this.age.keys());
            others = others.filter((name) => name !== document.fileName);
            this.rank(others);
            return;
        }

        if (this.age.size >= this.maxActive) {
            this.drop();
            this.rank();
        }
        this.age.set(document.fileName, 0);
    }

    /**
     * Drop the document from active list
     * @param fileName of an active document. Default to oldest active document.
     * @returns same as map.delete(name)
     */
    drop(fileName: string | undefined = undefined) {
        if (fileName) {
            return this.age.delete(fileName);
        }

        let age = Array.from(this.age.values());
        let oldest = Math.max(...age);
        let index = age.findIndex((value) => value === oldest) as number;
        fileName = Array.from(this.age.keys())[index];
        return this.age.delete(fileName);
    }

    /**
     * Update document age perserving newborn with age = 0
     * @param fileNames of documents. Default are this.age.keys()
     */
    rank(fileNames: string[] | undefined = undefined) {
        if (fileNames === undefined) {
            fileNames = Array.from(this.age.keys());
        }
        for (let doc of fileNames) {
            let age = this.age.get(doc) as number;
            age = ((age + 1) % this.maxActive) + 1;
            this.age.set(doc, age);
        }
    }

    register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(
                (document) => {
                    this.add(document);
                },
                null,  // thisArgs
                context.subscriptions,  // disposables
            )
        );

        context.subscriptions.push(
            vscode.workspace.onDidCloseTextDocument(
                (document) => {
                    this.drop(document.fileName);
                },
                null,  // thisArgs
                context.subscriptions,  // disposables
            ),
        );

        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(
                (editor) => {
                    if (editor && editor.document !== undefined) {
                        this.add(editor.document);
                    }
                },
                null, // thisArgs
                context.subscriptions,  // disposables
            )
        );
    }
}
