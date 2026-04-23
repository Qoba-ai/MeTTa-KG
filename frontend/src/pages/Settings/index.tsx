import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { VsSettings } from 'solid-icons/vs'
import styles from './Settings.module.scss'
import commonStyles from '../../styles/Common.module.scss'
import { useTheme } from '../../ThemeContext'
import { themes } from '../../themes'
import { Navbar } from '../../components/Navbar/Navbar'

const Settings: Component = () => {
    const { themeId, variantId, setThemeId, setVariantId } = useTheme()

    const currentVariants = () => Object.entries(themes[themeId()]?.variants ?? {})

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
                            <h3 style={{ "margin-bottom": "8px", "color": "var(--gold)" }}>Colour Theme</h3>
                            <p style={{ "margin-bottom": "20px", "font-size": "0.9rem", "color": "var(--subtle)" }}>
                                Choose a colour theme family.
                            </p>
                            <div style={{
                                "display": "grid",
                                "grid-template-columns": "repeat(auto-fill, minmax(160px, 1fr))",
                                "gap": "12px",
                                "padding": "8px",
                                "border": "1px solid var(--highlight-low)",
                                "border-radius": "8px",
                            }}>
                                <For each={Object.entries(themes)}>
                                    {([id, t]) => (
                                        <button
                                            class={themeId() === id ? commonStyles.Button : commonStyles.OutlineButton}
                                            onclick={() => setThemeId(id)}
                                            style={{
                                                "font-size": "0.85rem",
                                                "padding": "12px 8px",
                                                "text-align": "center",
                                                "white-space": "nowrap",
                                                "overflow": "hidden",
                                                "text-overflow": "ellipsis"
                                            }}
                                        >
                                            {t.name}
                                        </button>
                                    )}
                                </For>
                            </div>
                        </section>

                        <Show when={currentVariants().length > 1}>
                            <section>
                                <h3 style={{ "margin-bottom": "8px", "color": "var(--gold)" }}>Variant</h3>
                                <p style={{ "margin-bottom": "20px", "font-size": "0.9rem", "color": "var(--subtle)" }}>
                                    Choose a variant of <strong>{themes[themeId()]?.name}</strong>.
                                </p>
                                <div style={{
                                    "display": "grid",
                                    "grid-template-columns": "repeat(auto-fill, minmax(140px, 1fr))",
                                    "gap": "12px",
                                    "padding": "8px",
                                    "border": "1px solid var(--highlight-low)",
                                    "border-radius": "8px",
                                }}>
                                    <For each={currentVariants()}>
                                        {([id, v]) => (
                                            <button
                                                class={variantId() === id ? commonStyles.Button : commonStyles.OutlineButton}
                                                onclick={() => setVariantId(id)}
                                                style={{
                                                    "font-size": "0.85rem",
                                                    "padding": "12px 8px",
                                                    "text-align": "center",
                                                    "white-space": "nowrap",
                                                    "overflow": "hidden",
                                                    "text-overflow": "ellipsis"
                                                }}
                                            >
                                                {v.name}
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </section>
                        </Show>

                    </div>
                </div>
            </main>
        </div>
    )
}

export default Settings
