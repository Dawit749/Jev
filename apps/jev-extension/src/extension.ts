import * as vscode from "vscode";
import { JevSidebarProvider } from "./sidebar";

export function activate(context: vscode.ExtensionContext): void {
  const sidebar = new JevSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("jev.sidebar", sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("jev.open", () => sidebar.reveal()),
    vscode.commands.registerCommand("jev.review", () => sidebar.reviewFromCommand()),
    vscode.commands.registerCommand("jev.why", () => sidebar.whyFromCommand()),
    vscode.commands.registerCommand("jev.dismiss", () => sidebar.dismissFromCommand()),
    vscode.workspace.onDidSaveTextDocument((document) => {
      sidebar.onDocumentSaved(document.uri.fsPath, document.getText());
    }),
  );
}

export function deactivate(): void {}
