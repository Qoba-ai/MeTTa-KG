import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { VsSettings } from 'solid-icons/vs'
import styles from './Settings.module.scss'
import commonStyles from '../../styles/Common.module.scss'
import { useTheme } from '../../ThemeContext'
import { schemes } from '../../themes'
import { Navbar } from '../../components/Navbar/Navbar'

const Settings: Component = () => {
    const { theme, setTheme, scheme, setScheme } = useTheme()

    return (
        <div class={styles.MainLayout}>
            <Navbar title="MeTTa KG - Settings" currentPage="settings" />
            <main class={styles.Main} style={{ "flex-direction": "column", "align-items": "center", "justify-content": "start", "padding": "80px 20px 40px", "overflow-y": "auto" }}>
                <div class={styles.EditorWrapper} style={{
                    "max-width": "900px",
                    "width": "100%",
                    "padding": "clamp(20px, 5vw, 40px)",
                    "height": "auto",
                    "min-height": "auto",
                    "align-items": "stretch",
                    "justify-content": "start",
                    "box-shadow": "0px 2px 8px rgba(0, 0, 0, 0.1), 0px 8px 24px rgba(0, 0, 0, 0.08)",
                    "border": "1px solid var(--highlight-med)",
                    "border-radius": "12px",
                    "overflow": "visible"
                }}>
                    <h2 style={{ "margin-bottom": "32px", "display": "flex", "align-items": "center", "gap": "12px", "border-bottom": "1px solid var(--highlight-low)", "padding-bottom": "16px" }}>
                        <VsSettings size={28} />
                        User Preferences
                    </h2>

                    <div style={{ "width": "100%", "display": "flex", "flex-direction": "column", "gap": "40px" }}>
                        <section>
                            <h3 style={{ "margin-bottom": "16px", "color": "var(--gold)" }}>System Theme</h3>
                            <p style={{ "margin-bottom": "16px", "font-size": "0.9rem", "color": "var(--subtle)" }}>
                                Choose between Light and Dark modes. Some colour schemes might override these settings.
                            </p>
                            <div style={{ "display": "flex", "gap": "16px" }}>
                                <button
                                    class={theme() === 'dark' ? commonStyles.Button : commonStyles.OutlineButton}
                                    onclick={() => setTheme('dark')}
                                    style={{ "flex": "1", "padding": "12px" }}
                                >
                                    Dark Mode
                                </button>
                                <button
                                    class={theme() === 'light' ? commonStyles.Button : commonStyles.OutlineButton}
                                    onclick={() => setTheme('light')}
                                    style={{ "flex": "1", "padding": "12px" }}
                                >
                                    Light Mode
                                </button>
                            </div>
                        </section>

                        <section>
                            <h3 style={{ "margin-bottom": "8px", "color": "var(--gold)" }}>Colour Scheme</h3>
                            <p style={{ "margin-bottom": "20px", "font-size": "0.9rem", "color": "var(--subtle)" }}>
                                Select a palette from the <a href="https://github.com/tinted-theming/schemes" target="_blank" style={{ "color": "var(--foam)" }}>tinted-theming</a> collection.
                            </p>
                            <div style={{
                                "display": "grid",
                                "grid-template-columns": "repeat(auto-fill, minmax(160px, 1fr))",
                                "gap": "12px",
                                "padding": "8px",
                                "border": "1px solid var(--highlight-low)",
                                "border-radius": "8px",
                                "background": "var(--base)"
                            }}>
                                <For each={Object.entries(schemes)}>
                                    {([id, s]) => (
                                        <button
                                            class={scheme() === id ? commonStyles.Button : commonStyles.OutlineButton}
                                            onclick={() => setScheme(id)}
                                            style={{
                                                "font-size": "0.85rem",
                                                "padding": "12px 8px",
                                                "text-align": "center",
                                                "background": scheme() === id ? "var(--love)" : "var(--surface)",
                                                "color": scheme() === id ? "var(--text)" : "var(--text)",
                                                "border-color": scheme() === id ? "var(--love)" : "var(--highlight-high)",
                                                "white-space": "nowrap",
                                                "overflow": "hidden",
                                                "text-overflow": "ellipsis"
                                            }}
                                            title={s.author}
                                        >
                                            {s.name}
                                        </button>
                                    )}
                                </For>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    )
}

export default Settings
