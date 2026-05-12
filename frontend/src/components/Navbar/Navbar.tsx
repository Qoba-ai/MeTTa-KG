import { Component, createSignal, onMount, onCleanup, Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { AiOutlineGithub } from 'solid-icons/ai';
import { VsSignOut } from 'solid-icons/vs';
import styles from './Navbar.module.scss';
import commonStyles from '../../styles/Common.module.scss';
import { wsService } from '../../websocket';
import { notify } from '../../notify';
import { Token } from '../../types';
import { BACKEND_URL } from '../../urls';

interface NavbarProps {
    title?: string;
    currentPage: 'editor' | 'tokens' | 'settings' | 'history' | 'logs';
}

const fetchToken = async (tokenCode: string | null): Promise<Token | null> => {
    if (!tokenCode) return null;

    try {
        const resp = await fetch(`${BACKEND_URL}/tokens/me`, {
            headers: { 'Content-Type': 'application/json', Authorization: tokenCode },
        });
        return await resp.json();
    } catch (e) {
        console.error('Failed to fetch token:', e);
        return null;
    }
};

export const Navbar: Component<NavbarProps> = (props) => {
    const [online, setOnline] = createSignal(false);
    const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
        localStorage.getItem('rootToken')
    );

    const [tokenData] = createResource(rootTokenCode, fetchToken);

    const handleLogout = () => {
        setRootTokenCode(null);
        localStorage.removeItem('rootToken');
        notify.success('Logged out successfully');
        // Reload to clear any cached data
        window.location.reload();
    };

    onMount(() => {
        wsService.connectPing();
        const unsub = wsService.onOnlineChange(setOnline);
        onCleanup(unsub);
    });

    return (
        <header>
            <h1>{props.title || "MeTTa KG"}</h1>
            <nav>
                <Show when={rootTokenCode()}>
                    <div class={commonStyles.AuthSection}>
                        <div
                            class={styles.ConnectedTokenBadge}
                            title={(() => {
                                const token = tokenData();
                                return `Click to copy token\n${token ? `Read: ${token.permission_read ? '✓' : '✗'} | Write: ${token.permission_write ? '✓' : '✗'} | Share Read: ${token.permission_share_read ? '✓' : '✗'} | Share Write: ${token.permission_share_write ? '✓' : '✗'}` : ''}`;
                            })()}
                            onclick={() => {
                                if (rootTokenCode()) {
                                    navigator.clipboard.writeText(rootTokenCode()!);
                                    notify.success('Token copied to clipboard');
                                }
                            }}
                            style={{ cursor: "pointer" }}
                        >
                            <span class={styles.BadgeLabel}>Connected</span>
                            <span class={styles.BadgeToken}>{rootTokenCode()?.substring(0, 8)}...</span>
                            <Show when={tokenData()}>
                                {(token) => (
                                    <>
                                        <span class={styles.BadgeNamespace}>{token().namespace}</span>
                                        <div class={styles.BadgePermissions}>
                                            <span title="Read" class={token().permission_read ? styles.PermissionEnabled : styles.PermissionDisabled}>R</span>
                                            <span title="Write" class={token().permission_write ? styles.PermissionEnabled : styles.PermissionDisabled}>W</span>
                                            <span title="Share Read" class={token().permission_share_read ? styles.PermissionEnabled : styles.PermissionDisabled}>SR</span>
                                            <span title="Share Write" class={token().permission_share_write ? styles.PermissionEnabled : styles.PermissionDisabled}>SW</span>
                                        </div>
                                    </>
                                )}
                            </Show>
                        </div>
                        <button
                            class={styles.LogoutButton}
                            onclick={handleLogout}
                            title="Clear token"
                        >
                            <VsSignOut size={18} />
                        </button>
                    </div>
                    <div class={commonStyles.NavDivider}></div>
                </Show>
                <div class={commonStyles.NavLinks}>
                    <A
                        href="/"
                        class={styles.TextButton}
                        style={props.currentPage === 'editor' ? { "background": "var(--highlight-med)", "font-weight": "600" } : {}}
                    >
                        Editor
                    </A>
                    <A
                        href="/tokens"
                        class={styles.TextButton}
                        style={props.currentPage === 'tokens' ? { "background": "var(--highlight-med)", "font-weight": "600" } : {}}
                    >
                        Tokens
                    </A>
                    <A
                        href="/history"
                        class={styles.TextButton}
                        style={props.currentPage === 'history' ? { "background": "var(--highlight-med)", "font-weight": "600" } : {}}
                    >
                        History
                    </A>
                    <Show when={tokenData()?.permission_share_share}>
                        <A
                            href="/logs"
                            class={styles.TextButton}
                            style={props.currentPage === 'logs' ? { "background": "var(--highlight-med)", "font-weight": "600" } : {}}
                        >
                            Logs
                        </A>
                    </Show>
                    <A
                        href="/settings"
                        class={styles.TextButton}
                        style={props.currentPage === 'settings' ? { "background": "var(--highlight-med)", "font-weight": "600" } : {}}
                    >
                        Settings
                    </A>
                </div>
                <div class={commonStyles.NavDivider}></div>
                <div
                    class={styles.OnlineIndicator}
                    classList={{ [styles.OnlineIndicatorOnline]: online() }}
                    title={online() ? "Connected" : "Disconnected"}
                />
                <a href="https://github.com/Qoba-ai/MeTTa-KG" target="_blank" rel="noopener noreferrer" class="github-link">
                    <AiOutlineGithub class={styles.Icon} size={32} />
                </a>
            </nav>
        </header>
    );
};
