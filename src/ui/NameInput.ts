/**
 * Creates an HTML overlay with a name input form.
 * Calls `onSubmit` with the trimmed name when the user submits.
 */
export function showNameInput(onSubmit: (name: string) => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:"Press Start 2P",monospace;';

  const label = document.createElement('div');
  label.textContent = 'Wpisz swoje imię:';
  label.style.cssText = 'color:#ffff00;font-size:14px;';
  overlay.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:18px;padding:8px 12px;background:#111;color:#fff;border:2px solid #8b0000;outline:none;text-align:center;width:240px;';
  overlay.appendChild(input);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;';

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Zapisz';
  submitBtn.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;padding:8px 16px;background:#008800;color:#fff;border:none;cursor:pointer;';
  btnRow.appendChild(submitBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Anuluj';
  cancelBtn.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;padding:8px 16px;background:#666;color:#fff;border:none;cursor:pointer;';
  btnRow.appendChild(cancelBtn);

  overlay.appendChild(btnRow);
  document.body.appendChild(overlay);

  input.focus();

  const cleanup = (): void => {
    overlay.remove();
  };

  const submit = (): void => {
    const name = input.value.trim().slice(0, 20);
    if (name.length > 0) {
      cleanup();
      onSubmit(name);
    }
  };

  submitBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', cleanup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') cleanup();
  });
}
