import { ExploreDetail } from "~/lib/types";
import { parseSExpression, serializeSExpr } from "./utils";
import { formatedNamespace } from "~/lib/state";

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
function filterParentExpression(
  data: ExploreResponse[],
  parentExpr?: string
): ExploreResponse[] {
  if (!parentExpr) return data;
  const result: ExploreResponse[] = [];
  for (const item of data) {
    if (item.expr !== parentExpr) {
      result.push(item);
    }
  }
  return result;
}

function processTokens(
  data: ExploreResponse[]
): { token: Uint8Array; expr: string }[] {
  const result: { token: Uint8Array; expr: string }[] = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = {
      token: new Uint8Array(data[i].token),
      expr: data[i].expr,
    };
  }
  return result;
}

function unwrapExpressions(
  data: { token: Uint8Array; expr: string }[],
  namespaceComponents: string[],
  dataTagPattern: string
): { token: Uint8Array; expr: string }[] {
  const result: { token: Uint8Array; expr: string }[] = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    let expr = item.expr;
    // Short-circuit: Skip parsing if expr doesn't start with '(', indicating no list
    if (!expr.startsWith("(")) {
      result[i] = { ...item, expr };
      continue;
    }
    try {
      const parsed = parseSExpression(expr);
      if (parsed.type !== "list" || !parsed.children) {
        result[i] = { ...item, expr };
        continue;
      }

      let current = parsed;
      let changed = false;

      // Unwrap namespace layers (reuse current, short-circuit)
      for (const component of ["__root__", ...namespaceComponents]) {
        if (
          current.type === "list" &&
          Array.isArray(current.children) &&
          current.children.length > 1 &&
          current.children[0].type === "atom" &&
          current.children[0].value === component &&
          current.children[1].type === "list"
        ) {
          current = current.children[1];
          changed = true;
        } else {
          break;
        }
      }

      if (
        current.type === "list" &&
        Array.isArray(current.children) &&
        current.children.length > 1 &&
        current.children[0].type === "atom" &&
        current.children[0].value?.includes(dataTagPattern) &&
        current.children[1].type === "list"
      ) {
        current = current.children[1];
        changed = true;
      }

      if (changed) {
        expr = serializeSExpr(current);
      }
      result[i] = { ...item, expr };
    } catch {
      result[i] = { ...item, expr };
    }
  }
  return result;
}

function deduplicateData(
  data: { token: Uint8Array; expr: string }[]
): { token: Uint8Array; expr: string }[] {
  const uniqueMap = new Map<string, { token: Uint8Array; expr: string }>();
  for (const item of data) {
    const tokenKey = Array.from(item.token).join(",");
    const key = `${item.expr}|||${tokenKey}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }
  return Array.from(uniqueMap.values());
}

function processLabels(data: { token: Uint8Array; expr: string }[]): {
  tokens: string[];
  labels: (string | null)[];
  prefix: string[];
} {
  const { prefix, labels: rawLabels } = extractLabels(data);
  const tokens: string[] = new Array(data.length);
  const processedLabels: (string | null)[] = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    tokens[i] = tokenToString(data[i].token);
    const label = rawLabels[i];
    if (!label) {
      processedLabels[i] = null;
    } else if (typeof label === "string") {
      processedLabels[i] = label.replace(/^["']|["']$/g, "");
    } else {
      processedLabels[i] = String(label);
    }
  }
  return { tokens, labels: processedLabels, prefix };
}

function createNodes(
  tokens: string[],
  labels: (string | null)[],
  data: { token: Uint8Array; expr: string }[]
): SpaceNode[] {
  const nodes = [];
  for (let i = 0; i < tokens.length; i++) {
    const label = labels[i];
    if (label !== null) {
      nodes.push(initNode(tokens[i], label, data[i]));
    }
  }
  return nodes;
}

function initNodesFromApiResponse(
  data: ExploreResponse[],
  parentExpr?: string
): { nodes: SpaceNode[]; prefix: string[] } {
  const filteredData = filterParentExpression(data, parentExpr);
  const processedData = processTokens(filteredData);

  const currentNamespace = formatedNamespace();
  const namespaceComponents = currentNamespace
    .split("/")
    .filter((part) => part.length > 0);
  const currentName =
    namespaceComponents[namespaceComponents.length - 1] || "__root__";
  let dataTagPattern = "";
  if (currentName === "__root__") {
    dataTagPattern = "__rootdata__";
  } else {
    dataTagPattern = `__${currentName}data__`;
  }

  const unwrappedData = unwrapExpressions(
    processedData,
    namespaceComponents,
    dataTagPattern
  );
  const dedupedData = deduplicateData(unwrappedData);
  const { tokens, labels, prefix } = processLabels(dedupedData);
  const nodes = createNodes(tokens, labels, dedupedData);

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
        convertToD3TreeData,
      });
    });
  }

  return root;
}

export type { ExploreResponse, SpaceNode };

export { initNodesFromApiResponse, convertToD3TreeData };
