import { Component, JSX, createSignal, onMount, onCleanup } from "solid-js";
import { A } from "@solidjs/router";
import { AiOutlineGithub } from "solid-icons/ai";
import { VsSettings } from "solid-icons/vs";
import styles from "../Editor.module.scss";
import { wsService } from "../websocket";

interface HeaderProps {
  title?: string;
  children?: JSX.Element;
}

export const Header: Component<HeaderProps> = (props) => {
  const [online, setOnline] = createSignal(false);

  onMount(() => {
    wsService.connectPing();
    const unsub = wsService.onOnlineChange(setOnline);
    onCleanup(unsub);
  });

  return (
    <header>
      <h1>{props.title || "MeTTa KG"}</h1>
      <nav>
        {props.children || (
          <>
            <div
              class={styles.OnlineIndicator}
              classList={{ [styles.OnlineIndicatorOnline]: online() }}
              title={online() ? "Connected" : "Disconnected"}
            />
            <A href="/settings" class={styles.IconButton} title="Settings">
              <VsSettings size={24} />
            </A>
            <A href="/tokens" class={styles.OutlineButton}>
              Tokens
            </A>
            <a href="https://github.com/Qoba-ai/MeTTa-KG" target="_blank" rel="noopener noreferrer" class="github-link">
              <AiOutlineGithub class={styles.Icon} size={32} />
            </a>
          </>
        )}
      </nav>
    </header>
  );
};
