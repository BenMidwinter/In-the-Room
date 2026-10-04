import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { buildEditorExtensions, publishMergeContext } from '../lib/tiptapExtensions'
import { MERGE_FIELD_OPTIONS } from '../lib/mergeFields'
import { usePrompt } from './ui'
import {
  EDITOR_FONTS,
  EDITOR_TEXT_SIZES,
  EDITOR_TEXT_COLORS,
  EDITOR_COLOR_CHOICES,
  EDITOR_HIGHLIGHTS,
  EDITOR_HIGHLIGHT_CHOICES,
  WRITING_VOICES,
  filterSlashCommands,
  getSlashSnippet,
} from '../lib/editorFormatting'
import {
  IconUndo,
  IconRedo,
  IconBold,
  IconItalic,
  IconUnderline,
  IconBulletList,
  IconNumberList,
  IconLink,
  IconImage,
  IconTable,
  IconFormat,
} from './EditorToolbarIcons'
import SignatureMenu from './SignatureMenu'
import ErrorBoundary from './ErrorBoundary'

/** Chrome layout — theme editor tokens keep toolbar/canvas legible across themes. */
const EDITOR_ROOT =
  'doc-editor flex flex-col flex-1 min-h-0 overflow-hidden rounded-md border border-line bg-editor-chrome'
const EDITOR_TOOLBAR =
  'doc-editor__toolbar flex flex-wrap items-center gap-1 overflow-visible border-b border-line-light bg-editor-chrome px-3 py-1.5 sticky top-0 z-[5]'
const EDITOR_TOOLBAR_GROUP = 'doc-editor__toolbar-group flex items-center gap-0.5'
const EDITOR_BTN =
  'doc-editor__btn inline-flex min-h-[1.85rem] min-w-[1.85rem] items-center justify-center rounded border-0 bg-transparent px-1.5 text-[0.82rem] text-accent transition-colors hover:enabled:bg-primary/15 disabled:cursor-default disabled:opacity-35'
const EDITOR_BTN_ACTIVE = 'doc-editor__btn--active bg-primary/25 text-primary-dark'
const EDITOR_BTN_WIDE = 'doc-editor__btn--wide min-w-auto px-2 text-[0.78rem] font-semibold'
const EDITOR_DIVIDER = 'doc-editor__divider mx-1.5 h-[1.35rem] w-px bg-line'
const EDITOR_CANVAS =
  'doc-editor__canvas relative min-h-[480px] flex-1 overflow-y-auto bg-editor-canvas px-4 pt-6 pb-10'
const EDITOR_PAGE =
  'doc-editor__page mx-auto min-h-[640px] max-w-[min(100%,210mm)] rounded-sm border border-line-light bg-editor-sheet shadow-md'
const EDITOR_PAGE_SKELETON = 'doc-editor__page doc-editor__page--skeleton'

/** Full-width module — toolbar + writing surface, no nested paper/canvas chrome. */
const EDITOR_ROOT_IMMERSIVE =
  'doc-editor doc-editor--immersive flex w-full min-h-0 flex-1 flex-col overflow-hidden border-0 rounded-none bg-editor-sheet'
const EDITOR_TOOLBAR_IMMERSIVE =
  'doc-editor__toolbar flex w-full flex-wrap items-center gap-1 border-b border-line-light bg-editor-chrome px-[var(--space-inline)] py-1.5 sticky top-0 z-[5]'
const EDITOR_CANVAS_IMMERSIVE =
  'doc-editor__canvas relative min-h-0 flex-1 overflow-y-auto bg-editor-sheet'
const EDITOR_WRITE_IMMERSIVE =
  'doc-editor__write mx-auto w-full max-w-[min(100%,210mm)] px-[var(--space-inline)] py-8'

function ToolbarDivider() {
  return <span className={EDITOR_DIVIDER} aria-hidden />
}

function ToolbarButton({ onClick, active, disabled, children, title, wide, className = '' }) {
  return (
    <button
      type="button"
      className={`${EDITOR_BTN}${active ? ` ${EDITOR_BTN_ACTIVE}` : ''}${wide ? ` ${EDITOR_BTN_WIDE}` : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

function useCloseOnOutsideClick(open, ref, onClose) {
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, ref, onClose])
}

function MergeFieldMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  useCloseOnOutsideClick(open, menuRef, () => setOpen(false))

  return (
    <div className="doc-editor__menu" ref={menuRef}>
      <ToolbarButton onClick={() => setOpen(o => !o)} active={open} title="Insert field">
        {'{ }'}
      </ToolbarButton>
      {open && (
        <ul className="doc-editor__menu-list">
          {MERGE_FIELD_OPTIONS.map(({ key, label }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().insertMergeField(key).run()
                  setOpen(false)
                }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormatMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  useCloseOnOutsideClick(open, menuRef, () => setOpen(false))

  const apply = (fn) => {
    fn()
    setOpen(false)
  }

  return (
    <div className="doc-editor__menu doc-editor__menu--format" ref={menuRef}>
      <ToolbarButton onClick={() => setOpen(o => !o)} active={open} title="Font, size & colour">
        <IconFormat />
      </ToolbarButton>
      {open && (
        <div className="doc-editor__palette doc-editor__palette--format">
          <section className="doc-editor__palette-section">
            <h4 className="doc-editor__palette-title">Font</h4>
            <div className="doc-editor__palette-row">
              {EDITOR_FONTS.map(font => (
                <button
                  key={font.id}
                  type="button"
                  className="doc-editor__palette-font"
                  style={{ fontFamily: font.css }}
                  onClick={() => apply(() => editor.chain().focus().setFontFamily(font.id).run())}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </section>
          <section className="doc-editor__palette-section">
            <h4 className="doc-editor__palette-title">Size</h4>
            <div className="doc-editor__palette-grid doc-editor__palette-grid--4">
              {EDITOR_TEXT_SIZES.map(size => (
                <button
                  key={size.id}
                  type="button"
                  className="doc-editor__palette-chip"
                  onClick={() => apply(() => editor.chain().focus().setStandardTextSize(size.id).run())}
                >
                  <span className={`doc-editor__palette-preview ${size.className}`}>Aa</span>
                  {size.label}
                </button>
              ))}
            </div>
          </section>
          <section className="doc-editor__palette-section">
            <h4 className="doc-editor__palette-title">Text colour</h4>
            <div className="doc-editor__palette-colors">
              {EDITOR_COLOR_CHOICES.map(id => EDITOR_TEXT_COLORS.find(color => color.id === id)).filter(Boolean).map(color => (
                <button
                  key={color.id}
                  type="button"
                  className={`doc-editor__color-swatch${color.id === 'default' ? ' doc-editor__color-swatch--default' : ''}`}
                  title={color.label}
                  aria-label={color.label}
                  style={color.hex ? { background: color.hex } : undefined}
                  onClick={() => apply(() => editor.chain().focus().setTextColor(color.id).run())}
                />
              ))}
            </div>
          </section>
          <section className="doc-editor__palette-section">
            <h4 className="doc-editor__palette-title">Mark</h4>
            <div className="doc-editor__palette-grid">
              {EDITOR_HIGHLIGHT_CHOICES.map(id => EDITOR_HIGHLIGHTS.find(hl => hl.id === id)).filter(Boolean).map(hl => (
                <button
                  key={hl.id}
                  type="button"
                  className="doc-editor__palette-chip"
                  onClick={() => apply(() => editor.chain().focus().setExpressiveHighlight(hl.id).run())}
                >
                  {hl.isClear ? (
                    <span className="doc-editor__palette-swatch doc-editor__palette-swatch--clear">×</span>
                  ) : (
                    <span className={`doc-editor__palette-swatch ${hl.className}`} />
                  )}
                  {hl.label}
                </button>
              ))}
            </div>
          </section>
          <section className="doc-editor__palette-section">
            <h4 className="doc-editor__palette-title">Writing</h4>
            <div className="doc-editor__palette-grid">
              {WRITING_VOICES.map(voice => (
                <button
                  key={voice.id}
                  type="button"
                  className="doc-editor__palette-chip"
                  onClick={() => apply(() => editor.chain().focus().setExpressiveSize(voice.id).run())}
                >
                  <span className={`doc-editor__palette-preview ${voice.className}`}>Aa</span>
                  {voice.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

const BLOCK_STYLES = [
  { id: 'paragraph', label: 'Body', face: 'Karla', apply: (editor) => editor.chain().focus().setParagraph().run() },
  { id: 'h1', label: 'Title', face: 'Fraunces', apply: (editor) => editor.chain().focus().setHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading', face: 'Fraunces', apply: (editor) => editor.chain().focus().setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Subheading', face: 'Fraunces', apply: (editor) => editor.chain().focus().setHeading({ level: 3 }).run() },
]

function currentBlockStyle(toolbar) {
  if (toolbar.isH1) return BLOCK_STYLES[1]
  if (toolbar.isH2) return BLOCK_STYLES[2]
  if (toolbar.isH3) return BLOCK_STYLES[3]
  return BLOCK_STYLES[0]
}

function StyleMenu({ editor, toolbar }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  useCloseOnOutsideClick(open, menuRef, () => setOpen(false))
  const current = currentBlockStyle(toolbar)

  return (
    <div className="doc-editor__menu doc-editor__style" ref={menuRef}>
      <button
        type="button"
        className={`doc-editor__style-btn${open ? ' doc-editor__style-btn--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`doc-editor__style-label doc-editor__style-label--${current.id}`}>{current.label}</span>
        <span className="doc-editor__style-caret" aria-hidden />
      </button>
      {open && (
        <ul className="doc-editor__style-list" role="listbox" aria-label="Text style">
          {BLOCK_STYLES.map(style => (
            <li key={style.id}>
              <button
                type="button"
                role="option"
                aria-selected={current.id === style.id}
                className={`doc-editor__style-option doc-editor__style-option--${style.id}${current.id === style.id ? ' doc-editor__style-option--on' : ''}`}
                onClick={() => {
                  style.apply(editor)
                  setOpen(false)
                }}
              >
                <span>{style.label}</span>
                <span className="doc-editor__style-face">{style.face}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SlashCommandPalette({ open, query, items, selectedIndex, position, onPick, onHover }) {
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, query])

  if (!open) return null
  let lastGroup = ''

  return (
    <div
      className="doc-editor__slash"
      role="listbox"
      aria-label="Insert"
      style={position || undefined}
    >
      <p className="doc-editor__slash-hint">{query ? `/${query}` : 'Insert'}</p>
      {items.length === 0 ? (
        <p className="doc-editor__slash-empty">Nothing matches.</p>
      ) : (
        <ul className="doc-editor__slash-list" ref={listRef}>
          {items.map((item, index) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <li key={item.id}>
                {showGroup && <p className="doc-editor__slash-group">{item.group}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`doc-editor__slash-item${index === selectedIndex ? ' doc-editor__slash-item--active' : ''}`}
                  onMouseEnter={() => onHover(index)}
                  onClick={() => onPick(item)}
                >
                  <span className="doc-editor__slash-label">{item.label}</span>
                  <span className="doc-editor__slash-detail">{item.hint}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function readSlashQuery(editor, from) {
  if (!editor || editor.isDestroyed || typeof from !== 'number') return null
  const { from: cursor, empty } = editor.state.selection
  if (!empty || cursor < from) return null
  let text = ''
  try {
    text = editor.state.doc.textBetween(from, cursor, '\n', '\0')
  } catch {
    return null
  }
  if (!text.startsWith('/') || text.includes('\n') || text.includes('\0')) return null
  return text.slice(1)
}

function placeSlashMenu(view, canvas) {
  if (!canvas) return null
  const coords = view.coordsAtPos(view.state.selection.from)
  const rect = canvas.getBoundingClientRect()
  const width = 320
  let left = coords.left - rect.left
  if (left + width > canvas.clientWidth - 12) left = Math.max(8, canvas.clientWidth - width - 12)
  const below = rect.bottom - coords.bottom
  const above = coords.top - rect.top
  const openUp = below < 220 && above > below
  return {
    top: openUp
      ? coords.top - rect.top + canvas.scrollTop - 6
      : coords.bottom - rect.top + canvas.scrollTop + 6,
    left: Math.max(8, left),
    transform: openUp ? 'translateY(-100%)' : undefined,
  }
}

function runSlashCommand(editor, command, pickArtworkFile) {
  if (!editor || editor.isDestroyed || !command) return

  switch (command.action) {
    case 'textSize':
      editor.chain().focus().setStandardTextSize(command.value).run()
      break
    case 'voice':
      editor.chain().focus().setExpressiveSize(command.value).run()
      break
    case 'highlight':
      editor.chain().focus().setExpressiveHighlight(command.value).run()
      break
    case 'artwork':
      pickArtworkFile?.()
      break
    case 'heading':
      editor.chain().focus().setHeading({ level: command.value }).run()
      break
    case 'bullet':
      editor.chain().focus().toggleBulletList().run()
      break
    case 'ordered':
      editor.chain().focus().toggleOrderedList().run()
      break
    case 'blockquote':
      editor.chain().focus().toggleBlockquote().run()
      break
    case 'divider':
      editor.chain().focus().setHorizontalRule().run()
      break
    case 'table':
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'fill':
      editor.chain().focus().insertContent(
        '<p class="fill-line"><span class="fill-line__blank">_______________________________________________</span></p>',
      ).run()
      break
    case 'field':
      editor.chain().focus().insertMergeField(command.value).run()
      break
    case 'insertSnippet': {
      const html = getSlashSnippet(command.value)
      if (html) editor.chain().focus().insertContent(html).run()
      break
    }
    default:
      break
  }
}

function DocToolbar({
  editor,
  mode,
  clinicianProfile,
  onAddArtwork,
  toolbarClassName = EDITOR_TOOLBAR,
}) {
  const prompt = usePrompt()
  const toolbar = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed) return null
      return {
        isBold: ed.isActive('bold'),
        isItalic: ed.isActive('italic'),
        isUnderline: ed.isActive('underline'),
        isH1: ed.isActive('heading', { level: 1 }),
        isH2: ed.isActive('heading', { level: 2 }),
        isH3: ed.isActive('heading', { level: 3 }),
        isParagraph: ed.isActive('paragraph'),
        isBullet: ed.isActive('bulletList'),
        isOrdered: ed.isActive('orderedList'),
        isLink: ed.isActive('link'),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
      }
    },
  })

  if (!editor || editor.isDestroyed || !toolbar) return null

  const addLink = async () => {
    const previous = editor.getAttributes('link').href
    const url = await prompt({ title: 'Add link', label: 'Link URL', defaultValue: previous || 'https://' })
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const insertFillLine = async () => {
    const label = await prompt({ title: 'Insert fill-in field', label: 'Field label (optional)', defaultValue: '' })
    if (label === null) return
    editor
      .chain()
      .focus()
      .insertContent(
        `<p class="fill-line">${label ? `<span class="fill-line__label">${label}: </span>` : ''}<span class="fill-line__blank">_______________________________________________</span></p>`,
      )
      .run()
  }

  const isClinical = mode === 'clinical'

  return (
    <div className={toolbarClassName} role="toolbar" aria-label="Formatting">
      <div className={EDITOR_TOOLBAR_GROUP}>
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!toolbar.canUndo} title="Undo">
          <IconUndo />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!toolbar.canRedo} title="Redo">
          <IconRedo />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <StyleMenu editor={editor} toolbar={toolbar} />
      <ToolbarDivider />
      <div className={EDITOR_TOOLBAR_GROUP}>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={toolbar.isBold} title="Bold">
          <IconBold />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={toolbar.isItalic} title="Italic">
          <IconItalic />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={toolbar.isUnderline} title="Underline">
          <IconUnderline />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <FormatMenu editor={editor} />
      <ToolbarDivider />
      <div className={EDITOR_TOOLBAR_GROUP}>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={toolbar.isBullet} title="Bullet list">
          <IconBulletList />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={toolbar.isOrdered} title="Numbered list">
          <IconNumberList />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <div className={EDITOR_TOOLBAR_GROUP}>
        <ToolbarButton onClick={addLink} active={toolbar.isLink} title="Link">
          <IconLink />
        </ToolbarButton>
        <ToolbarButton onClick={onAddArtwork} title="Image">
          <IconImage />
        </ToolbarButton>
        {isClinical && (
          <ToolbarButton
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Table"
          >
            <IconTable />
          </ToolbarButton>
        )}
      </div>
      {isClinical && (
        <>
          <ToolbarDivider />
          <div className={EDITOR_TOOLBAR_GROUP}>
            <ToolbarButton onClick={insertFillLine} title="Fill-in line">
              <span className="doc-editor__icon-text">___</span>
            </ToolbarButton>
            <MergeFieldMenu editor={editor} />
            <SignatureMenu editor={editor} clinicianProfile={clinicianProfile} />
          </div>
        </>
      )}
      <span className="doc-editor__slash-cue">Type / to insert</span>
    </div>
  )
}

/**
 * One editor instance per React `key` on this component.
 * Parent must change `key` when switching documents — do not change `content` alone.
 */
function RichTextEditorSurface({
  content,
  onChange,
  editable = true,
  variant = 'default',
  layout = 'document',
  mode = 'basic',
  mergeContext = null,
  mergeMode = 'document',
  compact = false,
  clinicianProfile = null,
  onEditorReady = null,
}) {
  const immersive = layout === 'immersive'
  const [surfaceReady, setSurfaceReady] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashPos, setSlashPos] = useState(null)
  const slashFromRef = useRef(null)
  const canvasRef = useRef(null)
  const editorRef = useRef(null)
  const slashOpenRef = useRef(false)
  const slashQueryRef = useRef('')
  const slashIndexRef = useRef(0)

  const extensions = useMemo(() => buildEditorExtensions(mode), [mode])
  const slashItems = useMemo(() => filterSlashCommands(slashQuery, mode), [slashQuery, mode])

  useEffect(() => { slashOpenRef.current = slashOpen }, [slashOpen])
  useEffect(() => { slashQueryRef.current = slashQuery }, [slashQuery])
  useEffect(() => { slashIndexRef.current = slashIndex }, [slashIndex])

  const pickArtworkFile = useCallback((editorInstance) => {
    const ed = editorInstance
    if (!ed || ed.isDestroyed) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        ed.chain().focus().insertArtworkEmbed({
          src: reader.result,
          align: 'left',
          caption: file.name.replace(/\.[^.]+$/, '') || 'Client artwork',
        }).run()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [])

  const closeSlash = useCallback(() => {
    setSlashOpen(false)
    slashOpenRef.current = false
    setSlashQuery('')
    slashQueryRef.current = ''
    setSlashIndex(0)
    slashIndexRef.current = 0
    slashFromRef.current = null
  }, [])

  const executeSlash = useCallback((command, editorInstance) => {
    if (!editorInstance || editorInstance.isDestroyed) return
    const from = slashFromRef.current
    if (typeof from === 'number') {
      const to = editorInstance.state.selection.from
      editorInstance.chain().focus().deleteRange({ from, to }).run()
    }
    runSlashCommand(editorInstance, command, () => pickArtworkFile(editorInstance))
    closeSlash()
  }, [closeSlash, pickArtworkFile])

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions,
    content: content || '<p></p>',
    editable,
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
    onCreate: ({ editor: ed }) => {
      if (mode !== 'clinical') return
      publishMergeContext(ed, mergeContext, mergeMode)
      if (ed.storage.clinicianProfile) {
        ed.storage.clinicianProfile.profile = clinicianProfile || {}
      }
    },
    editorProps: {
      attributes: {
        class: 'doc-editor__prose',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        if (!_view.editable) return false

        if (slashOpenRef.current) {
          const items = filterSlashCommands(slashQueryRef.current, mode)

          if (event.key === 'Escape') {
            closeSlash()
            return true
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            const next = (slashIndexRef.current + 1) % Math.max(items.length, 1)
            slashIndexRef.current = next
            setSlashIndex(next)
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            const count = Math.max(items.length, 1)
            const next = (slashIndexRef.current - 1 + count) % count
            slashIndexRef.current = next
            setSlashIndex(next)
            return true
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            const cmd = items[slashIndexRef.current]
            if (cmd && editorRef.current) executeSlash(cmd, editorRef.current)
            return true
          }
        }

        if (event.key === '/' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          const { $from } = _view.state.selection
          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
          if (textBefore === '' || /\s$/.test(textBefore)) {
            slashFromRef.current = $from.pos
            setSlashPos(placeSlashMenu(_view, canvasRef.current))
            setSlashOpen(true)
            slashOpenRef.current = true
            setSlashQuery('')
            slashQueryRef.current = ''
            setSlashIndex(0)
            slashIndexRef.current = 0
            return false
          }
        }

        return false
      },
    },
  }, [extensions])

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const syncSlash = () => {
      if (!slashOpenRef.current) return
      const query = readSlashQuery(editor, slashFromRef.current)
      if (query === null) {
        closeSlash()
        return
      }
      if (query === slashQueryRef.current) return
      slashQueryRef.current = query
      slashIndexRef.current = 0
      setSlashQuery(query)
      setSlashIndex(0)
    }
    editor.on('update', syncSlash)
    editor.on('selectionUpdate', syncSlash)
    return () => {
      editor.off('update', syncSlash)
      editor.off('selectionUpdate', syncSlash)
    }
  }, [editor, closeSlash])

  useEffect(() => {
    setSurfaceReady(false)
    const frame = requestAnimationFrame(() => setSurfaceReady(true))
    return () => {
      cancelAnimationFrame(frame)
      setSurfaceReady(false)
    }
  }, [])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(editable)
  }, [editor, editable])

  useEffect(() => {
    if (!editor || editor.isDestroyed || mode !== 'clinical') return
    publishMergeContext(editor, mergeContext, mergeMode)
    if (editor.storage.clinicianProfile) {
      editor.storage.clinicianProfile.profile = clinicianProfile || {}
    }
  }, [editor, mergeContext, mergeMode, clinicianProfile, mode])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    onEditorReady?.(editor)
    return () => onEditorReady?.(null)
  }, [editor, onEditorReady])

  const handleAddArtwork = () => pickArtworkFile(editor)

  if (!editor || editor.isDestroyed || !surfaceReady) {
    if (immersive) {
      return (
        <div className={`${EDITOR_ROOT_IMMERSIVE} doc-editor--loading doc-editor--${variant}`}>
          <div className={EDITOR_CANVAS_IMMERSIVE}>
            <div className={`${EDITOR_WRITE_IMMERSIVE} min-h-[50vh] animate-pulse bg-editor-canvas/40`} />
          </div>
        </div>
      )
    }
    return (
      <div className={`${EDITOR_ROOT} doc-editor--loading doc-editor--${variant}`}>
        <div className={EDITOR_CANVAS}>
          <div className={EDITOR_PAGE_SKELETON} />
        </div>
      </div>
    )
  }

  const rootClass = immersive
    ? [
        EDITOR_ROOT_IMMERSIVE,
        `doc-editor--${variant}`,
        !editable ? 'doc-editor--readonly' : '',
        mode === 'clinical' ? 'doc-editor--clinical' : '',
        compact ? 'doc-editor--compact' : '',
      ].filter(Boolean).join(' ')
    : [
        EDITOR_ROOT,
        `doc-editor--${variant}`,
        !editable ? 'doc-editor--readonly' : '',
        mode === 'clinical' ? 'doc-editor--clinical' : '',
        compact ? 'doc-editor--compact' : '',
      ].filter(Boolean).join(' ')

  const canvasClass = immersive
    ? EDITOR_CANVAS_IMMERSIVE
    : [EDITOR_CANVAS, !editable ? 'bg-page' : ''].filter(Boolean).join(' ')

  const pageClass = [
    compact
      ? 'doc-editor__page mx-auto min-h-[16rem] w-full rounded-sm border border-line-light bg-editor-sheet shadow-md'
      : EDITOR_PAGE,
    !compact && variant === 'a4' ? 'w-[210mm] max-w-[min(210mm,100%)] min-h-[297mm]' : '',
    !editable ? 'shadow-none' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      {editable && editor && !editor.isDestroyed && (
        <DocToolbar
          editor={editor}
          mode={mode}
          clinicianProfile={clinicianProfile}
          onAddArtwork={handleAddArtwork}
          toolbarClassName={immersive ? EDITOR_TOOLBAR_IMMERSIVE : EDITOR_TOOLBAR}
        />
      )}
      <div className={canvasClass} ref={canvasRef}>
        <SlashCommandPalette
          open={slashOpen}
          query={slashQuery}
          items={slashItems}
          selectedIndex={slashIndex}
          position={slashPos}
          onPick={(cmd) => executeSlash(cmd, editor)}
          onHover={setSlashIndex}
        />
        {immersive ? (
          <div className={EDITOR_WRITE_IMMERSIVE}>
            <EditorContent editor={editor} />
          </div>
        ) : (
          <div className={pageClass}>
            <EditorContent editor={editor} />
          </div>
        )}
      </div>
    </div>
  )
}

function RichTextEditorFallback({ reset }) {
  return (
    <div className="rounded border border-line bg-surface p-4 text-sm" role="alert">
      <p><strong>Editor unavailable.</strong></p>
      <p className="text-subtle">The rest of this page is still usable.</p>
      <button type="button" className="primary mt-3" onClick={reset}>Reload editor</button>
    </div>
  )
}

export default function RichTextEditor(props) {
  return (
    <ErrorBoundary label="rich-text-editor" fallback={RichTextEditorFallback}>
      <RichTextEditorSurface {...props} />
    </ErrorBoundary>
  )
}
