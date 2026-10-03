import { useEffect, useRef, useState } from 'react'
import SignaturePad from './SignaturePad'
import { usePrompt } from './ui'
import { IconSign } from './EditorToolbarIcons'

const BTN =
  'doc-editor__btn inline-flex min-h-[1.85rem] min-w-[1.85rem] items-center justify-center rounded border-0 bg-transparent px-1.5 text-[0.82rem] text-accent transition-colors hover:enabled:bg-primary/15 disabled:cursor-default disabled:opacity-35'
const BTN_ACTIVE = 'doc-editor__btn--active bg-primary/25 text-primary-dark'

export default function SignatureMenu({ editor, clinicianProfile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [padOpen, setPadOpen] = useState(false)
  const menuRef = useRef(null)
  const prompt = usePrompt()

  useEffect(() => {
    if (!menuOpen && !padOpen) return undefined
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
        setPadOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen, padOpen])

  const closeAll = () => {
    setMenuOpen(false)
    setPadOpen(false)
  }

  const insertSignature = (attrs) => {
    editor.chain().focus().insertSignature(attrs).run()
    closeAll()
  }

  const useStored = () => {
    if (clinicianProfile?.signature_image_url) {
      insertSignature({ mode: 'profile-image', imageUrl: clinicianProfile.signature_image_url })
      return
    }
    insertSignature({
      mode: 'script',
      signatureText: clinicianProfile?.signature_text || clinicianProfile?.full_name || '',
    })
  }

  const useScript = async () => {
    const defaultValue = clinicianProfile?.signature_text || clinicianProfile?.full_name || ''
    const text = await prompt({
      title: 'Signature text',
      label: 'Your sign-off',
      defaultValue,
    })
    if (text) insertSignature({ mode: 'script', signatureText: text })
  }

  const useDrawn = (dataUrl) => {
    insertSignature({ mode: 'drawn', imageUrl: dataUrl })
  }

  return (
    <div className="doc-editor__menu doc-editor__menu--signature" ref={menuRef}>
      <button
        type="button"
        className={`${BTN}${menuOpen || padOpen ? ` ${BTN_ACTIVE}` : ''}`}
        onClick={() => setMenuOpen(open => !open)}
        title="Insert signature"
        aria-label="Insert signature"
        aria-expanded={menuOpen || padOpen}
      >
        <IconSign />
      </button>
      {menuOpen && !padOpen && (
        <ul className="doc-editor__menu-list doc-editor__menu-list--signature">
          <li>
            <button type="button" onClick={useStored}>
              {clinicianProfile?.signature_image_url
                ? 'Use account signature'
                : 'Use account sign-off'}
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setPadOpen(true)}>
              Handwrite here
            </button>
          </li>
          <li>
            <button type="button" onClick={useScript}>
              Handwritten style font
            </button>
          </li>
        </ul>
      )}
      {padOpen && (
        <SignaturePad
          onCancel={() => setPadOpen(false)}
          onSave={useDrawn}
        />
      )}
    </div>
  )
}
