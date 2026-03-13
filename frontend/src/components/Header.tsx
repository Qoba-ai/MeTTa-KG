import { Component, JSX } from "solid-js";
import { A } from "@solidjs/router";
import { AiOutlineGithub } from "solid-icons/ai";
import { VsSettings } from "solid-icons/vs";
import styles from "../Editor.module.scss";

interface HeaderProps {
  title?: string;
  children?: JSX.Element;
}

export const Header: Component<HeaderProps> = (props) => {
  return (
    <header>
      <h1>{props.title || "MeTTa KG"}</h1>
      <nav>
        {props.children || (
          <>
            <A href="/settings" class={styles.IconButton} title="Settings">
              <VsSettings size={24} />
            </A>
            <A href="/tokens" class={styles.OutlineButton}>
              Tokens
            </A>
            <a href="https://github.com/Qoba-ai/MeTTa-KG" target="_blank" rel="noopener noreferrer" class="github-link">
              <AiOutlineGithub size={32} />
            </a>
          </>
        )}
      </nav>
    </header>
  );
};
