// @ts-nocheck — TipTap command typings are verbose; runtime behaviour is covered by editor tests.
import { Extension, Node, Mark, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { MERGE_FIELD_OPTIONS } from './mergeFields'
import { fontCssForId, textColorHexForId } from './editorFormatting'

export const MergeContextExtension = Extension.create({
  name: 'mergeContext',

  addStorage() {
    return { values: {} }
  },

  addCommands() {
    return {
      setMergeContext:
        values =>
          ({ editor }) => {
            editor.storage.mergeContext.values = values || {}
            return true
          },
    }
  },
})

export const ClinicianProfileExtension = Extension.create({
  name: 'clinicianProfile',

  addStorage() {
    return { profile: null }
  },

  addCommands() {
    return {
      setClinicianProfile:
        profile =>
          ({ editor }) => {
            editor.storage.clinicianProfile.profile = profile
            return true
          },
    }
  },
})

export const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      field: { default: 'client_name' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const opt = MERGE_FIELD_OPTIONS.find(o => o.key === node.attrs.field)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-merge-field': node.attrs.field,
        class: 'merge-field',
      }),
      opt?.label || node.attrs.field,
    ]
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'merge-field'
      dom.dataset.mergeField = node.attrs.field

      const refresh = () => {
        const values = editor.storage.mergeContext?.values || {}
        const opt = MERGE_FIELD_OPTIONS.find(o => o.key === node.attrs.field)
        const resolved = values[node.attrs.field]
        dom.textContent = resolved || `{${opt?.label || node.attrs.field}}`
        dom.title = opt?.label || node.attrs.field
      }

      refresh()

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mergeField') return false
          refresh()
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertMergeField:
        field =>
          ({ chain }) =>
            chain().focus().insertContent({ type: 'mergeField', attrs: { field } }).run(),
    }
  },
})

type SignatureInsertAttrs = {
  mode?: 'profile-image' | 'drawn' | 'script' | 'legacy'
  name?: string
  jobTitle?: string
  professionalTitle?: string
  title?: string
  hcpc?: string
  signatureText?: string
  imageUrl?: string
}

export const SignatureBlock = Node.create({
  name: 'signatureBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      mode: { default: 'legacy' },
      name: { default: '' },
      jobTitle: { default: '' },
      professionalTitle: { default: '' },
      title: { default: '' },
      hcpc: { default: '' },
      signatureText: { default: '' },
      imageUrl: { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-signature-block]',
      getAttrs: el => ({
        mode: el.getAttribute('data-signature-mode') || 'legacy',
        name: el.getAttribute('data-signature-name') || '',
        jobTitle: el.getAttribute('data-signature-job-title') || '',
        professionalTitle: el.getAttribute('data-signature-professional-title') || '',
        title: el.getAttribute('data-signature-title') || '',
        hcpc: el.getAttribute('data-signature-hcpc') || '',
        signatureText: el.getAttribute('data-signature-text') || '',
        imageUrl: el.getAttribute('data-signature-image') || '',
      }),
    }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const {
      mode,
      name,
      jobTitle,
      professionalTitle,
      title,
      hcpc,
      signatureText,
      imageUrl,
    } = node.attrs
    const profTitle = professionalTitle || title || jobTitle || ''
    const children: Array<string | Record<string, string> | Array<unknown>> = []

    if ((mode === 'profile-image' || mode === 'drawn') && imageUrl) {
      children.push(['img', {
        class: 'doc-signature__image',
        src: imageUrl,
        alt: 'Signature',
      }])
    } else if (mode === 'script' && signatureText) {
      children.push(['div', { class: 'doc-signature__script' }, signatureText])
    } else if (signatureText) {
      children.push(['div', { class: 'doc-signature__line doc-signature__legacy' }, signatureText])
    }

    if (name) {
      children.push(['div', { class: 'doc-signature__line doc-signature__name' }, name])
    }

    const credentials = [profTitle, hcpc ? `HCPC ${hcpc}` : ''].filter(Boolean).join(' · ')
    if (credentials) {
      children.push(['div', { class: 'doc-signature__line doc-signature__credentials' }, credentials])
    }

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-signature-block': '',
        'data-signature-mode': mode || 'legacy',
        'data-signature-name': name || '',
        'data-signature-job-title': jobTitle || '',
        'data-signature-professional-title': profTitle || '',
        'data-signature-title': title || '',
        'data-signature-hcpc': hcpc || '',
        'data-signature-text': signatureText || '',
        'data-signature-image': imageUrl || '',
        class: 'doc-signature',
      }),
      ...children,
    ]
  },

  addCommands() {
    return {
      insertSignature:
        (attrs: SignatureInsertAttrs = {}) =>
          ({ chain, editor }) => {
            const profile = editor.storage.clinicianProfile?.profile || {}
            const mode = attrs.mode
              || (attrs.imageUrl || profile.signature_image_url ? 'profile-image' : 'script')
            const imageUrl = attrs.imageUrl
              ?? (mode === 'profile-image' ? profile.signature_image_url : '')
              ?? ''
            const signatureText = attrs.signatureText
              ?? profile.signature_text
              ?? profile.full_name
              ?? ''

            return chain()
              .focus()
              .insertContent({
                type: 'signatureBlock',
                attrs: {
                  mode,
                  name: attrs.name ?? profile.full_name ?? '',
                  jobTitle: attrs.jobTitle ?? profile.job_title ?? '',
                  professionalTitle: attrs.professionalTitle ?? profile.professional_title ?? '',
                  title: attrs.title ?? profile.professional_title ?? profile.job_title ?? '',
                  hcpc: attrs.hcpc ?? profile.hcpc_number ?? '',
                  signatureText,
                  imageUrl: imageUrl || '',
                },
              })
              .run()
          },
    }
  },
})

export const FontFamily = Mark.create({
  name: 'fontFamily',

  addAttributes() {
    return { family: { default: 'nunito' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-font-family]', getAttrs: el => ({ family: el.getAttribute('data-font-family') }) }]
  },

  renderHTML({ HTMLAttributes }) {
    const family = HTMLAttributes.family || 'nunito'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-font-family': family,
        class: `doc-font doc-font--${family}`,
        style: `font-family: ${fontCssForId(family)}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setFontFamily:
        family =>
          ({ chain }) =>
            chain().focus().setMark('fontFamily', { family }).run(),
      unsetFontFamily:
        () =>
          ({ chain }) =>
            chain().focus().unsetMark('fontFamily').run(),
    }
  },
})

export const TextColor = Mark.create({
  name: 'textColor',

  addAttributes() {
    return { color: { default: 'default' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-text-color]', getAttrs: el => ({ color: el.getAttribute('data-text-color') }) }]
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes.color || 'default'
    const hex = textColorHexForId(color)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-text-color': color,
        class: hex ? `doc-color doc-color--${color}` : '',
        ...(hex ? { style: `color: ${hex}` } : {}),
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setTextColor:
        color =>
          ({ chain }) => {
            if (!color || color === 'default') {
              return chain().focus().unsetMark('textColor').run()
            }
            return chain().focus().setMark('textColor', { color }).run()
          },
      unsetTextColor:
        () =>
          ({ chain }) =>
            chain().focus().unsetMark('textColor').run(),
    }
  },
})

export const StandardTextSize = Mark.create({
  name: 'standardTextSize',

  addAttributes() {
    return { size: { default: 'normal' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-text-size]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const size = HTMLAttributes.size || 'normal'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-text-size': size,
        class: `doc-size doc-size--${size}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setStandardTextSize:
        size =>
          ({ chain }) => {
            if (!size || size === 'normal') {
              return chain().focus().unsetMark('standardTextSize').run()
            }
            return chain().focus().setMark('standardTextSize', { size }).run()
          },
      unsetStandardTextSize:
        () =>
          ({ chain }) =>
            chain().focus().unsetMark('standardTextSize').run(),
    }
  },
})

export const ExpressiveSize = Mark.create({
  name: 'expressiveSize',

  addAttributes() {
    return {
      size: { default: 'standard' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-expressive-size]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const size = HTMLAttributes.size || 'standard'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-expressive-size': size,
        class: `expr-size expr-size--${size}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setExpressiveSize:
        size =>
          ({ chain }) =>
            chain().focus().setMark('expressiveSize', { size }).run(),
      unsetExpressiveSize:
        () =>
          ({ chain }) =>
            chain().focus().unsetMark('expressiveSize').run(),
    }
  },
})

export const ExpressiveHighlight = Mark.create({
  name: 'expressiveHighlight',

  addAttributes() {
    return {
      tone: { default: 'teal-wash' },
    }
  },

  parseHTML() {
    return [{ tag: 'mark[data-expressive-highlight]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const tone = HTMLAttributes.tone || 'teal-wash'
    return [
      'mark',
      mergeAttributes(HTMLAttributes, {
        'data-expressive-highlight': tone,
        class: `expr-hl expr-hl--${tone}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setExpressiveHighlight:
        tone =>
          ({ chain }) => {
            if (!tone || tone === 'none') {
              return chain().focus().unsetMark('expressiveHighlight').run()
            }
            return chain().focus().setMark('expressiveHighlight', { tone }).run()
          },
      unsetExpressiveHighlight:
        () =>
          ({ chain }) =>
            chain().focus().unsetMark('expressiveHighlight').run(),
    }
  },
})

export const AudioFragment = Node.create({
  name: 'audioFragment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      label: { default: 'Session audio fragment' },
      duration: { default: '0:42' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-audio-fragment]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const bars = Array.from({ length: 28 }, (_, i) => [
      'span',
      {
        class: 'audio-fragment__bar',
        style: `--bar-h:${18 + ((i * 17) % 70)}%`,
      },
    ])
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-audio-fragment': '',
        class: 'audio-fragment',
      }),
      ['div', { class: 'audio-fragment__head' }, node.attrs.label],
      ['div', { class: 'audio-fragment__wave', 'aria-hidden': 'true' }, ...bars],
      ['span', { class: 'audio-fragment__duration' }, node.attrs.duration],
    ]
  },

  addCommands() {
    return {
      insertAudioFragment:
        attrs =>
          ({ chain }) =>
            chain()
              .focus()
              .insertContent({
                type: 'audioFragment',
                attrs: {
                  label: attrs?.label || 'Session audio fragment',
                  duration: attrs?.duration || '0:42',
                },
              })
              .run(),
    }
  },
})

export const ArtworkEmbed = Node.create({
  name: 'artworkEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      align: { default: 'left' },
      caption: { default: 'Describe this artwork…' },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-artwork-embed]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-artwork-embed': '',
        class: `artwork-embed artwork-embed--${node.attrs.align || 'left'}`,
        'data-align': node.attrs.align || 'left',
      }),
      ['img', { src: node.attrs.src, alt: node.attrs.caption || 'Client artwork', class: 'artwork-embed__img' }],
      ['figcaption', { class: 'artwork-embed__caption', contenteditable: 'true' }, node.attrs.caption],
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const figure = document.createElement('figure')
      figure.className = `artwork-embed artwork-embed--${node.attrs.align}`
      figure.dataset.artworkEmbed = ''

      const controls = document.createElement('div')
      controls.className = 'artwork-embed__controls'
      controls.contentEditable = 'false'

      const img = document.createElement('img')
      img.className = 'artwork-embed__img'
      img.src = node.attrs.src || ''
      img.alt = node.attrs.caption || 'Client artwork'

      const caption = document.createElement('figcaption')
      caption.className = 'artwork-embed__caption'
      caption.contentEditable = 'true'
      caption.textContent = node.attrs.caption || 'Describe this artwork…'

      const updateAttrs = (patch) => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }),
        )
      }

      ;[
        { align: 'left', label: 'Left' },
        { align: 'bleed', label: 'Full bleed' },
        { align: 'wrap-right', label: 'Right wrap' },
      ].forEach(({ align, label }) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'artwork-embed__align-btn'
        btn.textContent = label
        btn.dataset.align = align
        if (node.attrs.align === align) btn.classList.add('artwork-embed__align-btn--active')
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          updateAttrs({ align })
        })
        controls.appendChild(btn)
      })

      caption.addEventListener('blur', () => {
        updateAttrs({ caption: caption.textContent || '' })
      })

      figure.appendChild(controls)
      figure.appendChild(img)
      figure.appendChild(caption)

      return {
        dom: figure,
        update(updatedNode) {
          if (updatedNode.type.name !== 'artworkEmbed') return false
          figure.className = `artwork-embed artwork-embed--${updatedNode.attrs.align}`
          img.src = updatedNode.attrs.src || ''
          if (document.activeElement !== caption) {
            caption.textContent = updatedNode.attrs.caption || ''
          }
          controls.querySelectorAll('.artwork-embed__align-btn').forEach(btn => {
            btn.classList.toggle(
              'artwork-embed__align-btn--active',
              btn.dataset.align === updatedNode.attrs.align,
            )
          })
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertArtworkEmbed:
        attrs =>
          ({ chain }) =>
            chain()
              .focus()
              .insertContent({
                type: 'artworkEmbed',
                attrs: {
                  src: attrs?.src,
                  align: attrs?.align || 'left',
                  caption: attrs?.caption || 'Describe this artwork…',
                },
              })
              .run(),
    }
  },
})

const FORMATTING_EXTENSIONS = [
  FontFamily,
  TextColor,
  StandardTextSize,
  ExpressiveSize,
  ExpressiveHighlight,
  AudioFragment,
  ArtworkEmbed,
]

const BASE_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
  }),
  Underline,
  Placeholder.configure({
    placeholder: 'Start writing…',
    emptyEditorClass: 'is-editor-empty',
  }),
]

const BASIC_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Underline,
  Placeholder.configure({
    placeholder: 'Start writing…',
    emptyEditorClass: 'is-editor-empty',
  }),
]

const CLINICAL_EXTENSIONS = [
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { class: 'doc-editor__link' },
  }),
  Image.configure({
    inline: false,
    allowBase64: true,
    HTMLAttributes: { class: 'doc-editor__image' },
  }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  MergeContextExtension,
  ClinicianProfileExtension,
  MergeField,
  SignatureBlock,
]

export function buildEditorExtensions(mode = 'basic') {
  if (mode === 'clinical') {
    return [...BASE_EXTENSIONS, ...CLINICAL_EXTENSIONS, ...FORMATTING_EXTENSIONS]
  }
  return [
    ...BASIC_EXTENSIONS,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'doc-editor__link' },
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: { class: 'doc-editor__image' },
    }),
    ...FORMATTING_EXTENSIONS,
  ]
}
