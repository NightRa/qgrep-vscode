import * as path from 'path';
import * as vscode from 'vscode';

export class MirrorFs implements vscode.FileSystemProvider {
    private toFsUri(mirrorUri: vscode.Uri): vscode.Uri {
        if (mirrorUri.scheme !== 'mirror') {
            throw vscode.FileSystemError.FileNotFound(`Unexpected scheme: ${mirrorUri.scheme}`);
        }

        return mirrorUri.with({ scheme: 'file', authority: null as unknown as undefined, path: `/C:${mirrorUri.path}` });
    }

    private toMirrorUri(fsUri: vscode.Uri): vscode.Uri {
        if(fsUri.scheme !== 'file' || !fsUri.path.startsWith('/C:/')) { // Check starts with our root
            throw vscode.FileSystemError.FileNotFound(`Unexpected root dir in FS URI: ${fsUri.fsPath}`);
        }
        return fsUri.with({ scheme: 'mirror', authority: 'sample', path: `` });
    }

    stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
        return vscode.workspace.fs.stat(this.toFsUri(uri));
    }

    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
        return vscode.workspace.fs.readDirectory(this.toFsUri(uri));
    }

    // --- manage file contents

    readFile(uri: vscode.Uri): Thenable<Uint8Array> {
        return vscode.workspace.fs.readFile(this.toFsUri(uri));
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
        throw vscode.FileSystemError.NoPermissions("Can't write in MirrorFs");
    }

    // --- manage files/folders

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        throw vscode.FileSystemError.NoPermissions("Can't rename in MirrorFs");
    }

    delete(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions("Can't delete in MirrorFs");
    }

    createDirectory(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions("Can't create directories in MirrorFs");
    }

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
    watch(_resource: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes...
        return new vscode.Disposable(() => { });
    }
}
