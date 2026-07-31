/**
 * `eslint-plugin-jsx-a11y` ships no type declarations. It is consumed only as an opaque flat-config object
 * (`jsxA11y.flatConfigs.recommended`) that is spread into the shipped ESLint config, so an ambient `any`
 * declaration is sufficient and avoids pulling in an unmaintained `@types` package.
 */
declare module 'eslint-plugin-jsx-a11y';
