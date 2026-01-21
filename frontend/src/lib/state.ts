import { createMemo, createSignal, createRoot } from "solid-js";

const [rootToken, _setRootToken] = createSignal<string | null>(
  localStorage.getItem("rootToken")
);

export interface NamespaceTab {
  id: string;
  namespace: string[];
  label: string;
}

const storedNamespace = localStorage.getItem("tokenNamespace");
const initialNamespace = storedNamespace ? JSON.parse(storedNamespace) : [""];

const [tokenRootNamespace, setTokenRootNamespace] =
  createSignal<string[]>(initialNamespace);

const [forceUpdate, setForceUpdate] = createSignal(0);

const [tabs, setTabs] = createSignal<NamespaceTab[]>([
  {
    id: "default",
    namespace: initialNamespace,
    label:
      initialNamespace.length <= 1
        ? "Root"
        : initialNamespace.slice(-1)[0] || "Root",
  },
]);
const [activeTabId, _setActiveTabId] = createSignal("default");

const setActiveTabId = (id: string) => {
  _setActiveTabId(id);
  setForceUpdate((prev) => prev + 1);
};

const [namespace] = createRoot(() => {
  const memo = createMemo(() => {
    forceUpdate();
    const activeTab = tabs().find((tab) => tab.id === activeTabId());
    return activeTab?.namespace || [""];
  });

  return [memo];
});

export {
  rootToken,
  tokenRootNamespace,
  namespace,
  tabs,
  activeTabId,
  setTokenRootNamespace,
  setTabs,
  setActiveTabId,
};

export const setRootToken = (token: string | null) => {
  localStorage.setItem("rootToken", token ?? "");
  _setRootToken(token);

  if (!token) {
    localStorage.removeItem("tokenNamespace");
    setTokenRootNamespace([""]);
    setTabs([
      {
        id: "default",
        namespace: [""],
        label: "Root",
      },
    ]);
    setActiveTabId("default");
  }
};

export const addTab = (namespace: string[], label?: string) => {
  const id = `tab-${Date.now()}`;

  const validNamespace =
    namespace.length > 0 ? namespace : tokenRootNamespace();

  let tabLabel: string;

  if (label) {
    tabLabel = label;
  } else if (validNamespace.length > 1) {
    const nonEmptyParts = validNamespace.filter((part) => part !== "");
    tabLabel =
      nonEmptyParts.length > 0
        ? nonEmptyParts[nonEmptyParts.length - 1]
        : "Root";
  } else {
    tabLabel = "Root";
  }

  setTabs((prev) => [
    ...prev,
    {
      id,
      namespace: validNamespace,
      label: tabLabel,
    },
  ]);

  setTimeout(() => setActiveTabId(id), 0);

  return id;
};

export const closeTab = (tabId: string) => {
  setTabs((prev) => {
    const filtered = prev.filter((tab) => tab.id !== tabId);
    if (filtered.length === 0) {
      return [
        {
          id: "default",
          namespace: [""],
          label: "Root",
        },
      ];
    }
    return filtered;
  });

  if (activeTabId() === tabId) {
    const remainingTabs = tabs().filter((tab) => tab.id !== tabId);
    if (remainingTabs.length > 0) {
      setActiveTabId(remainingTabs[0].id);
    } else {
      setActiveTabId("default");
    }
  }
};

export const updateTabNamespace = (tabId: string, namespace: string[]) => {
  setTabs((prev) =>
    prev.map((tab) => {
      if (tab.id === tabId) {
        let tabLabel: string;

        if (namespace.length > 1) {
          const nonEmptyParts = namespace.filter((part) => part !== "");
          tabLabel =
            nonEmptyParts.length > 0
              ? nonEmptyParts[nonEmptyParts.length - 1]
              : "Root";
        } else {
          tabLabel = "Root";
        }

        return {
          ...tab,
          namespace,
          label: tabLabel,
        };
      }
      return tab;
    })
  );
};

export const setNamespace = (namespace: string[]) => {
  const currentTabId = activeTabId();
  updateTabNamespace(currentTabId, namespace);
};

export const formatedNamespace = createRoot(() =>
  createMemo(() => {
    const ns = namespace();
    if (ns.length <= 1) return "/";
    return ns.join("/");
  })
);
