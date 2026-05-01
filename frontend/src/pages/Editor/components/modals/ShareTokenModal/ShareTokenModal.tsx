import { Component, createSignal, Show } from 'solid-js'
import styles from './ShareTokenModal.module.scss'
import commonStyles from '../../../../../styles/Common.module.scss'
import { BACKEND_URL } from '../../../../../urls'
import { AiOutlineCopy, AiOutlineCheckCircle } from 'solid-icons/ai'

interface ShareTokenModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void)
  namespace: () => string
  rootTokenCode: () => string | null
  onClose: () => void
}

export const ShareTokenModal: Component<ShareTokenModalProps> = (props) => {
  const [name, setName] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [read, setRead] = createSignal(true)
  const [write, setWrite] = createSignal(false)
  const [shareRead, setShareRead] = createSignal(false)
  const [shareWrite, setShareWrite] = createSignal(false)
  const [createdCode, setCreatedCode] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const reset = () => {
    setName('')
    setDescription('')
    setRead(true)
    setWrite(false)
    setShareRead(false)
    setShareWrite(false)
    setCreatedCode(null)
    setError(null)
    setCopied(false)
  }

  const handleClose = () => {
    reset()
    props.onClose()
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const code = props.rootTokenCode()
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      const resp = await fetch(`${BACKEND_URL}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: code },
        body: JSON.stringify({
          id: 0,
          code: '',
          name: name(),
          description: description(),
          namespace: props.namespace(),
          creation_timestamp: new Date().toISOString().split('Z')[0],
          permission_read: read(),
          permission_write: write(),
          permission_share_read: shareRead(),
          permission_share_write: shareWrite(),
          permission_share_share: false,
          parent: 0,
        }),
      })
      if (!resp.ok) throw new Error(`Status ${resp.status}`)
      const token = await resp.json()
      setCreatedCode(token.code)
    } catch {
      setError('Failed to create token.')
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = () => {
    const code = createdCode()
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <dialog ref={props.ref}>
      <Show
        when={!createdCode()}
        fallback={
          <div class={styles.Success}>
            <div class={styles.SuccessHeader}>
              <AiOutlineCheckCircle size={20} />
              <span>Token Created</span>
            </div>
            <p class={styles.SuccessDesc}>
              Share this token to grant access to <code>{props.namespace()}</code>.
            </p>
            <div class={styles.CodeBlock}>
              <div class={styles.CodeLabel}>Access token</div>
              <div class={styles.CodeRow}>
                <code class={styles.TokenCode}>{createdCode()}</code>
                <button
                  class={`${styles.CopyBtn} ${copied() ? styles.CopyBtnDone : ''}`}
                  type="button"
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  <AiOutlineCopy size={15} />
                  {copied() ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div class={commonStyles.ModalButtonBar}>
              <div class={commonStyles.Spacer} />
              <button class={commonStyles.Button} type="button" onClick={handleClose}>Done</button>
            </div>
          </div>
        }
      >
        <form onsubmit={handleSubmit}>
          <button type="button" autofocus style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;padding:0;border:0;" />
          <h2>Share Access</h2>
          <div class={styles.FieldGroup}>
            <label>Namespace</label>
            <div class={styles.NamespaceFixed}>{props.namespace()}</div>
          </div>
          <div class={styles.FieldGroup}>
            <label>Name</label>
            <input
              type="text"
              required
              minlength={3}
              maxlength={32}
              placeholder="Token name (3-32 chars)"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div class={styles.FieldGroup}>
            <label>Description</label>
            <input
              type="text"
              placeholder="Description (optional)"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
          <div class={styles.PermissionsRow}>
            <label>
              <input
                type="checkbox"
                checked={read()}
                onChange={(e) => {
                  setRead(e.currentTarget.checked)
                  if (!e.currentTarget.checked) {
                    setWrite(false)
                    setShareRead(false)
                    setShareWrite(false)
                  }
                }}
              />
              Read
            </label>
            <label>
              <input
                type="checkbox"
                checked={write()}
                onChange={(e) => {
                  setWrite(e.currentTarget.checked)
                  if (e.currentTarget.checked) setRead(true)
                  else setShareWrite(false)
                }}
              />
              Write
            </label>
            <label>
              <input
                type="checkbox"
                checked={shareRead()}
                onChange={(e) => {
                  setShareRead(e.currentTarget.checked)
                  if (e.currentTarget.checked) setRead(true)
                  else setShareWrite(false)
                }}
              />
              Share read
            </label>
            <label>
              <input
                type="checkbox"
                checked={shareWrite()}
                onChange={(e) => {
                  setShareWrite(e.currentTarget.checked)
                  if (e.currentTarget.checked) {
                    setRead(true)
                    setWrite(true)
                    setShareRead(true)
                  }
                }}
              />
              Share write
            </label>
          </div>
          <Show when={!read()}>
            <p class={styles.Warning}>Token has no permissions!</p>
          </Show>
          <Show when={error()}>
            <p class={styles.Error}>{error()}</p>
          </Show>
          <div class={commonStyles.ModalButtonBar}>
            <button type="button" class={commonStyles.TextButton} onClick={handleClose}>
              Cancel
            </button>
            <div class={commonStyles.Spacer} />
            <button
              class={commonStyles.Button}
              type="submit"
              disabled={busy() || name().length < 3}
            >
              {busy() ? 'Creating…' : 'Create Token'}
            </button>
          </div>
        </form>
      </Show>
    </dialog>
  )
}
