/**
 * Preloaded ahead of every other module so it lands before `@shadow-library/common` constructs its
 * ConfigService and resolves `app.stage`.
 *
 * `app.stage` defaults to `prod`, which is the right default for a deployment and the wrong one for this
 * suite: `GET /notifications/messages` is registered behind `@EnableIf(stage === 'dev')`, so a prod stage
 * removes the route entirely and its specs fail with a 404 that looks nothing like the missing env var it
 * actually is. `??=` so an operator running the suite against another stage still wins.
 */
process.env.APP_STAGE ??= 'dev';
