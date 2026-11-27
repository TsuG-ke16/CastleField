// Reuse each feature's controls in its home page or in a battle dialog.
// No second copy of inputs, state or action handlers is created.
export function presentView(view, host = null) {
  if (!host) view.opener = document.activeElement;
  (host ?? document.getElementById('app')).append(view.box);
  view.box.classList.toggle('embedded-view', Boolean(host));
  view.box.setAttribute('role', host ? 'region' : 'dialog');
  if (host) view.box.removeAttribute('aria-modal');
  else view.box.setAttribute('aria-modal', 'true');
  view.box.hidden = false;
}

export function dismissView(view) {
  if (view.box.classList.contains('embedded-view')) {
    view.onEmbeddedBack?.();
  } else {
    view.box.hidden = true;
    if (view.opener?.isConnected && view.opener.getClientRects().length) view.opener.focus({ preventScroll: true });
  }
}
