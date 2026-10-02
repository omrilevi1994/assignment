/**
 * Module boundary rules, checked by `pnpm lint` and drawn by `pnpm graph`.
 *
 * Layers, inner to outer:
 *   src/domain    pure types, stage schemas, verify()        -> imports nothing app-specific
 *   src/data      event and company loaders                  -> domain
 *   src/llm       the only module that talks to a model      -> domain
 *   src/pipeline  Select -> Answer -> Verify orchestration    -> domain, data, llm
 *   src/db        Drizzle schema and repositories            -> domain
 *   src/app       Next.js routes and pages                   -> everything above
 *   src/components React UI                                  -> domain types only
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      comment: "Domain logic knows nothing about the app, the gateway, the database or any framework.",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/(app|components|llm|pipeline|db|data)|(^|/)node_modules/(next|react|ai|drizzle-orm)/" },
    },
    {
      name: "pipeline-has-no-ui-or-db",
      severity: "error",
      from: { path: "^src/pipeline" },
      to: { path: "^src/(app|components|db)|(^|/)node_modules/(next|react)/" },
    },
    {
      name: "only-gateway-talks-to-models",
      comment: "The AI SDK and provider packages are imported only by the LLM gateway.",
      severity: "error",
      from: { pathNot: "^src/llm" },
      to: { path: "(^|/)node_modules/(ai|@openrouter|@ai-sdk)/" },
    },
    {
      name: "ui-does-not-touch-db-or-models",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: "^src/(db|llm|pipeline)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      mermaid: { minify: false },
      dot: { collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)" },
    },
  },
};
