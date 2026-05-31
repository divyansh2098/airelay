import { Tool } from "../types.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { runBashTool } from "./run-bash.js";

export const fsTools: Tool[] = [readFileTool, writeFileTool, editFileTool];
export const bashTools: Tool[] = [runBashTool];
export const allDefaultTools: Tool[] = [...fsTools, ...bashTools];
