import type { ConfigEnv, UserConfig } from "vite";
import viteConfig from "../vite.config";

const configFactory = viteConfig as (env: ConfigEnv) => UserConfig;
const previous = process.env.VITE_OLYMPUS_ENV;

try {
  const key = "import.meta.env.VITE_OLYMPUS_ENV";
  const config = (command: "serve" | "build") => configFactory({
    command,
    mode: command === "serve" ? "development" : "production",
    isSsrBuild: false,
    isPreview: false,
  });

  for (const value of ["dev", "", "DEV", "Dev", " dev ", "development"]) {
    process.env.VITE_OLYMPUS_ENV = value;
    if (config("serve").define?.[key] !== JSON.stringify(value)) {
      throw new Error(`Vite serve mode changed the explicit environment value ${JSON.stringify(value)}`);
    }
  }
  delete process.env.VITE_OLYMPUS_ENV;
  if (config("serve").define?.[key] !== JSON.stringify("")) {
    throw new Error("Vite serve mode did not default a missing environment to empty");
  }
  process.env.VITE_OLYMPUS_ENV = "dev";
  if (config("build").define?.[key] !== JSON.stringify("")) {
    throw new Error("Vite production build inherited a poisoned dev environment");
  }
} finally {
  if (previous === undefined) delete process.env.VITE_OLYMPUS_ENV;
  else process.env.VITE_OLYMPUS_ENV = previous;
}
