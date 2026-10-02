import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

/** Coding rules: short functions, shallow nesting, a comment on every function. */
const codeRules = {
  "max-lines-per-function": ["error", { max: 30, skipBlankLines: true, skipComments: true }],
  "max-depth": ["error", 3],
  complexity: ["error", 8],
  "jsdoc/require-jsdoc": [
    "error",
    {
      publicOnly: false,
      require: {
        FunctionDeclaration: true,
        ArrowFunctionExpression: true,
        FunctionExpression: true,
        MethodDefinition: true,
        ClassDeclaration: true,
      },
      checkConstructors: false,
    },
  ],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts,mjs,cjs,js}"],
    plugins: { jsdoc },
    rules: codeRules,
  },
  {
    // Test suites are one long `describe` by nature; config files are declarative.
    files: ["**/*.test.{ts,tsx}", "**/*.config.{ts,mjs,cjs}", ".dependency-cruiser.cjs"],
    rules: { "max-lines-per-function": "off", "jsdoc/require-jsdoc": "off" },
  },
  {
    // Vendored from shadcn/ui and updated by its CLI, so they keep upstream's shape.
    files: ["src/components/ui/**"],
    rules: {
      "max-lines-per-function": "off",
      "max-depth": "off",
      complexity: "off",
      "jsdoc/require-jsdoc": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "docs/**", "graphify-out/**", "next-env.d.ts"]),
]);
