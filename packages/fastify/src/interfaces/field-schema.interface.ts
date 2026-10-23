/** A plain string covers every failure of the field, including a missing value; the object form keys messages by JSON Schema keyword with `_` as the catch all. */
export type FieldErrorMessage = string | (Record<string, string> & { _?: string });

declare module '@shadow-library/class-schema' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface BaseFieldSchema<T> {
    /** Message returned to the client when this field fails validation; `{placeholder}` resolves against the failing rule's params */
    errorMessage?: FieldErrorMessage;
  }
}
