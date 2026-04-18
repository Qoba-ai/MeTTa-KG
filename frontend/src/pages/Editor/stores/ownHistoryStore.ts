/**
 * Store for the current user's operation history.
 *
 * Owns:
 *   - the filtered list of the user's own OpLogEntries (desc order)
 *   - the per-user undo / redo target IDs
 *   - loading / busy flags
 *
 * The component feeds in a `token` getter so the store can make
 * authenticated requests without needing direct access to component state.
 */

import { createStore, produce } from 'solid-js/store'
import { onCleanup } from 'solid-js'
import { OpLogEntry } from '../../../types'
import { BACKEND_URL } from '../../../urls'
import { wsService } from '../../../websocket'

// ─── State shape ──────────────────────────────────────────────────────────────

export interface OwnHistoryState {
    entries: OpLogEntry[]      // user's own ops, newest-first
    undoTargetId: number | null
    redoTargetId: number | null
    loading: boolean
    busy: boolean
}

const initialState: OwnHistoryState = {
    entries: [],
    undoTargetId: null,
    redoTargetId: null,
    loading: false,
    busy: false,
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the own-history store together with its action functions.
 *
 * `getTokenCode` is a getter (e.g. `() => token()?.code`) supplied by the
 * component so the store doesn't couple to component state directly.
 */
export function createOwnHistoryStore(getTokenCode: () => string | undefined) {
    const [state, setState] = createStore<OwnHistoryState>(initialState)

    // ── Helpers ───────────────────────────────────────────────────────────────

    function authHeader(): HeadersInit | null {
        const code = getTokenCode()
        return code ? { Authorization: code } : null
    }

    // ── Targets ───────────────────────────────────────────────────────────────

    async function refreshTargets() {
        const headers = authHeader()
        if (!headers) return
        try {
            const [undoRes, redoRes] = await Promise.all([
                fetch(`${BACKEND_URL}/logs/my-last-undoable`, { headers }),
                fetch(`${BACKEND_URL}/logs/my-last-redoable`, { headers }),
            ])
            setState('undoTargetId', undoRes.ok ? (await undoRes.json() as OpLogEntry).id : null)
            setState('redoTargetId', redoRes.ok ? (await redoRes.json() as OpLogEntry).id : null)
        } catch {
            setState('undoTargetId', null)
            setState('redoTargetId', null)
        }
    }

    // ── Fetch ─────────────────────────────────────────────────────────────────

    /** Reload all entries from the server and refresh undo/redo targets. */
    async function fetch_() {
        const headers = authHeader()
        if (!headers) return
        setState('loading', true)
        try {
            const res = await fetch(`${BACKEND_URL}/logs?page_size=50`, { headers })
            if (res.ok) {
                const all: OpLogEntry[] = await res.json()
                // Store all entries; the component filters by token_id since
                // the store doesn't hold the numeric token id — only the code.
                setState('entries', all)
                await refreshTargets()
            }
        } catch {
            // ignore
        } finally {
            setState('loading', false)
        }
    }

    // ── Patch entries in-place after rollback / redo ──────────────────────────

    function applyUpdated(updated: OpLogEntry[]) {
        setState(produce((s) => {
            for (const u of updated) {
                const idx = s.entries.findIndex(e => e.id === u.id)
                if (idx !== -1) s.entries[idx] = u
            }
        }))
    }

    // ── Rollback ──────────────────────────────────────────────────────────────

    /**
     * Roll back the operation with the given id.
     * `onSpaceChanged` is called when the space content should be refreshed.
     */
    async function rollback(id: number, onSpaceChanged: () => void) {
        const headers = authHeader()
        if (!headers || state.busy) return
        setState('busy', true)
        try {
            const res = await fetch(`${BACKEND_URL}/logs/${id}/rollback`, {
                method: 'POST',
                headers,
            })
            if (res.ok) {
                applyUpdated(await res.json())
                onSpaceChanged()
                await refreshTargets()
            } else {
                throw new Error(`HTTP ${res.status}`)
            }
        } finally {
            setState('busy', false)
        }
    }

    // ── Redo ──────────────────────────────────────────────────────────────────

    /**
     * Redo the operation with the given id.
     *
     * Returns `{ conflict: true, opIds: number[] }` when the server responds
     * with 409 — the caller is responsible for showing the confirmation UI.
     * On success returns `{ conflict: false }`.
     */
    async function redo(
        id: number,
        onSpaceChanged: () => void,
        force = false,
    ): Promise<{ conflict: false } | { conflict: true; opIds: number[] }> {
        const headers = authHeader()
        if (!headers || state.busy) return { conflict: false }
        setState('busy', true)
        try {
            const url = force
                ? `${BACKEND_URL}/logs/${id}/redo?force=true`
                : `${BACKEND_URL}/logs/${id}/redo`
            const res = await fetch(url, { method: 'POST', headers })
            if (res.ok) {
                applyUpdated(await res.json())
                onSpaceChanged()
                await refreshTargets()
                return { conflict: false }
            }
            if (res.status === 409) {
                const body = await res.json()
                return { conflict: true, opIds: body.conflicting_ops ?? [] }
            }
            throw new Error(`HTTP ${res.status}`)
        } finally {
            setState('busy', false)
        }
    }

    // ── Reset (on logout / token change) ──────────────────────────────────────

    function reset() {
        setState({ ...initialState, entries: [] })
    }

    // ── WebSocket subscription ────────────────────────────────────────────────

    // When the server emits an OpLogChanged event for our token, upsert the
    // incoming entries into the store so the UI updates without a full refetch.
    const unsubscribe = wsService.onOpLogChanged((event) => {
        setState(produce((s) => {
            for (const incoming of event.entries) {
                const idx = s.entries.findIndex(e => e.id === incoming.id)
                if (idx !== -1) {
                    s.entries[idx] = incoming
                } else {
                    // New op: insert in descending-id order
                    const insertAt = s.entries.findIndex(e => e.id < incoming.id)
                    if (insertAt === -1) {
                        s.entries.push(incoming)
                    } else {
                        s.entries.splice(insertAt, 0, incoming)
                    }
                }
            }
        }))
        // Refresh undo/redo targets since reachability may have changed
        void refreshTargets()
    })

    // Clean up the WS listener when the owning reactive scope is disposed
    onCleanup(unsubscribe)

    return { state, fetch: fetch_, rollback, redo, refreshTargets, reset } as const
}

export type OwnHistoryStore = ReturnType<typeof createOwnHistoryStore>
