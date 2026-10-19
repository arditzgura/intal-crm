import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Fushë fjalëkalimi me butonin e syrit për ta shfaqur/fshehur. */
export default function PasswordInput(props) {
  const [show, setShow] = useState(false)
  return (
    <div className="password-field">
      <input {...props} type={show ? 'text' : 'password'} />
      <button
        type="button"
        className="password-eye"
        onClick={() => setShow((v) => !v)}
        title={show ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
        aria-label={show ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
