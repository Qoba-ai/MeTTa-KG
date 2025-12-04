import { describe, it, expect } from "vitest";
import { parseTransformExpression, quoteFromBytes, cn } from "../utils";

describe("Utility Functions Tests", () => {
  describe("cn (className utility)", () => {
    it("should merge class names correctly", () => {
      const result = cn("px-4", "py-2", "bg-blue-500");
      expect(result).toBe("px-4 py-2 bg-blue-500");
    });

    it("should handle conditional classes", () => {
      const isHidden = false;
      const result = cn("base-class", isHidden && "hidden", "visible");
      expect(result).toBe("base-class visible");
    });

    it("should merge conflicting Tailwind classes", () => {
      const result = cn("px-4", "px-8");
      expect(result).toBe("px-8");
    });

    it("should handle empty inputs", () => {
      const result = cn();
      expect(result).toBe("");
    });
  });

  describe("parseTransformExpression", () => {
    it("should parse a valid transform expression with single pattern and template", () => {
      const input = "(transform (, $x) (, $x))";
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: ["$x"],
        templates: ["$x"],
      });
    });

    it("should parse transform expression with multiple patterns and templates", () => {
      const input = "(transform (, (A $x) (B $y)) (, (C $x) (D $y)))";
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: ["(A $x)", "(B $y)"],
        templates: ["(C $x)", "(D $y)"],
      });
    });

    it("should parse transform expression with nested S-expressions", () => {
      const input = "(transform (, (parent $x $y)) (, (child $x (nested $y))))";
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: ["(parent $x $y)"],
        templates: ["(child $x (nested $y))"],
      });
    });

    it("should handle transform expression with whitespace", () => {
      const input = `(transform   
        (, $x)  
        (, $x)  
      )`;
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: ["$x"],
        templates: ["$x"],
      });
    });

    it("should parse transform with quoted strings", () => {
      const input = '(transform (, "hello world") (, "goodbye world"))';
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: ['"hello world"'],
        templates: ['"goodbye world"'],
      });
    });

    it("should parse transform with escaped quotes in strings", () => {
      const input = '(transform (, "say \\"hello\\"") (, "say \\"goodbye\\""))';
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: ['"say \\"hello\\""'],
        templates: ['"say \\"goodbye\\""'],
      });
    });

    it("should throw error for invalid transform expression (missing transform keyword)", () => {
      const input = "(notransform (, $x) (, $x))";

      expect(() => parseTransformExpression(input)).toThrow(
        "Expected transform expression: (transform (, patterns...) (, templates...))"
      );
    });

    it("should throw error for invalid transform expression (wrong arity)", () => {
      const input = "(transform (, $x))";

      expect(() => parseTransformExpression(input)).toThrow(
        "Expected transform expression: (transform (, patterns...) (, templates...))"
      );
    });

    it("should throw error for invalid pattern list (missing comma)", () => {
      const input = "(transform (no-comma $x) (, $x))";

      expect(() => parseTransformExpression(input)).toThrow(
        "Expected transform expression: (transform (, patterns...) (, templates...))"
      );
    });

    it("should throw error for invalid template list (missing comma)", () => {
      const input = "(transform (, $x) (no-comma $x))";

      expect(() => parseTransformExpression(input)).toThrow(
        "Expected transform expression: (transform (, patterns...) (, templates...))"
      );
    });

    it("should throw error for malformed S-expression", () => {
      const input = "(transform (, $x) (, $x";

      expect(() => parseTransformExpression(input)).toThrow(
        "Unbalanced parentheses: missing closing ')'"
      );
    });

    it("should throw error for empty input", () => {
      const input = "";

      expect(() => parseTransformExpression(input)).toThrow(
        "Failed to parse S-expression"
      );
    });

    it("should handle complex nested patterns", () => {
      const input =
        "(transform (, (= (fact 0) 1) (= (fact $n) (* $n (fact (- $n 1))))) (, (factorial 0 1) (factorial $n (* $n (factorial (- $n 1))))))";
      const result = parseTransformExpression(input);

      expect(result.patterns).toHaveLength(2);
      expect(result.templates).toHaveLength(2);
      expect(result.patterns[0]).toBe("(= (fact 0) 1)");
      expect(result.patterns[1]).toBe("(= (fact $n) (* $n (fact (- $n 1))))");
    });

    it("should handle empty comma lists", () => {
      const input = "(transform (,) (,))";
      const result = parseTransformExpression(input);

      expect(result).toEqual({
        patterns: [],
        templates: [],
      });
    });

    it("should preserve atom values exactly", () => {
      const input = "(transform (, $var_name_123) (, $var_name_123))";
      const result = parseTransformExpression(input);

      expect(result.patterns[0]).toBe("$var_name_123");
      expect(result.templates[0]).toBe("$var_name_123");
    });
  });

  describe("quoteFromBytes", () => {
    it("should encode alphanumeric characters without modification", () => {
      const input = Uint8Array.from([65, 66, 67, 97, 98, 99, 48, 49, 50]); // ABCabc012
      const result = quoteFromBytes(input);

      expect(result).toBe("ABCabc012");
    });

    it("should encode safe characters (-_.~) without modification", () => {
      const input = Uint8Array.from([45, 95, 46, 126]); // -_.~
      const result = quoteFromBytes(input);

      expect(result).toBe("-_.~");
    });

    it("should percent-encode space character", () => {
      const input = Uint8Array.from([32]); // space
      const result = quoteFromBytes(input);

      expect(result).toBe("%20");
    });

    it("should percent-encode special characters", () => {
      const input = Uint8Array.from([33, 64, 35, 36, 37]); // !@#$%
      const result = quoteFromBytes(input);

      expect(result).toBe("%21%40%23%24%25");
    });

    it("should percent-encode parentheses", () => {
      const input = Uint8Array.from([40, 41]); // ()
      const result = quoteFromBytes(input);

      expect(result).toBe("%28%29");
    });

    it("should handle empty Uint8Array", () => {
      const input = new Uint8Array([]);
      const result = quoteFromBytes(input);

      expect(result).toBe("");
    });

    it("should handle mixed safe and unsafe characters", () => {
      const input = Uint8Array.from([
        72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100,
      ]); // "Hello World"
      const result = quoteFromBytes(input);

      expect(result).toBe("Hello%20World");
    });

    it("should encode navigation token bytes correctly", () => {
      const input = Uint8Array.from([1, 2, 3, 4]);
      const result = quoteFromBytes(input);

      expect(result).toBe("%01%02%03%04");
    });

    it("should handle high byte values (>127)", () => {
      const input = Uint8Array.from([255, 254, 253]);
      const result = quoteFromBytes(input);

      expect(result).toBe("%FF%FE%FD");
    });

    it("should encode null byte", () => {
      const input = Uint8Array.from([0]);
      const result = quoteFromBytes(input);

      expect(result).toBe("%00");
    });

    it("should handle complex token with mixed bytes", () => {
      const input = Uint8Array.from([65, 0, 66, 255, 67]); // A, null, B, 255, C
      const result = quoteFromBytes(input);

      expect(result).toBe("A%00B%FFC");
    });

    it("should match URL encoding for forward slash", () => {
      const input = Uint8Array.from([47]); // /
      const result = quoteFromBytes(input);

      expect(result).toBe("%2F");
    });

    it("should match URL encoding for pipe character", () => {
      const input = Uint8Array.from([124]); // |
      const result = quoteFromBytes(input);

      expect(result).toBe("%7C");
    });

    it("should handle array input by converting to Uint8Array", () => {
      const input = Uint8Array.from([1, 2, 3, 4]);
      const result = quoteFromBytes(input);

      expect(result).toBe("%01%02%03%04");
    });
  });
});
