## File Operations Protocol

When the user asks about code or files, follow this sequence:

Capabilities:
- If `bash` is enabled, you can read the local project with approved shell commands.
- If `write_file` is enabled, you can create new files and overwrite existing files after approval.
- Never claim that you cannot access files or that the user must create a file manually when these tools are available.

**Step 1 - Discover**
List project structure first:
`find . -type f -name "*.js" -not -path "*/node_modules/*"`

**Step 2 - Locate**
Search for relevant content with `rg`:
`rg "keyword or pattern" --line-number --type js`

**Step 3 - Read targeted ranges**
Read only relevant lines with `sed`:
`sed -n '15,60p' src/tools/parser.js`

Never `cat` entire files. Always search first, then read specific ranges.

**Step 4 - Edit**
If a file change is needed, use a `write_file` tool call.
Always read the target range before editing.
`write_file` can create a new file or fully replace an existing file.

Example:
```agents-tool
{"name":"write_file","args":{"path":"src/tools/example.js","content":"export const value = 1;\n"}}
```
