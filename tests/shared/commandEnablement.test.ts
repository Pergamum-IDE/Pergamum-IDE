import { describe, expect, it } from "vitest";
import {
  InvalidCommandEnablementExpressionError,
  evaluateCommandEnablement,
  evaluateCommandEnablementResult,
  validateCommandEnablementExpression,
  type CommandEnablementExpression
} from "../../src/shared/commandEnablement";

describe("evaluateCommandEnablement", () => {
  it("treats an omitted expression as enabled", () => {
    expect(evaluateCommandEnablement(undefined, {})).toBe(true);
  });

  it("evaluates a key against the context", () => {
    expect(
      evaluateCommandEnablement(
        { key: "editor.isDirty" },
        { "editor.isDirty": true }
      )
    ).toBe(true);
    expect(
      evaluateCommandEnablement(
        { key: "editor.isDirty" },
        { "editor.isDirty": false }
      )
    ).toBe(false);
  });

  it("evaluates a known key missing from the snapshot as false", () => {
    expect(evaluateCommandEnablement({ key: "editor.isDirty" }, {})).toBe(
      false
    );
  });

  it("negates with not", () => {
    expect(
      evaluateCommandEnablement(
        { not: { key: "editor.isDirty" } },
        { "editor.isDirty": false }
      )
    ).toBe(true);
    expect(
      evaluateCommandEnablement(
        { not: { key: "editor.isDirty" } },
        { "editor.isDirty": true }
      )
    ).toBe(false);
  });

  it("requires every child to be true for allOf", () => {
    const expression: CommandEnablementExpression = {
      allOf: [{ key: "editor.hasDocument" }, { key: "editor.isDirty" }]
    };

    expect(
      evaluateCommandEnablement(expression, {
        "editor.hasDocument": true,
        "editor.isDirty": true
      })
    ).toBe(true);
    expect(
      evaluateCommandEnablement(expression, {
        "editor.hasDocument": true,
        "editor.isDirty": false
      })
    ).toBe(false);
  });

  it("requires at least one child to be true for anyOf", () => {
    const expression: CommandEnablementExpression = {
      anyOf: [{ key: "editor.kind.markdown" }, { key: "editor.kind.glossary" }]
    };

    expect(
      evaluateCommandEnablement(expression, {
        "editor.kind.markdown": false,
        "editor.kind.glossary": true
      })
    ).toBe(true);
    expect(
      evaluateCommandEnablement(expression, {
        "editor.kind.markdown": false,
        "editor.kind.glossary": false
      })
    ).toBe(false);
  });

  it("evaluates nested expressions", () => {
    const expression: CommandEnablementExpression = {
      allOf: [
        { key: "project.isOpen" },
        { not: { key: "editor.kind.glossary" } },
        {
          anyOf: [{ key: "editor.isDirty" }, { key: "editor.hasDocument" }]
        }
      ]
    };

    expect(
      evaluateCommandEnablement(expression, {
        "project.isOpen": true,
        "editor.kind.glossary": false,
        "editor.isDirty": false,
        "editor.hasDocument": true
      })
    ).toBe(true);
    expect(
      evaluateCommandEnablement(expression, {
        "project.isOpen": true,
        "editor.kind.glossary": true,
        "editor.isDirty": false,
        "editor.hasDocument": true
      })
    ).toBe(false);
  });

  it("reports readOnlyProject only when read-only access blocks project writes", () => {
    expect(
      evaluateCommandEnablementResult(
        { key: "project.access.readWrite" },
        {
          "project.access.readWrite": false,
          "project.access.readOnly": true
        }
      )
    ).toEqual({
      enabled: false,
      disabledReason: "readOnlyProject"
    });
    expect(
      evaluateCommandEnablementResult(
        { key: "editor.isDirty" },
        {
          "editor.isDirty": false,
          "project.access.readOnly": true
        }
      )
    ).toEqual({
      enabled: false,
      disabledReason: null
    });
  });

  it("keeps read-only reason behind ordinary allOf prerequisites", () => {
    const expression: CommandEnablementExpression = {
      allOf: [
        { key: "editor.hasDocument" },
        { key: "project.access.readWrite" }
      ]
    };

    expect(
      evaluateCommandEnablementResult(expression, {
        "editor.hasDocument": false,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: false,
      disabledReason: null
    });
  });

  it("propagates read-only reason through anyOf when no safe alternative is enabled", () => {
    const expression: CommandEnablementExpression = {
      anyOf: [
        { not: { key: "editor.document.projectOwned" } },
        { key: "project.access.readWrite" }
      ]
    };

    expect(
      evaluateCommandEnablementResult(expression, {
        "editor.document.projectOwned": true,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: false,
      disabledReason: "readOnlyProject"
    });
    expect(
      evaluateCommandEnablementResult(expression, {
        "editor.document.projectOwned": false,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: true,
      disabledReason: null
    });
  });
});

describe("validateCommandEnablementExpression", () => {
  it("accepts a valid key expression", () => {
    expect(() =>
      validateCommandEnablementExpression({ key: "project.isOpen" })
    ).not.toThrow();
  });

  it("accepts valid not/allOf/anyOf expressions", () => {
    expect(() =>
      validateCommandEnablementExpression({
        not: { key: "project.isOpen" }
      })
    ).not.toThrow();
    expect(() =>
      validateCommandEnablementExpression({
        allOf: [{ key: "project.isOpen" }, { key: "editor.isDirty" }]
      })
    ).not.toThrow();
    expect(() =>
      validateCommandEnablementExpression({
        anyOf: [{ key: "project.isOpen" }, { key: "editor.isDirty" }]
      })
    ).not.toThrow();
  });

  it("rejects an unknown expression shape", () => {
    expect(() =>
      validateCommandEnablementExpression(
        { equals: ["editor.kind", "markdown"] } as unknown as CommandEnablementExpression
      )
    ).toThrow(InvalidCommandEnablementExpressionError);
  });

  it("rejects an unknown operator alongside a valid one", () => {
    expect(() =>
      validateCommandEnablementExpression(
        {
          key: "project.isOpen",
          extra: true
        } as unknown as CommandEnablementExpression
      )
    ).toThrow(InvalidCommandEnablementExpressionError);
  });

  it("rejects an invalid key type", () => {
    expect(() =>
      validateCommandEnablementExpression(
        { key: 123 } as unknown as CommandEnablementExpression
      )
    ).toThrow(InvalidCommandEnablementExpressionError);
  });

  it("rejects a key outside the known built-in context key set", () => {
    expect(() =>
      validateCommandEnablementExpression(
        { key: "plugin.custom.key" } as unknown as CommandEnablementExpression
      )
    ).toThrow(InvalidCommandEnablementExpressionError);
  });

  it("rejects an empty allOf", () => {
    expect(() =>
      validateCommandEnablementExpression({ allOf: [] })
    ).toThrow(InvalidCommandEnablementExpressionError);
  });

  it("rejects an empty anyOf", () => {
    expect(() =>
      validateCommandEnablementExpression({ anyOf: [] })
    ).toThrow(InvalidCommandEnablementExpressionError);
  });

  it("rejects an unsupported nested structure", () => {
    expect(() =>
      validateCommandEnablementExpression({
        allOf: [{ key: "project.isOpen" }, { bogus: true } as unknown as CommandEnablementExpression]
      })
    ).toThrow(InvalidCommandEnablementExpressionError);
  });
});
