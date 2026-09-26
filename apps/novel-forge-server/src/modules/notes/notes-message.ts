import { countWords } from '../eval/deterministic-metrics';
import { NOTES_MAX_WORDS, NOTES_MESSAGE_MIN_WORDS, notesAppender } from './notes-store.service';

export type NotesOffer = (message: { role: string; content: string }) => boolean;

/**
 * Whether the chat offers "Save this as notes?" under a message, read against the author's notes once for a whole transcript: a long
 * message of theirs the notes do not hold yet and could take without passing their word limit.
 */
export function notesOffer(notes: string): NotesOffer {
  const words = countWords(notes);
  const append = notesAppender(notes);
  return message => {
    if (message.role !== 'user') return false;
    const length = countWords(message.content);
    return length >= NOTES_MESSAGE_MIN_WORDS && words + length <= NOTES_MAX_WORDS && append(message.content) !== null;
  };
}
