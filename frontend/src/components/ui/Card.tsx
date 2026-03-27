import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

const Card: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "rounded-lg glass-card text-[#e2e8f0] overflow-hidden",
        local.class
      )}
      {...others}
    />
  );
};

const CardHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex flex-col space-y-1 p-5 pb-4 border-b", local.class)}
      style={{ "border-color": "rgba(0,212,255,0.08)" }}
      {...others}
    />
  );
};

const CardTitle: Component<ComponentProps<"h3">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <h3
      class={cn("text-sm font-semibold tracking-widest uppercase", local.class)}
      style={{ color: "#00d4ff" }}
      {...others}
    />
  );
};

const CardDescription: Component<ComponentProps<"p">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <p
      class={cn("text-xs mt-1", local.class)}
      style={{ color: "#8892a4" }}
      {...others}
    />
  );
};

const CardContent: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn("p-5", local.class)} {...others} />;
};

const CardFooter: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div class={cn("flex items-center p-5 pt-0", local.class)} {...others} />
  );
};

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
