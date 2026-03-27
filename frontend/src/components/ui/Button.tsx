import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-wide transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0e1a] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#00d4ff] text-[#07091a] font-semibold hover:bg-[#00b8d9] shadow-[0_0_12px_rgba(0,212,255,0.3)] hover:shadow-[0_0_20px_rgba(0,212,255,0.5)]",
        destructive:
          "bg-red-600 text-white hover:bg-red-500 shadow-[0_0_12px_rgba(220,38,38,0.2)] hover:shadow-[0_0_20px_rgba(220,38,38,0.4)]",
        outline:
          "border border-[rgba(0,212,255,0.3)] text-[#8892a4] hover:text-[#00d4ff] hover:border-[rgba(0,212,255,0.6)] hover:bg-[rgba(0,212,255,0.04)] bg-transparent",
        secondary:
          "bg-[#111827] text-[#c4cfdf] hover:bg-[#1c2436] border border-[rgba(0,212,255,0.1)] hover:border-[rgba(0,212,255,0.2)]",
        ghost:
          "text-[#8892a4] hover:bg-[rgba(0,212,255,0.06)] hover:text-[#00d4ff]",
        link: "text-[#00d4ff] underline-offset-4 hover:underline hover:text-[#00b894]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded",
        lg: "h-11 px-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps<T extends ValidComponent = "button"> =
  ButtonPrimitive.ButtonRootProps<T> &
    VariantProps<typeof buttonVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

const Button = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ButtonProps, [
    "variant",
    "size",
    "class",
  ]);
  return (
    <ButtonPrimitive.Root
      class={cn(
        buttonVariants({ variant: local.variant, size: local.size }),
        local.class
      )}
      {...others}
    />
  );
};

export { Button, buttonVariants };
export type { ButtonProps };
