import {
  providerFindingSchema,
  providerOutputSchema,
  type AnalysisRequest,
  type ProviderFinding,
} from "@jev/contracts";
import { describe, expect, it } from "vitest";
import { InvalidProviderResponseError } from "./errors.js";
import { publishFindings } from "./findings.js";

const request: AnalysisRequest = {
  task: "Review the authentication change for architecture issues",
  workspace: {
    name: "sample-auth",
    structure: ["src/api/authController.ts", "src/application/authService.ts"],
  },
  currentFile: {
    path: "src/api/authController.ts",
    content: "export function login() { return true; }",
  },
  client: { ide: "vscode", version: "0.1.0" },
};

function finding(overrides: Partial<ProviderFinding> = {}): ProviderFinding {
  return {
    category: "architecture",
    severity: "medium",
    title: "Business logic in controller",
    description: "Authentication rules appear in the controller.",
    evidence: ["The controller contains authentication rules."],
    recommendation: "Move the authentication rules into an application service.",
    why: "The controller path shows authentication rules outside the service layer.",
    uncertainty: "This is limited to the supplied project context and is not a certainty.",
    confidence: 0.8,
    affectedFiles: ["src/api/authController.ts"],
    ...overrides,
  };
}

describe("technical findings", () => {
  it("accepts a valid finding and assigns an id", () => {
    const [published] = publishFindings([finding()], request);
    expect(published?.id).toBe("f1");
    expect(published?.category).toBe("architecture");
    expect(published?.severity).toBe("medium");
    expect(published?.why).toContain("controller");
    expect(published?.affectedFiles).toEqual(["src/api/authController.ts"]);
  });

  it("rejects a malformed finding", () => {
    expect(providerFindingSchema.safeParse({ title: "" }).success).toBe(false);
    expect(() => publishFindings([finding({ title: "" })], request)).toThrow(
      InvalidProviderResponseError,
    );
  });

  it("rejects an invalid severity", () => {
    expect(providerFindingSchema.safeParse({ ...finding(), severity: "urgent" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid category", () => {
    expect(providerFindingSchema.safeParse({ ...finding(), category: "duplication" }).success).toBe(
      false,
    );
  });

  it("rejects an invented affected file without returning that path", () => {
    const invented = "src/does-not-exist.ts";
    let message = "";
    try {
      publishFindings([finding({ affectedFiles: [invented] })], request);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
      expect(error).toBeInstanceOf(InvalidProviderResponseError);
    }
    expect(message).not.toContain(invented);
    expect(message.length).toBeGreaterThan(0);
  });

  it("rejects missing evidence", () => {
    expect(providerFindingSchema.safeParse({ ...finding(), evidence: [] }).success).toBe(false);
  });

  it("rejects an unsupported recommendation that the context does not contain", () => {
    expect(() =>
      publishFindings(
        [
          finding({
            recommendation: "Your production database is vulnerable.",
          }),
        ],
        request,
      ),
    ).toThrow(InvalidProviderResponseError);
  });

  it("publishes multiple findings in order", () => {
    const published = publishFindings(
      [
        finding(),
        finding({
          category: "maintainability",
          title: "Authentication rules are hard to reuse",
          description: "The authentication rules live only in the controller.",
        }),
      ],
      request,
    );
    expect(published.map((item) => item.id)).toEqual(["f1", "f2"]);
    expect(published.map((item) => item.category)).toEqual(["architecture", "maintainability"]);
  });

  it("allows an empty findings list", () => {
    expect(publishFindings([], request)).toEqual([]);
  });

  it("rejects a malformed provider response", () => {
    expect(
      providerOutputSchema.safeParse({
        summary: "Potential architecture issue detected.",
        recommendation: "Move the authentication rules.",
        findings: [{ ...finding(), evidence: [] }],
      }).success,
    ).toBe(false);
    expect(providerOutputSchema.safeParse({ summary: "" }).success).toBe(false);
  });
});
