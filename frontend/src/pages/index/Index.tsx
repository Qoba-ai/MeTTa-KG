import { Route, Router } from "@solidjs/router";
import { createSignal, For } from "solid-js";
import LoadPage from "../load/Load";
import UploadPage from "../upload/Upload";
import TransformPage from "../transform/Transform";
import ExportPage from "../export/Export";
import TokensPage from "../tokens/Tokens";
import ClearPage from "../clear/Clear";
import Sidebar from "~/pages/index/components/Sidebar";
import Header from "~/pages/index/components/Header";
import Upload from "lucide-solid/icons/upload";
import Database from "lucide-solid/icons/database";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Download from "lucide-solid/icons/download";
import Key from "lucide-solid/icons/key";
import NotImplemented from "~/components/common/NotImplemented";
import Trash2 from "lucide-solid/icons/trash-2";

const sidebarSections = [
  {
    title: "Inspection and Visualization",
    items: [
      {
        id: "explore",
        label: "Explore",
        icon: Database,
        to: "/",
        component: LoadPage,
      },
      {
        id: "clear",
        label: "Clear",
        icon: Trash2,
        to: "/clear",
        component: ClearPage,
      },
    ],
  },
  {
    title: "Set and Algebraic Operations",
    items: [
      {
        id: "transform",
        label: "Transform",
        icon: RotateCcw,
        to: "/transform",
        component: TransformPage,
      },
      {
        id: "union",
        label: "Union",
        icon: () => <span class="text-xl">∪</span>,
        to: "/union",
      },
      {
        id: "intersection",
        label: "Intersection",
        icon: () => <span class="text-xl">∩</span>,
        to: "/intersection",
      },
      {
        id: "difference",
        label: "Difference",
        icon: () => <span class="text-xl font-bold">∖</span>,
        to: "/difference",
      },
      {
        id: "restrict",
        label: "Restrict",
        icon: () => <span class="text-xl font-bold">◁</span>,
        to: "/restrict",
      },
      {
        id: "decapitate",
        label: "Decapitate",
        icon: () => <span class="text-xl">T</span>,
        to: "/decapitate",
      },
      {
        id: "head",
        label: "Head",
        icon: () => <span class="text-xl">H</span>,
        to: "/head",
      },
      {
        id: "cartesian",
        label: "Cartesian",
        icon: () => <span class="text-xl">X</span>,
        to: "/cartesian",
      },
    ],
  },
  {
    title: "Utility",
    items: [
      {
        id: "upload",
        label: "Import",
        icon: Upload,
        to: "/upload",
        component: UploadPage,
      },
      {
        id: "export",
        label: "Export",
        icon: Download,
        to: "/export",
        component: ExportPage,
      },
      {
        id: "tokens",
        label: "Tokens",
        icon: Key,
        to: "/tokens",
        component: TokensPage,
      },
    ],
  },
];

const AppLayout = (
  props: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => {
  const [activeTab, setActiveTab] = createSignal("explore");

  return (
    <div class="w-full h-screen flex ">
      <div class="flex h-full">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sidebarSections={sidebarSections}
        />
      </div>

      <div class="w-full h-full flex flex-col">
        {/* <div class="flex items-center justify-between w-full h-14 shadow-lg shadow-[hsla(var(--secondary-foreground)/0.05)]">
                    <div class="flex items-center">
                        <span class={`text-3xl font-bold text-[hsla(var(--secondary-foreground)/0.7)] ml-10`}>MeTTa-KG</span>
                        <div class="ml-24">
                            <NameSpace />
                        </div>
                    </div>
                </div> */}
        <Header />

        <div class="flex-1 w-full pl-4 pt-2 overflow-y-scroll">
          {props.children}
        </div>
      </div>
    </div>
  );
};

const NotImplementedWrapper = (name: string) => () => (
  <NotImplemented name={name} />
);

const App = () => {
  return (
    <div class="flex">
      <div class="flex-1 flex flex-col">
        <Router>
          <Route path="*" component={AppLayout}>
            <For each={sidebarSections}>
              {(section) => (
                <For each={section.items}>
                  {(item) => (
                    <Route
                      path={item.to}
                      component={
                        item.component || NotImplementedWrapper(item.label)
                      }
                    />
                  )}
                </For>
              )}
            </For>
          </Route>
        </Router>
      </div>
    </div>
  );
};

export default App;
