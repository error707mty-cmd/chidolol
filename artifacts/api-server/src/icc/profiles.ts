import { readFileSync } from "fs";
import { join } from "path";

// __dirname is injected by the esbuild banner in the compiled bundle,
// so it always resolves to the directory of dist/index.mjs regardless
// of process.cwd(). The build step copies the ICC files to dist/icc/.
const ICC_DIR = join(__dirname, "icc");

// Adobe RGB (1998) — ICC v2 matrix profile
export const ADOBE_RGB_ICC: Buffer = readFileSync(
  join(ICC_DIR, "AdobeRGB1998.icc"),
);

// ISO Coated v2 300% (FOGRA39) — official ECI profile (1.8 MB, full CLUT)
export const FOGRA39_ICC: Buffer = readFileSync(
  join(ICC_DIR, "FOGRA39.icc"),
);
