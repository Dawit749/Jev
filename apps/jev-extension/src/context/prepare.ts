import { LIMITS, analysisRequestSchema, type AnalysisRequest } from "@jev/contracts";
import { diffLooksSensitive, isExcludedPath, isSafeRelativePath, truncateText } from "@jev/shared";

export type PrepareInput = {
  task: string;
  workspaceName: string;
  language?: string;
  structure: string[];
  currentFile?: { path: string; content: string; languageId?: string };
  selection?: string;
  relevantFiles?: { path: string; content: string }[];
  gitDiff?: string;
  clientVersion: string;
};

export type PrepareResult = {
  request: AnalysisRequest;
  narrowed: boolean;
  excludedSensitive: boolean;
};

export function prepareAnalysisRequest(input: PrepareInput): PrepareResult {
  const task = truncateText(input.task.trim(), LIMITS.maxTaskChars);
  if (!task.text) {
    throw new Error("Describe a task before analyzing.");
  }
  let narrowed = task.truncated;
  let excludedSensitive = false;
  let budget = LIMITS.maxTotalContextChars;

  const structure: string[] = [];
  for (const entry of input.structure) {
    if (structure.length >= LIMITS.maxStructureEntries) {
      narrowed = true;
      break;
    }
    const normalized = entry.replaceAll("\\", "/");
    const comparable = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
    if (!comparable || !isSafeRelativePath(comparable)) {
      excludedSensitive = excludedSensitive || isExcludedPath(comparable);
      continue;
    }
    const limited = truncateText(normalized, Math.min(LIMITS.maxStructureEntryChars, budget));
    if (!limited.text || limited.text.length > budget) {
      narrowed = true;
      continue;
    }
    if (limited.truncated) {
      narrowed = true;
    }
    budget -= limited.text.length;
    structure.push(limited.text);
  }

  const take = (value: string, max: number): string | undefined => {
    if (budget <= 0) {
      narrowed = true;
      return undefined;
    }
    const limited = truncateText(value, Math.min(max, budget));
    if (limited.truncated) {
      narrowed = true;
    }
    if (!limited.text) {
      return undefined;
    }
    budget -= limited.text.length;
    return limited.text;
  };

  let currentFile: AnalysisRequest["currentFile"];
  if (input.currentFile) {
    if (
      !isSafeRelativePath(input.currentFile.path) ||
      input.currentFile.path.length > LIMITS.maxPathChars
    ) {
      excludedSensitive = true;
      narrowed = true;
    } else {
      const content = take(input.currentFile.content, LIMITS.maxFileChars);
      if (content !== undefined) {
        currentFile = {
          path: input.currentFile.path,
          content,
          ...(input.currentFile.languageId
            ? { languageId: input.currentFile.languageId.slice(0, 40) }
            : {}),
        };
      }
    }
  }

  let selection: AnalysisRequest["selection"];
  if (input.selection && input.selection.length > 0) {
    const content = take(input.selection, LIMITS.maxSelectionChars);
    if (content) {
      selection = { content };
    }
  }

  let gitDiff: string | undefined;
  if (input.gitDiff && input.gitDiff.length > 0) {
    if (diffLooksSensitive(input.gitDiff)) {
      excludedSensitive = true;
      narrowed = true;
    } else {
      gitDiff = take(input.gitDiff, LIMITS.maxGitDiffChars);
    }
  }

  const relevantFiles: { path: string; content: string }[] = [];
  for (const file of input.relevantFiles ?? []) {
    if (relevantFiles.length >= LIMITS.maxRelevantFiles) {
      narrowed = true;
      break;
    }
    if (!isSafeRelativePath(file.path) || file.path.length > LIMITS.maxPathChars) {
      excludedSensitive = true;
      continue;
    }
    const content = take(file.content, LIMITS.maxRelevantFileChars);
    if (content) {
      relevantFiles.push({ path: file.path, content });
    }
  }

  const language = input.language?.trim().slice(0, 40);
  const workspaceName = truncateText(input.workspaceName.trim() || "workspace", 200).text;
  const parsed = analysisRequestSchema.safeParse({
    task: task.text,
    workspace: {
      name: workspaceName,
      ...(language ? { language } : {}),
      structure,
    },
    ...(currentFile ? { currentFile } : {}),
    ...(selection ? { selection } : {}),
    ...(relevantFiles.length > 0 ? { relevantFiles } : {}),
    ...(gitDiff ? { gitDiff } : {}),
    contextNarrowed: narrowed,
    client: { ide: "vscode", version: input.clientVersion.slice(0, 40) || "0.1.0" },
  });
  if (!parsed.success) {
    throw new Error("The supplied context is invalid.");
  }
  return { request: parsed.data, narrowed, excludedSensitive };
}
