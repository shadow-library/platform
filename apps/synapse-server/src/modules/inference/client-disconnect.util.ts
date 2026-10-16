interface ClosableStream {
  readonly destroyed?: boolean;
  on(event: 'close', listener: () => void): unknown;
  off(event: 'close', listener: () => void): unknown;
}

interface DisconnectSources {
  response: ClosableStream & { readonly writableFinished: boolean };
  /** Shared by every request a keep-alive connection carries, so its listener must be removed when the request ends */
  socket?: ClosableStream | null;
}

/**
 * Node reports a caller hanging up by closing the response, Bun only by closing the socket, so both are watched. A close after the response
 * has finished is the connection ending normally, and one that came before watching began is reported at once. Returns the function that
 * stops watching.
 */
export function watchClientDisconnect({ response, socket }: DisconnectSources, onDisconnect: () => void): () => void {
  const listener = (): void => {
    if (!response.writableFinished) onDisconnect();
  };
  response.on('close', listener);
  socket?.on('close', listener);
  if (response.destroyed === true || socket?.destroyed === true) listener();
  return () => {
    response.off('close', listener);
    socket?.off('close', listener);
  };
}
