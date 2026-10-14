export default function SaveBar({ form, onSave }) {
  return (
    <div className="save-bar">
      {form.msg && <span className={`alert inline ${form.msg.type}`}>{form.msg.text}</span>}
      {form.dirty && (
        <button type="button" className="btn" onClick={form.reset} disabled={form.busy}>
          Anulo
        </button>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={() => (onSave ? onSave() : form.save())}
        disabled={form.busy || !form.dirty}
      >
        {form.busy ? 'Duke ruajtur…' : 'Ruaj'}
      </button>
    </div>
  )
}
