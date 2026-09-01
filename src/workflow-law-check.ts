import { resolve } from "node:path";
import { loadAndValidateWorkflowLaw } from "./workflow-law.ts";

const root = resolve(import.meta.dir, "..");
const result = loadAndValidateWorkflowLaw(root);

if (result.diagnostics.length > 0) {
  for (const item of result.diagnostics) {
    const source = item.sourceRef === undefined
      ? ""
      : ` [${item.sourceRef.path}#${item.sourceRef.heading}]`;
    console.error(`${item.code}: ${item.message}${source}`);
  }
  process.exitCode = 1;
} else {
  console.log("workflow law: valid");
}
