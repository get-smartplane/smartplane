/** Piece packages ship pre-bundled JavaScript without types; their exports are checked at run time. */
declare module "@activepieces/piece-*" {
  const exports: Readonly<Record<string, unknown>>
  export = exports
}
