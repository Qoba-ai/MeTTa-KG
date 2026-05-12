import {
    batch,
    Component,
    createEffect,
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
} from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { VsRefresh } from 'solid-icons/vs';
import { Compartment, EditorState } from '@codemirror/state';
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { drawSelection, EditorView } from '@codemirror/view';
import { getEditorTheme, highlightStyle, languageSupport } from '../Editor/extensions/mettaLanguageSupport';
import styles from './Logs.module.scss';
import commonStyles from '../../styles/Common.module.scss';
import { Navbar } from '../../components/Navbar/Navbar';
import { useTheme } from '../../ThemeContext';
import { BACKEND_URL } from '../../urls';

const PAGE_SIZE_STEPS = [25, 50, 100, 250, 500, 1000];
const snapPageSize = (v: number) => PAGE_SIZE_STEPS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);

interface LogsPage {
    namespace: string;
    metta_expressions: string[];
    subspaces: [string, string][];
    focus_token: string | null;
}

interface TabPaginationState {
    tokenHistory: string[];
    currentPage: number;
    refetchTrigger: number;
}

interface LogTab {
    id: string;
    pattern: string;
    levelFilter: string;
    state: TabPaginationState;
}

const fetchLogs = async (params: {
    focus_token: string;
    page_size: number;
    pattern: string;
    _t: number;
}): Promise<LogsPage> => {
    const token = localStorage.getItem('rootToken');
    const resp = await fetch(
        `${BACKEND_URL}/server-logs?focus_token=${encodeURIComponent(params.focus_token)}&page_size=${params.page_size}&pattern=${encodeURIComponent(params.pattern)}`,
        { headers: { ...(token ? { Authorization: token } : {}) } },
    );
    if (resp.status === 401 || resp.status === 403) {
        throw new Error('Access denied. Admin token required.');
    }
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${resp.status}`);
    }
    return resp.json();
};

const filterLines = (lines: string[], level: string): string => {
    if (level === 'ALL') return lines.join('\n');
    return lines.filter(line => line.startsWith(`(log ${level} `)).join('\n');
};

const tabLabel = (pattern: string) => {
    if (pattern === '$') return 'All Logs';
    return pattern.length > 18 ? pattern.slice(0, 16) + '…' : pattern;
};

const freshState = (): TabPaginationState => ({ tokenHistory: [''], currentPage: 0, refetchTrigger: 0 });

let _nextTabId = 2;

const Logs: Component = () => {
    const { theme } = useTheme();
    const [pageSize, setPageSize] = createSignal(
        snapPageSize(parseInt(localStorage.getItem('logsPageSize') || '100', 10))
    );

    const [tabs, setTabs] = createStore<LogTab[]>([
        { id: '1', pattern: '$', levelFilter: 'ALL', state: freshState() },
    ]);
    const [activeTabId, setActiveTabId] = createSignal('1');

    const activeTab = () => tabs.find(t => t.id === activeTabId());
    const activeTabIdx = () => tabs.findIndex(t => t.id === activeTabId());

    // Draft for the pattern input — syncs when switching tabs
    const [patternDraft, setPatternDraft] = createSignal('$');
    createEffect(() => {
        const tab = activeTab();
        if (tab) setPatternDraft(tab.pattern);
    });

    const commitPattern = () => {
        const newPattern = patternDraft().trim() || '$';
        const idx = activeTabIdx();
        if (idx === -1 || tabs[idx].pattern === newPattern) return;
        setTabs(idx, 'pattern', newPattern);
        setTabs(idx, 'state', freshState());
    };

    const addTab = () => {
        const id = String(_nextTabId++);
        setTabs(produce(ts => {
            ts.push({ id, pattern: '$', levelFilter: 'ALL', state: freshState() });
        }));
        setActiveTabId(id);
    };

    const closeTab = (id: string) => {
        if (tabs.length <= 1) return;
        const idx = tabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        const newActiveId = activeTabId() === id
            ? (tabs[idx > 0 ? idx - 1 : 1]?.id)
            : undefined;
        batch(() => {
            setTabs(produce(ts => { ts.splice(idx, 1); }));
            if (newActiveId) setActiveTabId(newActiveId);
        });
    };

    const changePageSize = (newSize: number) => {
        const idx = activeTabIdx();
        batch(() => {
            setPageSize(newSize);
            if (idx !== -1) setTabs(idx, 'state', freshState());
        });
        localStorage.setItem('logsPageSize', String(newSize));
    };

    const [logsData] = createResource(
        () => {
            const tab = activeTab();
            if (!tab) return false as const;
            return {
                focus_token: tab.state.tokenHistory[tab.state.currentPage] ?? '',
                page_size: pageSize(),
                pattern: tab.pattern,
                _t: tab.state.refetchTrigger,
            };
        },
        fetchLogs,
    );

    const filteredText = () => filterLines(
        logsData()?.metta_expressions ?? [],
        activeTab()?.levelFilter ?? 'ALL',
    );

    const hasNext = () => !!logsData()?.focus_token;
    const hasPrev = () => (activeTab()?.state.currentPage ?? 0) > 0;

    const goNext = () => {
        const nextToken = logsData()?.focus_token;
        if (!nextToken) return;
        const idx = activeTabIdx();
        if (idx === -1) return;
        const page = tabs[idx].state.currentPage;
        setTabs(idx, 'state', 'tokenHistory', h => [...h.slice(0, page + 1), nextToken]);
        setTabs(idx, 'state', 'currentPage', p => p + 1);
    };

    const goPrev = () => {
        const idx = activeTabIdx();
        if (idx !== -1 && tabs[idx].state.currentPage > 0) {
            setTabs(idx, 'state', 'currentPage', p => p - 1);
        }
    };

    const refresh = () => {
        const idx = activeTabIdx();
        if (idx !== -1) {
            setTabs(idx, 'state', { ...freshState(), refetchTrigger: tabs[idx].state.refetchTrigger + 1 });
        }
    };

    let editorContainer: HTMLDivElement | undefined;
    let view: EditorView | undefined;
    const themeCompartment = new Compartment();

    onMount(() => {
        view = new EditorView({
            state: EditorState.create({
                doc: '',
                extensions: [
                    EditorState.readOnly.of(true),
                    themeCompartment.of(getEditorTheme(theme() === 'dark')),
                    languageSupport,
                    drawSelection(),
                    bracketMatching(),
                    syntaxHighlighting(highlightStyle),
                    EditorView.lineWrapping,
                ],
            }),
            parent: editorContainer!,
        });
    });

    onCleanup(() => view?.destroy());

    createEffect(() => {
        const content = filteredText();
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    });

    createEffect(() => {
        const isDark = theme() === 'dark';
        view?.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(isDark)) });
    });

    return (
        <div class={styles.MainLayout}>
            <Navbar title="MeTTa KG - Logs" currentPage="logs" />

            <div class={styles.TabBar}>
                <For each={tabs}>{(tab) =>
                    <button
                        class={`${styles.Tab} ${activeTabId() === tab.id ? styles.TabActive : ''}`}
                        onClick={() => setActiveTabId(tab.id)}
                        title={tab.pattern}
                    >
                        <span>{tabLabel(tab.pattern)}</span>
                        <Show when={tabs.length > 1}>
                            <span
                                class={styles.TabClose}
                                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                                aria-label="Close tab"
                            >×</span>
                        </Show>
                    </button>
                }</For>
                <button class={styles.TabAdd} onClick={addTab} title="New tab" aria-label="New tab">+</button>
            </div>

            <main class={styles.Main}>
                <div class={styles.Toolbar}>
                    <input
                        class={styles.PatternInput}
                        type="text"
                        value={patternDraft()}
                        onInput={e => setPatternDraft(e.currentTarget.value)}
                        onBlur={commitPattern}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        placeholder="Pattern, e.g. $ or (log ERROR $)"
                        title="MORK pattern — substituted into (logs <pattern>)"
                        spellcheck={false}
                    />
                    <select
                        class={styles.FilterSelect}
                        value={activeTab()?.levelFilter ?? 'ALL'}
                        onchange={e => {
                            const idx = activeTabIdx();
                            if (idx !== -1) setTabs(idx, 'levelFilter', e.currentTarget.value);
                        }}
                    >
                        <option value="ALL">All levels</option>
                        <option value="ERROR">ERROR</option>
                        <option value="WARN">WARN</option>
                        <option value="INFO">INFO</option>
                        <option value="DEBUG">DEBUG</option>
                        <option value="TRACE">TRACE</option>
                    </select>
                    <button
                        class={commonStyles.IconButton}
                        onclick={refresh}
                        title="Refresh"
                        disabled={logsData.loading}
                    >
                        <VsRefresh size={18} />
                    </button>
                    <div class={styles.PageControl} title="Entries per page">
                        <button
                            class={styles.PageButton}
                            disabled={PAGE_SIZE_STEPS.indexOf(pageSize()) <= 0}
                            onClick={() => changePageSize(PAGE_SIZE_STEPS[Math.max(0, PAGE_SIZE_STEPS.indexOf(pageSize()) - 1)])}
                            aria-label="Decrease page size"
                        >−</button>
                        <span class={styles.PageLabel}>{pageSize()}/page</span>
                        <button
                            class={styles.PageButton}
                            disabled={PAGE_SIZE_STEPS.indexOf(pageSize()) >= PAGE_SIZE_STEPS.length - 1}
                            onClick={() => changePageSize(PAGE_SIZE_STEPS[Math.min(PAGE_SIZE_STEPS.length - 1, PAGE_SIZE_STEPS.indexOf(pageSize()) + 1)])}
                            aria-label="Increase page size"
                        >+</button>
                    </div>
                    <div class={styles.PageControl}>
                        <button
                            class={styles.PageButton}
                            disabled={!hasPrev()}
                            onClick={goPrev}
                            title="Previous page"
                        >←</button>
                        <span class={styles.PageLabel}>
                            Page {(activeTab()?.state.currentPage ?? 0) + 1}
                        </span>
                        <button
                            class={styles.PageButton}
                            disabled={logsData.loading || !hasNext()}
                            onClick={goNext}
                            title="Next page"
                        >→</button>
                    </div>
                    <Show when={logsData.error}>
                        <span style={{ color: 'var(--love)', 'font-size': '0.875rem' }}>
                            {String(logsData.error)}
                        </span>
                    </Show>
                    <Show when={!logsData.loading && !logsData.error}>
                        <span style={{ color: 'var(--subtle)', 'font-size': '0.8rem' }}>
                            {filteredText().split('\n').filter(Boolean).length} entries
                        </span>
                    </Show>
                </div>
                <div class={styles.EditorWrapper} ref={editorContainer} />
            </main>
        </div>
    );
};

export default Logs;
