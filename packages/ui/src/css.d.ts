// Satisfies `noUncheckedSideEffectImports` in resolvers (editor language servers) that don't fall back to vite/client's wildcard;
// vite/client's more specific `*.module.css` declaration still wins.
declare module '*.css';
