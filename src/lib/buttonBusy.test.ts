import assert from 'node:assert/strict';
import test from 'node:test';
import { isButtonBusy, setButtonBusy, withButtonBusy } from './buttonBusy.ts';

function makeButton(label = 'Save') {
  const button = {
    disabled: false,
    textContent: label,
    innerHTML: '',
    classList: { add() {}, remove() {} },
    dataset: { label },
    setAttribute() {},
    removeAttribute() {},
    hasAttribute: () => false,
  } as unknown as HTMLButtonElement;
  return button;
}

test('setButtonBusy shows spinner markup and disables the button', () => {
  const button = makeButton('Save access');
  setButtonBusy(button, true, 'Saving…');
  assert.equal(isButtonBusy(button), true);
  assert.equal(button.disabled, true);
  assert.match(button.innerHTML, /busy-spinner/);
  assert.match(button.innerHTML, /Saving…/);
});

test('setButtonBusy restores label and prior disabled state', () => {
  const button = makeButton('Save access');
  button.disabled = true;
  setButtonBusy(button, true, 'Saving…');
  setButtonBusy(button, false);
  assert.equal(isButtonBusy(button), false);
  assert.equal(button.textContent, 'Save access');
  assert.equal(button.disabled, true);
});

test('withButtonBusy clears after failure', async () => {
  const button = makeButton('Attach');
  await assert.rejects(
    () =>
      withButtonBusy(button, async () => {
        throw new Error('fail');
      }),
  );
  assert.equal(isButtonBusy(button), false);
  assert.equal(button.textContent, 'Attach');
});
