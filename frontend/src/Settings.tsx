import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { A } from '@solidjs/router'
import { AiOutlineGithub, AiOutlineArrowLeft } from 'solid-icons/ai'
import { VsColorMode, VsSettings } from 'solid-icons/vs'
import styles from './Editor.module.scss'
import { useTheme } from './ThemeContext'
import { schemes } from './themes'
import { Header } from './components/Header'

const Settings: Component = () => {
    const { theme, setTheme, scheme, setScheme } = useTheme()

    return (
        <div class={styles.MainLayout}>
            <Header title="MeTTa KG - Settings">
                <A href="/" class={styles.OutlineButton}>
                    <AiOutlineArrowLeft size={18} style={{ "margin-right": "8px" }} />
                    Back to Editor
                </A>
                <a href="https://github.com/Qoba-ai/MeTTa-KG" target="_blank" rel="noopener noreferrer">
                    <AiOutlineGithub class={styles.Icon} size={32} />
                </a>
            </Header>
            <main class={styles.Main} style={{ "flex-direction": "column", "align-items": "center", "justify-content": "start", "padding-top": "60px" }}>
                <div class={styles.EditorWrapper} style={{ 
                    "max-width": "800px", 
                    "padding": "40px", 
                    "height": "auto", 
                    "min-height": "auto",
                    "align-items": "stretch",
                    "justify-content": "start",
                    "box-shadow": "0px 8px 10px -5px rgba(0, 0, 0, 0.2), 0px 16px 24px 2px rgba(0, 0, 0, 0.14), 0px 6px 30px 5px rgba(0, 0, 0, 0.12)"
                }}>
                    <h2 style={{ "margin-bottom": "32px", "display": "flex", "align-items": "center", "gap": "12px", "border-bottom": "1px solid var(--rp-highlight-low)", "padding-bottom": "16px" }}>
                        <VsSettings size={28} />
                        User Preferences
                    </h2>

                    <div style={{ "width": "100%", "display": "flex", "flex-direction": "column", "gap": "40px" }}>
                        <section>
                            <h3 style={{ "margin-bottom": "16px", "color": "var(--rp-gold)" }}>System Theme</h3>
                            <p style={{ "margin-bottom": "16px", "font-size": "0.9rem", "color": "var(--rp-subtle)" }}>
                                Choose between Light and Dark modes. Some colour schemes might override these settings.
                            </p>
                            <div style={{ "display": "flex", "gap": "16px" }}>
                                <button 
                                    class={theme() === 'dark' ? styles.Button : styles.OutlineButton}
                                    onclick={() => setTheme('dark')}
                                    style={{ "flex": "1", "padding": "12px" }}
                                >
                                    Dark Mode
                                </button>
                                <button 
                                    class={theme() === 'light' ? styles.Button : styles.OutlineButton}
                                    onclick={() => setTheme('light')}
                                    style={{ "flex": "1", "padding": "12px" }}
                                >
                                    Light Mode
                                </button>
                            </div>
                        </section>

                        <section>
                            <h3 style={{ "margin-bottom": "8px", "color": "var(--rp-gold)" }}>Colour Scheme</h3>
                            <p style={{ "margin-bottom": "20px", "font-size": "0.9rem", "color": "var(--rp-subtle)" }}>
                                Select a palette from the <a href="https://github.com/tinted-theming/schemes" target="_blank" style={{ "color": "var(--rp-foam)" }}>tinted-theming</a> collection.
                            </p>
                            <div style={{ 
                                "display": "grid", 
                                "grid-template-columns": "repeat(auto-fill, minmax(180px, 1fr))", 
                                "gap": "16px",
                                "max-height": "400px",
                                "overflow-y": "auto",
                                "padding": "4px"
                            }}>
                                <For each={Object.entries(schemes)}>
                                    {([id, s]) => (
                                        <button 
                                            class={scheme() === id ? styles.Button : styles.OutlineButton}
                                            onclick={() => setScheme(id)}
                                            style={{ 
                                                "font-size": "0.85rem",
                                                "padding": "12px 8px",
                                                "text-align": "center",
                                                "background": scheme() === id ? "var(--rp-love)" : "var(--rp-surface)",
                                                "color": scheme() === id ? "var(--rp-text)" : "var(--rp-text)",
                                                "border-color": scheme() === id ? "var(--rp-love)" : "var(--rp-highlight-high)",
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
