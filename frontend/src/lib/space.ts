import { ExploreDetail } from "~/lib/types";
import parse from "s-expression";

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

      if (cleaned.length > 50) {
        const parts = cleaned.split("-");
        if (parts.length > 1 && parts[0].length > 0) {
          return parts[0] + "...";
        }
        return cleaned.substring(0, 20) + "...";
      }

      return cleaned;
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

function flattenNodes(
  parsed: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
): string[] {
  const nodes: string[] = [];

  function traverse(
    item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
  ) {
    if (Array.isArray(item)) {
      item.forEach(traverse);
    } else if (item instanceof String) {
      nodes.push(`'${item}'`);
    } else if (typeof item === "string") {
      nodes.push(item);
    }
  }

  traverse(parsed);
  return nodes;
}

function filterSemanticNodes(nodes: string[]): string[] {
  const semanticNodes: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (isEncodingArtifact(node)) {
      continue;
    }

    semanticNodes.push(node);
  }

  return semanticNodes;
}

function isEncodingArtifact(node: string): boolean {
  if (node.length > 20 && /^[a-z0-9]+[a-f0-9-]+$/i.test(node)) {
    return true;
  }
  return false;
}

function extractLabels(
  details: ExploreDetail[],
  _parent?: string
): { prefix: string[]; labels: (string | null)[] } {
  if (details.length === 0) return { prefix: [], labels: [] };

  const flatExprs = details.map((detail) => {
    try {
      const nodes = flattenNodes(parse(detail.expr));
      const semantic = filterSemanticNodes(nodes);
      return semantic;
    } catch {
      return [detail.expr]; // Fallback to raw expression
    }
  });

  const maxLength = Math.max(...flatExprs.map((arr) => arr.length));
  const prefix: string[] = [];

  for (let i = 0; i < maxLength; i++) {
    const column = flatExprs.map((arr) => arr[i] || null);

    if (column.every((val) => val === column[0] && val !== null)) {
      prefix.push(column[0]!);
    } else {
      const cleanedLabels = column.map((label) => {
        if (!label) return null;
        if (typeof label === "string") {
          return label.replace(/^["']|["']$/g, "");
        }
        return label;
      });
      return { prefix, labels: cleanedLabels };
    }
  }

  if (flatExprs.length > 0 && flatExprs[0].length > 0) {
    const lastElements = flatExprs.map((expr) => {
      const lastElement = expr[expr.length - 1];
      if (typeof lastElement === "string") {
        return lastElement.replace(/^["']|["']$/g, "");
      }
      return lastElement;
    });
    return { prefix: flatExprs[0].slice(0, -1), labels: lastElements };
  }

  return { prefix, labels: [] };
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

export { initNodesFromApiResponse, flattenNodes, convertToD3TreeData };
