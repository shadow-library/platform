export type EditState =
  | { mode: 'reading' }
  | {
      mode: 'editing';
      base: string;
      draft: string;
      conflict: boolean;
      saving: boolean;
      /** Whether the save in flight came from a deliberate key or button; a save started by blur must not pull focus back when it lands. */
      returnFocus: boolean;
    };

export type EditEvent =
  | { type: 'open'; value: string }
  | { type: 'change'; draft: string }
  /** `current` is the value the field holds now; it differs from the edit's base when someone else saved while this edit was open. */
  | { type: 'commit'; current: string; required: boolean; via: 'key' | 'blur' }
  | { type: 'escape' }
  | { type: 'keepMine'; required: boolean }
  | { type: 'takeTheirs' }
  | { type: 'saved' }
  | { type: 'failed' };

export interface EditStep {
  state: EditState;
  /** The value to send, when this step starts a save. */
  save?: string;
  /** Move focus back to the field's Edit control once this step renders. */
  focus?: boolean;
}

const READING: EditState = { mode: 'reading' };

export function stepEdit(state: EditState, event: EditEvent): EditStep {
  if (event.type === 'open') return { state: { mode: 'editing', base: event.value, draft: event.value, conflict: false, saving: false, returnFocus: false } };
  if (state.mode === 'reading') return { state };
  if (event.type === 'saved') return { state: READING, focus: state.returnFocus };
  if (event.type === 'escape' || event.type === 'takeTheirs') return { state: READING, focus: true };
  if (event.type === 'failed') return { state: { ...state, saving: false } };
  if (state.saving) return { state };
  if (event.type === 'change') return { state: { ...state, draft: event.draft } };
  const value = state.draft.trim();
  if (event.type === 'keepMine') {
    if (event.required && value === '') return { state: READING, focus: true };
    return { state: { ...state, conflict: false, saving: true, returnFocus: true }, save: value };
  }
  if (state.conflict) return { state };
  const byKey = event.via === 'key';
  if (value === state.base.trim() || (event.required && value === '')) return { state: READING, focus: byKey };
  if (event.current.trim() !== state.base.trim()) return { state: { ...state, conflict: true } };
  return { state: { ...state, saving: true, returnFocus: byKey }, save: value };
}
