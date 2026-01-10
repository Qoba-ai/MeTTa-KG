import { Component, JSX } from "solid-js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/Card";

interface CommandCardProps {
  title: string;
  description: string;
  children: JSX.Element;
}

export const CommandCard: Component<CommandCardProps> = (props) => {
  return (
    <Card class="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">{props.children}</CardContent>
    </Card>
  );
};
