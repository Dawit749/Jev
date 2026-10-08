import * as vscode from "vscode";
import { isSafeRelativePath, toWorkspaceRelative } from "@jev/shared";
import { readCurrentFileDiff } from "./gitDiff";
import { prepareAnalysisRequest, type PrepareResult } from "./prepare";
import { collectNearbyFiles, collectWorkspaceStructure } from "./workspace";

export async function collectAnalysisRequest(task: string): Promise<PrepareResult> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const editor = vscode.window.activeTextEditor;
  const document = editor?.document;
  const root = folder?.uri.fsPath;
  let relativePath: string | undefined;
  let currentFile: { path: string; content: string; languageId?: string } | undefined;
  let selection: string | undefined;

  if (document && document.uri.scheme === "file") {
    relativePath = root
      ? toWorkspaceRelative(root, document.uri.fsPath)
      : fileNameOnly(document.uri.fsPath);
    if (relativePath && isSafeRelativePath(relativePath)) {
      currentFile = {
        path: relativePath,
        content: document.getText(),
        ...(document.languageId ? { languageId: document.languageId } : {}),
      };
    }
    if (editor && !editor.selection.isEmpty) {
      selection = document.getText(editor.selection);
    }
  }

  const structure = root
    ? await collectWorkspaceStructure(root)
    : { entries: [], truncated: false };
  const nearby =
    root && relativePath
      ? await collectNearbyFiles(root, relativePath)
      : { files: [], truncated: false };
  const gitDiff = root && relativePath ? await readCurrentFileDiff(root, relativePath) : undefined;

  return prepareAnalysisRequest({
    task,
    workspaceName: folder?.name ?? "workspace",
    ...(currentFile?.languageId ? { language: currentFile.languageId } : {}),
    structure: structure.entries,
    ...(currentFile ? { currentFile } : {}),
    ...(selection ? { selection } : {}),
    relevantFiles: nearby.files,
    ...(gitDiff ? { gitDiff } : {}),
    clientVersion: vscode.version,
  });
}

function fileNameOnly(filePath: string): string | undefined {
  const name = filePath.split(/[/\\]/).pop();
  return name && isSafeRelativePath(name) ? name : undefined;
}
