import { ExploreDetail } from "~/lib/types";
import { parseSExpression, serializeSExpr } from "./utils";

interface SpaceNode {
  id: string;
  label: string;
  remoteData: { expr: string; token: Uint8Array };
}

interface ExploreResponse {
  token: number[]; // Backend sends as number array
  expr: string;
}

function initNode(
  id: string,
  label: string,
  remoteData: { expr: string; token: Uint8Array }
): SpaceNode {
  return {
    id,
    label,
    remoteData,
  };
}

function initNodesFromApiResponse(
  data: ExploreResponse[],
  _parentLabel?: string
): { nodes: SpaceNode[]; prefix: string[] } {
  const processedData = data.map((item) => ({
    token: new Uint8Array(item.token),
    expr: item.expr,
  }));

  const tokens = processedData.map((item) => tokenToString(item.token));
  const { prefix, labels } = extractLabels(processedData);

  const processedLabels = labels.map((item) => {
    if (!item) return null;

    if (typeof item === "string") {
      const cleaned = item.replace(/^["']|["']$/g, "");

      try {
        const expr = parseSExpression(cleaned);
        if (expr.type === "list" && expr.children) {
          if (expr.children.length === 0) {
            return "()";
          } else if (expr.children.length === 1) {
            return "()";
          } else if (
            expr.children[0].type === "atom" &&
            expr.children[0].value?.startsWith("root")
          ) {
            const newChildren = expr.children.slice(1);
            return newChildren.map((child) => serializeSExpr(child)).join(" ");
          } else {
            return cleaned;
          }
        } else {
          return "<malformed>";
        }
      } catch {
        return "<malformed>";
      }
    }

    return String(item);
  });

  const nodes = [];
  for (let i = 0; i < tokens.length; i++) {
    const label = processedLabels[i];
    if (label !== null) {
      nodes.push(initNode(tokens[i], label, processedData[i]));
    }
  }

  return { nodes, prefix };
}

function tokenToString(token: Uint8Array): string {
  if (token.length === 0) {
    return "-";
  } else {
    return token.join("-");
  }
}

function extractLabels(
  details: ExploreDetail[],
  _parent?: string
): { prefix: string[]; labels: (string | null)[] } {
  if (details.length === 0) return { prefix: [], labels: [] };

  // No parsing, use expr directly as labels
  const labels = details.map((detail) => detail.expr);

  return { prefix: [], labels };
}

interface D3TreeNode {
  name: string;
  id: string;
  token?: Uint8Array;
  expr?: string;
  isFromBackend?: boolean;
  isExpandable?: boolean;
  children: D3TreeNode[];
}

function convertToD3TreeData(
  data: { nodes: SpaceNode[]; prefix: string[] },
  pattern: string
): D3TreeNode {
  const root: D3TreeNode = {
    name: pattern || "root",
    id: "n:",
    children: [],
  };

  if (data.prefix.length > 0) {
    let currentLevel: D3TreeNode = root;
    let currentPath = "n:";

    for (const prefixPart of data.prefix) {
      currentPath += `/${prefixPart}`;
      const child: D3TreeNode = {
        name: prefixPart,
        id: currentPath,
        children: [],
      };
      currentLevel.children = [child];
      currentLevel = child;
    }

    data.nodes.forEach((node) => {
      const leafPath = `${currentPath}/${node.label}`;
      currentLevel.children.push({
        name: node.label,
        id: leafPath,
        token: node.remoteData.token,
        expr: node.remoteData.expr,
        isFromBackend: true,
        children: [],
      });
    });
  } else {
    data.nodes.forEach((node) => {
      const nodePath = `n:/${node.label}`;

      root.children.push({
        name: node.label,
        id: nodePath,
        token: node.remoteData.token,
        expr: node.remoteData.expr,
        isFromBackend: true,
        children: [],
      });
    });
  }

  return root;
}

export type { ExploreResponse, SpaceNode };

export { initNodesFromApiResponse, convertToD3TreeData };
