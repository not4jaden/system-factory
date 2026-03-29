// generator/prisma-merger.js
// Merges module .prisma files into the base schema safely.
// Detects duplicate model/enum names before writing anything.

const fs = require("fs-extra");
const path = require("path");

/**
 * Extracts all model names from a prisma schema string.
 * @param {string} content
 * @returns {Set<string>}
 */
function extractModelNames(content) {
  const matches = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)];
  return new Set(matches.map((m) => m[1]));
}

/**
 * Extracts all enum names from a prisma schema string.
 * @param {string} content
 * @returns {Set<string>}
 */
function extractEnumNames(content) {
  const matches = [...content.matchAll(/^enum\s+(\w+)\s*\{/gm)];
  return new Set(matches.map((m) => m[1]));
}

/**
 * Merges all module .prisma files into the base schema.prisma in targetDir.
 *
 * @param {object[]} manifests - ordered module manifests from resolver
 * @param {string} modulesDir - absolute path to /modules
 * @param {string} targetDir - absolute path to the generated system
 */
async function mergePrismaSchemas(manifests, modulesDir, targetDir) {
  const schemaPath = path.join(targetDir, "prisma", "schema.prisma");

  if (!(await fs.pathExists(schemaPath))) {
    console.log("  ℹ️  No base schema.prisma found — skipping Prisma merge.");
    return;
  }

  const baseSchema = await fs.readFile(schemaPath, "utf-8");
  const existingModels = extractModelNames(baseSchema);
  const existingEnums = extractEnumNames(baseSchema);

  let additions = "";

  for (const manifest of manifests) {
    const prismaDir = path.join(modulesDir, manifest.name, "prisma");

    if (!(await fs.pathExists(prismaDir))) continue;

    const files = (await fs.readdir(prismaDir)).filter((f) =>
      f.endsWith(".prisma")
    );

    for (const file of files) {
      const filePath = path.join(prismaDir, file);
      const content = await fs.readFile(filePath, "utf-8");

      // Check for model conflicts
      for (const model of extractModelNames(content)) {
        if (existingModels.has(model)) {
          throw new Error(
            `Prisma conflict: Model "${model}" from module "${manifest.name}" ` +
            `(${file}) already exists in the schema.\n` +
            `  Rename the model in one of the modules to resolve this.`
          );
        }
        existingModels.add(model);
      }

      // Check for enum conflicts
      for (const en of extractEnumNames(content)) {
        if (existingEnums.has(en)) {
          throw new Error(
            `Prisma conflict: Enum "${en}" from module "${manifest.name}" ` +
            `(${file}) already exists in the schema.\n` +
            `  Rename the enum in one of the modules to resolve this.`
          );
        }
        existingEnums.add(en);
      }

      additions += `\n// -- Module: ${manifest.name} (${file}) --\n`;
      additions += content.trim() + "\n";
    }
  }

  if (additions) {
    await fs.appendFile(schemaPath, "\n" + additions);
    console.log("  ✅ Prisma schemas merged successfully.");
  } else {
    console.log("  ℹ️  No Prisma models to merge.");
  }
}

module.exports = { mergePrismaSchemas };
