// generator/resolver.js
// Reads module.json manifests, builds dependency graph,
// detects missing deps, returns full ordered install list.

const fs = require("fs-extra");
const path = require("path");

/**
 * Resolves the full ordered list of modules to install,
 * including any transitive dependencies.
 *
 * @param {string[]} selectedModules - modules passed in by the user
 * @param {string} modulesDir - absolute path to /modules
 * @returns {Promise<object[]>} - ordered array of module manifests
 */
async function resolveDependencies(selectedModules, modulesDir) {
  const resolved = [];
  const visited = new Set();

  async function resolve(moduleName, requestedBy = null) {
    if (visited.has(moduleName)) return;
    visited.add(moduleName);

    const manifestPath = path.join(modulesDir, moduleName, "module.json");

    // Module folder exists but no manifest yet
    const moduleDirExists = await fs.pathExists(path.join(modulesDir, moduleName));
    if (!moduleDirExists) {
      const hint = requestedBy
        ? `  Required by: "${requestedBy}"`
        : `  Check the /modules directory for available modules.`;
      throw new Error(`Module "${moduleName}" not found in /modules.\n${hint}`);
    }

    if (!(await fs.pathExists(manifestPath))) {
      // Gracefully handle modules without a manifest yet —
      // warn but continue with an empty manifest
      console.warn(
        `  ⚠️  Module "${moduleName}" has no module.json — skipping dependency check.`
      );
      resolved.push({
        name: moduleName,
        version: "unknown",
        requires: [],
        provides: [],
        envVars: [],
        npmDeps: { dependencies: {}, devDependencies: {} },
      });
      return;
    }

    const manifest = await fs.readJson(manifestPath);
    manifest.name = manifest.name || moduleName;

    // Resolve dependencies depth-first so deps are installed before dependents
    for (const dep of manifest.requires || []) {
      if (!selectedModules.includes(dep)) {
        throw new Error(
          `Module "${moduleName}" requires "${dep}" but it was not included.\n` +
          `  Fix: npm run create-system <name> ${dep} ${moduleName} [other modules...]`
        );
      }
      await resolve(dep, moduleName);
    }

    resolved.push(manifest);
  }

  for (const mod of selectedModules) {
    await resolve(mod);
  }

  return resolved;
}

module.exports = { resolveDependencies };
