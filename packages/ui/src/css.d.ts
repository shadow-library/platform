// Ambient declaration for side-effect CSS imports (e.g. `import '@/styles/index.css'`). vite/client
// supplies this too, but a project-local declaration keeps `noUncheckedSideEffectImports` satisfied in
// every TS resolver — including editor language servers that don't fall back to the wildcard. The more
// specific `*.module.css` declaration from vite/client still wins for CSS-module default imports.
declare module '*.css';
