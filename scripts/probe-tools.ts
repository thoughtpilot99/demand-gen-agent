import { listTools } from "../src/metadata.js";

/**
 * Lists the tools your MetadataONE tenant exposes over MCP, so you can set the
 * exact write-tool names in .env (MCP_TOOL_PAUSE, MCP_TOOL_SET_BID, etc.).
 *
 *   npm run probe
 */
const tools = await listTools();
console.log(`\nMetadataONE exposes ${tools.length} tools:\n`);
for (const t of tools) {
  const desc = t.description ? "  :  " + t.description.split("\n")[0] : "";
  console.log(`  ${t.name}${desc}`);
}
console.log("");
process.exit(0);
