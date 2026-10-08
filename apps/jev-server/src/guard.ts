import type { AnalysisRequest } from "@jev/contracts";
import { diffLooksSensitive, isSafeRelativePath } from "@jev/shared";
import { HttpError } from "./errors.js";

function pathWithoutTrailingSlash(filePath: string): string {
  return filePath.endsWith("/") ? filePath.slice(0, -1) : filePath;
}

export function assertSafeAnalysisRequest(request: AnalysisRequest): void {
  const paths = [
    request.currentFile?.path,
    ...(request.relevantFiles ?? []).map((file) => file.path),
    ...request.workspace.structure.map(pathWithoutTrailingSlash),
  ];
  for (const filePath of paths) {
    if (filePath && !isSafeRelativePath(filePath)) {
      throw new HttpError(
        400,
        "INVALID_CONTEXT",
        "The supplied context includes a file that cannot be sent.",
      );
    }
  }
  if (request.gitDiff && diffLooksSensitive(request.gitDiff)) {
    throw new HttpError(
      400,
      "INVALID_CONTEXT",
      "The supplied context includes a file that cannot be sent.",
    );
  }
}

export function includedFiles(request: AnalysisRequest): string[] {
  const files: string[] = [];
  if (request.currentFile) {
    files.push(request.currentFile.path);
  }
  for (const file of request.relevantFiles ?? []) {
    files.push(file.path);
  }
  return files;
}
