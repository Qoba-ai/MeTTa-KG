import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/////////////////////
// Transform Page //
///////////////////

export interface SExpr {
  type: "atom" | "list";
  value?: string;
  children?: SExpr[];
}

export interface ParseResult {
  patterns: string[];
  templates: string[];
}

// Tokenize the input s-expression into tokens
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '"' && (i === 0 || input[i - 1] !== "\\")) {
      inString = !inString;
      current += char;
    } else if (inString) {
      current += char;
    } else if (char === "(" || char === ")") {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
      tokens.push(char);
    } else if (/\s/.test(char)) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

// Parse tokens into an S-expression tree

function parseTokens(tokens: string[]): SExpr | null {
  let index = 0;

  function parseNext(): SExpr | null {
    if (index >= tokens.length) return null;
    const token = tokens[index++];

    if (token === "(") {
      const children: SExpr[] = [];
      while (index < tokens.length && tokens[index] !== ")") {
        const child = parseNext();
        if (child) children.push(child);
      }
      if (index < tokens.length && tokens[index] === ")") {
        index++; // consume ')'
      }
      return { type: "list", children };
    } else if (token !== ")") {
      return { type: "atom", value: token };
    }
    return null;
  }
  return parseNext();
}

function parseSExpression(input: string): SExpr {
  const tokens = tokenize(input);
  const result = parseTokens(tokens);
  if (!result) {
    throw new Error("Failed to parse S-expression");
  }
  return result;
}

// Check if an S-expression is a comma list: (, pattern1 pattern2 ...)

function isCommaList(expr: SExpr): boolean {
  return (
    expr.type === "list" &&
    !!expr.children &&
    expr.children.length >= 1 &&
    expr.children[0].type === "atom" &&
    expr.children[0].value === ","
  );
}

// Check if an S-expression is a transform expression: (transform (, patterns...) (, templates...))

function isTransformExpression(expr: SExpr): boolean {
  return (
    expr.type === "list" &&
    expr.children?.length === 3 &&
    expr.children[0].type === "atom" &&
    expr.children[0].value === "transform" &&
    isCommaList(expr.children[1]) &&
    isCommaList(expr.children[2])
  );
}

// Parse a comma list into an array of strings

function parseCommaList(expr: SExpr): string[] {
  if (!isCommaList(expr) || !expr.children) {
    throw new Error("Expected comma list format: (, item1 item2 ...)");
  }
  return expr.children.slice(1).map((child) => serializeSExpr(child));
}

function serializeSExpr(expr: SExpr): string {
  if (expr.type === "atom") {
    return expr.value!;
  }
  const childrenStr = expr.children!.map(serializeSExpr).join(" ");
  return `(${childrenStr})`;
}

// Main function to parse a transform expression string into patterns and templates

export function parseTransformExpression(sExpr: string): ParseResult {
  const cleaned = sExpr.trim();
  const expr = parseSExpression(cleaned);

  if (!isTransformExpression(expr) || !expr.children) {
    throw new Error(
      "Expected transform expression: (transform (, patterns...) (, templates...))"
    );
  }

  const patternsExpr = expr.children[1];
  const templatesExpr = expr.children[2];

  const patterns = parseCommaList(patternsExpr);
  const templates = parseCommaList(templatesExpr);

  return { patterns, templates };
}

////////////////
// Load Page //
//////////////

export function quoteFromBytes(data: Uint8Array): string {
  let result = "";

  for (let i = 0; i < data?.length; i++) {
    const byte = data[i];

    // Safe characters: alphanumeric and -_.~
    if (
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      byte === 0x2d ||
      byte === 0x5f || // - _
      byte === 0x2e ||
      byte === 0x7e
    ) {
      // . ~
      result += String.fromCharCode(byte);
    } else {
      // Percent-encode everything else
      result += "%" + byte.toString(16).padStart(2, "0").toUpperCase();
    }
  }

  return result;
}
