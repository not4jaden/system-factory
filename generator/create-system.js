const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");

const systemName = process.argv[2];
const modules = process.argv.slice(3);

const templateDir = path.join(__dirname, "..", "core-template");
const targetDir = path.join(__dirname, "..", "generated-systems", systemName);

async function createSystem() {

  console.log("Creating system...");

  await fs.copy(templateDir, targetDir, {
  overwrite: true
});

  
  let dependencies = new Set();
  let devDependencies = new Set();
  let prismaModels = "";
  
  for (const moduleName of modules) {
      
      const moduleDir = path.join(__dirname, "..", "modules", moduleName);
      
      if (await fs.pathExists(moduleDir)) {
          
          console.log(`Installing module: ${moduleName}`);
          await fs.copy(moduleDir, targetDir, {
          overwrite: true,
          filter: (src) => {
            const blocked = [
              "package.json",
              "package-lock.json",
              "next.config",
              "tsconfig",
              ".next"
            ];
          
          return !blocked.some(item => src.includes(item));
        }
        });
        

      // Read module package.json
      const pkgPath = path.join(moduleDir, "package.json");

      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath);

        if (pkg.dependencies) {
          Object.keys(pkg.dependencies).forEach(dep => dependencies.add(dep));
        }

        if (pkg.devDependencies) {
          Object.keys(pkg.devDependencies).forEach(dep => devDependencies.add(dep));
        }
      }

      // Merge Prisma schemas
      const prismaPath = path.join(moduleDir, "prisma");

      if (await fs.pathExists(prismaPath)) {
        const files = await fs.readdir(prismaPath);

        for (const file of files) {
          const content = await fs.readFile(path.join(prismaPath, file), "utf-8");
          prismaModels += "\n" + content;
        }
      }

    } else {
      console.log(`Module not found: ${moduleName}`);
    }
  }

  // Merge Prisma into main schema
  const mainSchemaPath = path.join(targetDir, "prisma", "schema.prisma");

  if (await fs.pathExists(mainSchemaPath)) {
    let baseSchema = await fs.readFile(mainSchemaPath, "utf-8");

    baseSchema += "\n" + prismaModels;

    await fs.writeFile(mainSchemaPath, baseSchema);
  }

  console.log("Installing dependencies...");

  process.chdir(targetDir);

  if (dependencies.size > 0) {
    execSync(`npm install ${Array.from(dependencies).join(" ")}`, { stdio: "inherit" });
  }

  if (devDependencies.size > 0) {
    execSync(`npm install -D ${Array.from(devDependencies).join(" ")}`, { stdio: "inherit" });
  }

  console.log("Running Prisma setup...");

  try {
    execSync("npx prisma generate", { stdio: "inherit" });
  } catch (e) {
    console.log("Prisma generate skipped (no schema yet)");
  }

  console.log(`\n✅ System "${systemName}" ready!`);
}

createSystem();
