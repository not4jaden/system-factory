// generator/create-system.js
// System Factory — Generator Engine v2.0
//
// Improvements over v1:
//  ✅ Module manifest system (module.json)
//  ✅ Dependency resolver (no silent missing deps)
//  ✅ Safe Prisma merging (conflict detection)
//  ✅ Temp directory + rollback on failure
//  ✅ Post-generation validation
//  ✅ Auto .env generation from manifests
//  ✅ system.json written to every generated system
//  ✅ Hardened secret handling (no hardcoded keys)

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");

const { resolveDependencies } = require("./resolver");
const { mergePrismaSchemas } = require("./prisma-merger");
const { validateSystem } = require("./validator");
const { generateEnvFile } = require("./env-generator");

// ─── Args ────────────────────────────────────────────────────────────────────

const systemName = process.argv[2];
const selectedModules = process.argv.slice(3);

if (!systemName) {
  console.error("❌ Usage: npm run create-system <system-name> [modules...]");
  console.error("   Example: npm run create-system clinic auth booking");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(systemName)) {
  console.error(
    `❌ System name "${systemName}" is invalid.\n` +
    `   Use lowercase letters, numbers, and hyphens only.`
  );
  process.exit(1);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const rootDir = path.join(__dirname, "..");
const templateDir = path.join(rootDir, "core-template");
const modulesDir = path.join(rootDir, "modules");
const outputDir = path.join(rootDir, "generated-systems", systemName);

// Temp dir lives in OS temp — cleaned up on failure
const tempDir = path.join(
  os.tmpdir(),
  `system-factory-${systemName}-${Date.now()}`
);

// ─── Main ────────────────────────────────────────────────────────────────────

async function createSystem() {
  console.log(`\n🏭 System Factory — Building "${systemName}"`);
  console.log(`   Modules: ${selectedModules.length > 0 ? selectedModules.join(", ") : "(none)"}`);
  console.log(`   Output:  generated-systems/${systemName}\n`);

  // Guard: don't overwrite an existing system without confirmation
  if (await fs.pathExists(outputDir)) {
    console.error(
      `❌ System "${systemName}" already exists at generated-systems/${systemName}.\n` +
      `   Delete it first or choose a different name.`
    );
    process.exit(1);
  }

  // Guard: template must exist
  if (!(await fs.pathExists(templateDir))) {
    console.error(
      `❌ core-template not found at: ${templateDir}\n` +
      `   Make sure the core-template directory exists in your factory root.`
    );
    process.exit(1);
  }

  let manifests = [];

  try {
    // ── Step 1: Resolve module dependencies ────────────────────────────────
    if (selectedModules.length > 0) {
      console.log("📦 Resolving module dependencies...");
      manifests = await resolveDependencies(selectedModules, modulesDir);
      console.log(
        `  ✅ Resolved: ${manifests.map((m) => m.name).join(" → ")}\n`
      );
    }

    // ── Step 2: Copy template into temp directory ──────────────────────────
    console.log("📂 Copying core template...");
    await fs.copy(templateDir, tempDir, { overwrite: true });
    console.log("  ✅ Template copied.\n");

    // ── Step 3: Copy modules (safe — never overwrite core files) ──────────
    const BLOCKED = [
      "package.json",
      "package-lock.json",
      "next.config",
      "tsconfig",
      ".next",
      "module.json",   // manifests stay in /modules, not in generated system
    ];

    for (const manifest of manifests) {
      const moduleDir = path.join(modulesDir, manifest.name);
      console.log(`🧩 Installing module: ${manifest.name}`);

      await fs.copy(moduleDir, tempDir, {
        overwrite: true,
        filter: (src) => !BLOCKED.some((blocked) => src.includes(blocked)),
      });

      console.log(`  ✅ ${manifest.name} files copied.`);
    }

    if (manifests.length > 0) console.log("");

    // ── Step 4: Merge Prisma schemas ───────────────────────────────────────
    console.log("🗄️  Merging Prisma schemas...");
    await mergePrismaSchemas(manifests, modulesDir, tempDir);
    console.log("");

    // ── Step 5: Collect and install npm dependencies ───────────────────────
    console.log("📥 Installing npm dependencies...");

    const dependencies = new Set();
    const devDependencies = new Set();

    for (const manifest of manifests) {
      const deps = manifest.npmDeps?.dependencies || {};
      const devDeps = manifest.npmDeps?.devDependencies || {};
      Object.keys(deps).forEach((d) => dependencies.add(d));
      Object.keys(devDeps).forEach((d) => devDependencies.add(d));
    }

    // Install in temp directory
    execSync("npm install", { cwd: tempDir, stdio: "inherit" });

    if (dependencies.size > 0) {
      execSync(
        `npm install ${Array.from(dependencies).join(" ")}`,
        { cwd: tempDir, stdio: "inherit" }
      );
    }

    if (devDependencies.size > 0) {
      execSync(
        `npm install -D ${Array.from(devDependencies).join(" ")}`,
        { cwd: tempDir, stdio: "inherit" }
      );
    }

    console.log("\n  ✅ Dependencies installed.\n");

    // ── Step 6: Generate .env from manifests ──────────────────────────────
    console.log("🔐 Generating environment files...");
    await generateEnvFile(manifests, tempDir, systemName);
    console.log("");

    // ── Step 7: Run Prisma generate ────────────────────────────────────────
    console.log("⚙️  Running Prisma generate...");
    try {
      execSync("npx prisma generate", { cwd: tempDir, stdio: "inherit" });
      console.log("  ✅ Prisma client generated.\n");
    } catch {
      console.warn("  ⚠️  Prisma generate failed — run it manually after setup.\n");
    }

    // ── Step 8: Write system manifest ─────────────────────────────────────
    const systemManifest = {
      name: systemName,
      factoryVersion: "2.0.0",
      modules: manifests.map((m) => m.name),
      createdAt: new Date().toISOString(),
      schemaHash: crypto
        .createHash("md5")
        .update(
          await fs
            .readFile(path.join(tempDir, "prisma", "schema.prisma"), "utf-8")
            .catch(() => "")
        )
        .digest("hex"),
    };

    await fs.writeJson(
      path.join(tempDir, "system.json"),
      systemManifest,
      { spaces: 2 }
    );
    console.log("  ✅ system.json written.\n");

    // ── Step 9: Validate ───────────────────────────────────────────────────
    await validateSystem(tempDir);

    // ── Step 10: Move to final destination (only on full success) ──────────
    console.log("🚀 Finalising...");
    await fs.move(tempDir, outputDir);

    // ─────────────────────────────────────────────────────────────────────
    console.log(`\n✅ System "${systemName}" is ready!\n`);
    console.log(`   📁 Location:  generated-systems/${systemName}`);
    console.log(`   🗄️  Database:  ${systemName}_db (update .env if needed)`);
    console.log(`\n   Next steps:`);
    console.log(`   1. cd generated-systems/${systemName}`);
    console.log(`   2. Review and update .env`);
    console.log(`   3. npx prisma migrate dev --name init`);
    console.log(`   4. npm run dev`);
    console.log(`   5. Open http://localhost:3000\n`);

  } catch (err) {
    // ── Rollback: clean up temp directory on any failure ──────────────────
    console.error(`\n❌ Generation failed: ${err.message}\n`);
    await fs.remove(tempDir).catch(() => {});
    console.log("🧹 Cleaned up temp files.");
    process.exit(1);
  }
}

createSystem();
