import { mpClient } from '../multiplayer/MultiplayerClient';

const STORAGE_KEY = 'cockroach-mp-name';

export { STORAGE_KEY };

/**
 * Shows a full-screen HTML overlay prompting the user to enter a nickname.
 * On submit, stores the name in localStorage and notifies the server.
 *
 * @param onNameSet Called with the new name after a successful submit.
 */
export function showNicknameOverlay(onNameSet: (name: string) => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:"Press Start 2P",monospace;';

  const label = document.createElement('div');
  label.textContent = 'Tw\u00f3j nick:';
  label.style.cssText = 'color:#ffff00;font-size:14px;';
  overlay.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.value = localStorage.getItem(STORAGE_KEY) || '';
  input.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:18px;padding:8px 12px;background:#111;color:#fff;border:2px solid #006688;outline:none;text-align:center;width:240px;';
  overlay.appendChild(input);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;';

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'OK';
  submitBtn.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;padding:8px 16px;background:#006688;color:#fff;border:none;cursor:pointer;';
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
      localStorage.setItem(STORAGE_KEY, name);
      mpClient.setName(name);
      onNameSet(name);
      cleanup();
    }
  };

  submitBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', cleanup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') cleanup();
  });
}
