import { describe, it, expect } from "vitest";
import { parseTransformExpression } from "../utils/s-expression";

describe("S-Expression Parser", () => {
  describe("parseTransformExpression", () => {
    it("should correctly parse a valid transform expression", () => {
      const sExpr = `(transform 
        (, (A $x) (B $y)) 
        (, (C $x $y)))`;
      const result = parseTransformExpression(sExpr);
      expect(result).toEqual({
        patterns: ["(A $x)", "(B $y)"],
        templates: ["(C $x $y)"],
      });
    });

    it("should handle empty patterns or templates list", () => {
      const sExpr = `(transform (, ) (, (template)))`;
      const result = parseTransformExpression(sExpr);
      expect(result).toEqual({
        patterns: [],
        templates: ["(template)"],
      });
    });

    it("should handle complex nested expressions", () => {
      const sExpr = `(transform 
        (, (: (Concept "human") $x)) 
        (, (human.fn $x)))`;
      const result = parseTransformExpression(sExpr);
      expect(result).toEqual({
        patterns: ['(: (Concept "human") $x)'],
        templates: ["(human.fn $x)"],
      });
    });

    it("should throw an error for malformed expressions without transform", () => {
      const sExpr = `(something-else (, a) (, b))`;
      expect(() => parseTransformExpression(sExpr)).toThrow(
        "Expected transform expression"
      );
    });

    it("should throw an error for expressions missing comma lists", () => {
      const sExpr = `(transform (a b) (c d))`;
      expect(() => parseTransformExpression(sExpr)).toThrow(
        "Expected transform expression"
      );
    });

    it("should throw an error for expressions with incorrect structure", () => {
      const sExpr = `(transform (, a))`;
      expect(() => parseTransformExpression(sExpr)).toThrow(
        "Expected transform expression"
      );
    });
  });
});
