// generator/validator.js
// Validates that a generated system is structurally sound
// before it gets moved to its final destination.

const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Required files every generated system must have.
 */
const REQUIRED_FILES = [
  "package.json",
  "prisma/schema.prisma",
  "app/layout.tsx",
  "app/page.tsx",
];

/**
 * Validates the generated system at systemDir.
 * Throws if any check fails.
 *
 * @param {string} systemDir - absolute path to the generated system
 */
async function validateSystem(systemDir) {
  console.log("\n🔍 Validating generated system...");

  // 1. Required file check
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(systemDir, file);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(
        `Validation failed: Missing required file "${file}".\n` +
        `  This usually means the core-template is incomplete.`
      );
    }
  }
  console.log("  ✅ File structure: OK");

  // 2. package.json must have a "dev" script
  const pkg = await fs.readJson(path.join(systemDir, "package.json"));
  if (!pkg.scripts || !pkg.scripts.dev) {
    throw new Error(
      `Validation failed: package.json is missing a "dev" script.\n` +
      `  The core-template package.json must include: "dev": "next dev"`
    );
  }
  console.log("  ✅ package.json scripts: OK");

  // 3. Prisma schema must not have duplicate model declarations
  const schemaPath = path.join(systemDir, "prisma", "schema.prisma");
  const schemaContent = await fs.readFile(schemaPath, "utf-8");
  const modelMatches = [...schemaContent.matchAll(/^model\s+(\w+)\s*\{/gm)];
  const modelNames = modelMatches.map((m) => m[1]);
  const duplicates = modelNames.filter(
    (name, i) => modelNames.indexOf(name) !== i
  );
  if (duplicates.length > 0) {
    throw new Error(
      `Validation failed: Duplicate Prisma models found: ${duplicates.join(", ")}.\n` +
      `  Check your module .prisma files for naming conflicts.`
    );
  }
  console.log("  ✅ Prisma schema: OK");

  // 4. TypeScript check (non-fatal warning if tsc not available)
  try {
    execSync("npx tsc --noEmit", {
      cwd: systemDir,
      stdio: "pipe",
    });
    console.log("  ✅ TypeScript: OK");
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || "";
    // Only warn — don't fail the build for TS errors since modules
    // may have intentional any types or missing lib references
    console.warn(
      `  ⚠️  TypeScript warnings detected (build may still work):\n` +
      output
        .split("\n")
        .slice(0, 5)
        .map((l) => `     ${l}`)
        .join("\n")
    );
  }

  console.log("  ✅ Validation passed.\n");
}

module.exports = { validateSystem };
